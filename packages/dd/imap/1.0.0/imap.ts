/**
 * IMAP over implicit TLS (port 993). Cloudflare Workers get cloudflare:sockets;
 * local `wix dev` gets node:tls. AUTHENTICATE PLAIN is sent only after the
 * server greeting is actually read from the same socket.
 */

export type ImapMessage = {
  uid: string;
  seen: boolean;
  from: string;
  fromName: string;
  subject: string;
  body: string;
};

export type ImapConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

type Conn = {
  write: (data: string) => Promise<void>;
  readLine: () => Promise<string>;
  readExact: (n: number) => Promise<string>;
  close: () => Promise<void>;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CONNECT_MS = 8_000;
const IO_MS = 10_000;
const SESSION_MS = 25_000;
const MAX_MESSAGES = 40;
const PROCESSED_FLAG = '$WixEmailCRM';
const BODY_PEEK_BYTES = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isCloudflareWorker(): boolean {
  return typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function plainAuthToken(user: string, pass: string): string {
  return toBase64(encoder.encode(`\0${user}\0${pass}`));
}

function byteIndexOf(haystack: Uint8Array, needle: number): number {
  for (let i = 0; i < haystack.length; i++) {
    if (haystack[i] === needle) return i;
  }
  return -1;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a);
  merged.set(b, a.length);
  return merged;
}

function connFromByteReader(
  readChunk: () => Promise<Uint8Array | null>,
  writeBytes: (data: Uint8Array) => Promise<void>,
  closeFn: () => Promise<void>,
): Conn {
  let leftover = new Uint8Array();

  const readMore = async (): Promise<boolean> => {
    const value = await readChunk();
    if (!value || value.length === 0) return false;
    leftover = concatBytes(leftover, value);
    return true;
  };

  return {
    write: (data) => withTimeout(writeBytes(encoder.encode(data)), IO_MS, 'IMAP write'),
    readLine: () =>
      withTimeout(
        (async () => {
          while (true) {
            const idx = byteIndexOf(leftover, 0x0a);
            if (idx !== -1) {
              let end = idx;
              if (end > 0 && leftover[end - 1] === 0x0d) end -= 1;
              const line = decoder.decode(leftover.slice(0, end));
              leftover = leftover.slice(idx + 1);
              return line;
            }
            const more = await readMore();
            if (!more) {
              const text = decoder.decode(leftover);
              leftover = new Uint8Array();
              return text;
            }
          }
        })(),
        IO_MS,
        'IMAP read',
      ),
    readExact: (n) =>
      withTimeout(
        (async () => {
          while (leftover.length < n) {
            const more = await readMore();
            if (!more) break;
          }
          const chunk = leftover.slice(0, n);
          leftover = leftover.slice(n);
          return decoder.decode(chunk);
        })(),
        IO_MS,
        'IMAP literal read',
      ),
    close: closeFn,
  };
}

async function openCloudflareTls(host: string, port: number): Promise<Conn> {
  const { connect } = await import('cloudflare:sockets');
  const socket = connect({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: true });
  await withTimeout(Promise.resolve(socket.opened), CONNECT_MS, `IMAP TLS connect ${host}:${port}`);

  const reader = socket.readable.getReader();
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;

  const getWriter = async () => {
    if (!writer) {
      writer = socket.writable.getWriter();
      await writer.ready;
    }
    return writer;
  };

  return connFromByteReader(
    async () => {
      const { value, done } = await reader.read();
      if (done || !value) return null;
      return value;
    },
    async (data) => {
      const w = await getWriter();
      await w.ready;
      await w.write(data);
    },
    async () => {
      try {
        if (writer) await writer.close();
      } catch {
        // ignore
      }
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      try {
        await socket.close();
      } catch {
        // ignore
      }
    },
  );
}

async function openNodeTls(host: string, port: number): Promise<Conn> {
  const tls = await import('node:tls');
  const sock = tls.connect({ host, port, servername: host, timeout: CONNECT_MS });
  const pending: Uint8Array[] = [];
  let notify: (() => void) | undefined;
  sock.on('data', (chunk: Buffer) => {
    pending.push(new Uint8Array(chunk));
    notify?.();
  });

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      sock.once('secureConnect', () => resolve());
      sock.once('error', reject);
      sock.once('timeout', () => reject(new Error(`IMAP TLS connect ${host}:${port} timed out`)));
    }),
    CONNECT_MS,
    `IMAP TLS connect ${host}:${port}`,
  );
  sock.setTimeout(IO_MS);

  return connFromByteReader(
    () =>
      new Promise((resolve, reject) => {
        if (pending.length) {
          resolve(pending.shift() ?? null);
          return;
        }
        const onEnd = () => resolve(null);
        const onErr = (err: Error) => reject(err);
        const onTimeout = () => reject(new Error('IMAP socket idle timeout'));
        notify = () => {
          sock.off('end', onEnd);
          sock.off('error', onErr);
          sock.off('timeout', onTimeout);
          resolve(pending.shift() ?? null);
        };
        sock.once('end', onEnd);
        sock.once('error', onErr);
        sock.once('timeout', onTimeout);
      }),
    (data) =>
      new Promise<void>((resolve, reject) => {
        sock.write(Buffer.from(data), (err) => (err ? reject(err) : resolve()));
      }),
    async () => {
      sock.end();
    },
  );
}

async function openTlsSocket(host: string, port: number): Promise<Conn> {
  if (isCloudflareWorker()) return openCloudflareTls(host, port);
  return openNodeTls(host, port);
}

async function readImapLine(conn: Conn): Promise<string> {
  let collected = '';
  let line = await conn.readLine();
  while (true) {
    const literal = line.match(/\{(\d+)\}\s*$/);
    collected += (collected ? '\n' : '') + line;
    if (!literal) return collected;
    const payload = await conn.readExact(Number(literal[1]));
    collected += `\n${payload}`;
    line = await conn.readLine();
  }
}

async function expectOk(conn: Conn, tag: string): Promise<string[]> {
  const lines: string[] = [];
  while (true) {
    const line = await readImapLine(conn);
    if (!line) throw new Error(`IMAP ${tag}: connection closed`);
    lines.push(line);
    if (line.startsWith(`${tag} OK`)) return lines;
    if (line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
      throw new Error(`IMAP ${tag} failed: ${line}`);
    }
  }
}

async function authenticate(conn: Conn, user: string, pass: string): Promise<void> {
  const token = plainAuthToken(user, pass);
  await conn.write(`A1 AUTHENTICATE PLAIN ${token}\r\n`);
  const first = await readImapLine(conn);
  if (first.startsWith('+')) {
    await conn.write(`${token}\r\n`);
    await expectOk(conn, 'A1');
    return;
  }
  if (first.startsWith('A1 NO') || first.startsWith('A1 BAD')) {
    throw new Error(`IMAP auth failed: ${first}`);
  }
  if (first.startsWith('A1 OK')) return;
  const rest = await expectOk(conn, 'A1');
  rest.unshift(first);
}

function parseFrom(header: string): { from: string; fromName: string } {
  const match = header.match(/^From:\s*(.*)$/im);
  const raw = (match?.[1] ?? '').trim();
  const angled = raw.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>/);
  if (angled) {
    return { fromName: (angled[1] || angled[2]).trim(), from: angled[2].trim() };
  }
  const email = raw.match(/[\w.+-]+@[\w.-]+/);
  return { from: email?.[0] ?? raw, fromName: raw };
}

function parseSubject(header: string): string {
  const match = header.match(/^Subject:\s*(.*)$/im);
  return (match?.[1] ?? '(no subject)').trim();
}

function stripBody(raw: string): string {
  return raw
    .replace(/=\r?\n/g, '')
    .replace(/=[0-9A-Fa-f]{2}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function parseFetchBlocks(lines: string[]): ImapMessage[] {
  const blob = lines.join('\n');
  const messages: ImapMessage[] = [];
  const chunks = blob.split(/\n\* \d+ FETCH /i).slice(1);

  for (const chunk of chunks) {
    const uid = chunk.match(/\bUID\s+(\d+)/i)?.[1] ?? '';
    const seen = /\\Seen\b/i.test(chunk);
    const headerMatch = chunk.match(
      /BODY\[HEADER(?:\.FIELDS \([^)]+\))?\]\s*(?:\{\d+\}\s*)?([\s\S]*?)(?=BODY\[TEXT\]|$)/i,
    );
    const textMatch = chunk.match(
      /BODY\[TEXT\](?:<[^>]+>)?\s*(?:\{\d+\}\s*)?([\s\S]*?)(?=\n\)\s*$|\n\* |\nA\d+ |$)/i,
    );
    const header = headerMatch?.[1] ?? chunk;
    const { from, fromName } = parseFrom(header);
    messages.push({
      uid,
      seen,
      from,
      fromName,
      subject: parseSubject(header),
      body: stripBody(textMatch?.[1] ?? ''),
    });
  }

  return messages;
}

function parseSearchUids(lines: string[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\* SEARCH\s*(.*)$/i);
    if (!match) continue;
    const rest = match[1].trim();
    if (!rest) continue;
    for (const token of rest.split(/\s+/)) {
      if (/^\d+$/.test(token)) ids.push(token);
    }
  }
  return ids;
}

async function withImapSession<T>(
  config: ImapConfig,
  work: (conn: Conn, setStage: (stage: string) => void) => Promise<T>,
): Promise<T> {
  let conn: Conn | undefined;
  let stage = 'connect';
  const setStage = (next: string) => {
    stage = next;
  };

  const session = async (): Promise<T> => {
    conn = await openTlsSocket(config.host, config.port);

    setStage('greeting');
    const greeting = await readImapLine(conn);
    if (!/^\* (OK|PREAUTH)/i.test(greeting)) {
      throw new Error(`Unexpected IMAP greeting: ${greeting.slice(0, 180)}`);
    }

    setStage('authenticate');
    await authenticate(conn, config.user, config.pass);

    const result = await work(conn, setStage);

    setStage('logout');
    await conn.write('A9 LOGOUT\r\n').catch(() => undefined);
    return result;
  };

  try {
    return await withTimeout(session(), SESSION_MS, 'IMAP session');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`IMAP failed at ${stage}: ${message}`);
  } finally {
    await conn?.close().catch(() => undefined);
  }
}

async function searchUnseenUids(conn: Conn, setStage: (stage: string) => void): Promise<string[]> {
  setStage('search');
  await conn.write('A3 UID SEARCH UNSEEN\r\n');
  const searchLines = await expectOk(conn, 'A3');
  return parseSearchUids(searchLines);
}

export async function fetchMailboxEmails(config: ImapConfig): Promise<ImapMessage[]> {
  return withImapSession(config, async (conn, setStage) => {
    setStage('select');
    await conn.write('A2 SELECT INBOX\r\n');
    const selectLines = await expectOk(conn, 'A2');
    const existsLine = selectLines.find((line) => /\bEXISTS\b/.test(line));
    const exists = Number(existsLine?.match(/(\d+)\s+EXISTS/i)?.[1] ?? 0);
    if (exists === 0) return [];

    const uids = (await searchUnseenUids(conn, setStage)).slice(-MAX_MESSAGES);
    if (!uids.length) return [];

    setStage('fetch');
    await conn.write(
      `A4 UID FETCH ${uids.join(',')} (UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)] BODY.PEEK[TEXT]<0.${BODY_PEEK_BYTES}>)\r\n`,
    );
    const fetchLines = await expectOk(conn, 'A4');
    return parseFetchBlocks(fetchLines).filter((msg) => !msg.seen);
  });
}

export async function markEmailsSeen(config: ImapConfig, uids: string[]): Promise<void> {
  const unique = [...new Set(uids.filter(Boolean))];
  if (!unique.length) return;

  await withImapSession(config, async (conn, setStage) => {
    setStage('select');
    await conn.write('A2 SELECT INBOX\r\n');
    await expectOk(conn, 'A2');
    setStage('store');
    await conn.write(`A4 UID STORE ${unique.join(',')} +FLAGS.SILENT (\\Seen)\r\n`);
    await expectOk(conn, 'A4');
    try {
      await conn.write(`A5 UID STORE ${unique.join(',')} +FLAGS.SILENT (${PROCESSED_FLAG})\r\n`);
      await expectOk(conn, 'A5');
    } catch {
      // Custom keyword is optional; \Seen is what later runs filter on.
    }
  });
}
