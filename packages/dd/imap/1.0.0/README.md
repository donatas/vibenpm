# imap

A focused TypeScript IMAP client for reading unseen messages over implicit TLS and marking messages
as seen. It supports Cloudflare Workers through `cloudflare:sockets` and Node.js through `node:tls`.

## API

```ts
import { fetchMailboxEmails, markEmailsSeen } from "./imap";

const config = {
  host: "imap.example.com",
  port: 993,
  user: "mailbox@example.com",
  pass: process.env.IMAP_PASSWORD!,
};

const messages = await fetchMailboxEmails(config);
await markEmailsSeen(config, messages.map(({ uid }) => uid));
```

Exports:

- `fetchMailboxEmails(config)` fetches up to 40 unseen inbox messages.
- `markEmailsSeen(config, uids)` marks messages as `\Seen` and attempts to add `$WixEmailCRM`.
- `ImapConfig` and `ImapMessage` TypeScript types.

## Runtime notes

- Uses `AUTHENTICATE PLAIN` only after establishing TLS and receiving the server greeting.
- Requires a runtime or bundler that supports either `cloudflare:sockets` or `node:tls`.
- Message parsing is intentionally lightweight and does not fully implement MIME or encoded-word decoding.
- Credentials are accepted at runtime and are never stored by the package.

Package code is community-submitted and has not been executed or security-audited by vibenpm.
