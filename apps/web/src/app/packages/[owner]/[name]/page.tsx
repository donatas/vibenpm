import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import catalogData from "@/generated/packages.json";
import type { CatalogPackage } from "@/lib/types";

const packages = catalogData as CatalogPackage[];

type PageProps = {
  params: Promise<{ owner: string; name: string }>;
};

function findPackage(owner: string, name: string) {
  return packages.find((item) => item.owner === owner && item.name === name);
}

function sourceUrl(owner: string, name: string, file: string) {
  const encodedPath = file.split("/").map(encodeURIComponent).join("/");
  return `/packages/${owner}/${name}/source/${encodedPath}`;
}

export function generateStaticParams() {
  return packages.map(({ owner, name }) => ({ owner, name }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner, name } = await params;
  const item = findPackage(owner, name);
  return {
    title: item ? `${item.name} by ${item.owner}` : "Package not found",
    description: item?.versions[0].description,
  };
}

export default async function PackagePage({ params }: PageProps) {
  const { owner, name } = await params;
  const item = findPackage(owner, name);
  if (!item) notFound();

  const latest = item.versions[0];
  const primarySource = latest.entrypoints[0] ?? latest.files[0];

  return (
    <div className="page-shell">
      <Link className="back-link" href="/">← Back to packages</Link>
      <p className="eyebrow">@{item.owner} · v{latest.version}</p>
      <h1 className="detail-title">{item.name}</h1>
      <p className="detail-summary">{latest.description ?? "A community JavaScript package."}</p>
      <div className="detail-actions">
        {primarySource && (
          <Link className="button" href={sourceUrl(item.owner, item.name, primarySource)}>View source</Link>
        )}
        {latest.homepage && <a className="button secondary" href={latest.homepage} rel="noreferrer">Homepage ↗</a>}
      </div>

      <div className="notice">
        <strong>Untrusted community code.</strong> vibenpm lists this package but does not execute,
        audit, or endorse it. Inspect the source before using it.
      </div>

      <div className="detail-grid">
        <div>
          <section className="panel">
            <h2>README.md</h2>
            <div className="readme">{latest.readme ?? "This package does not include a README."}</div>
          </section>
        </div>
        <aside>
          <section className="panel">
            <h2>Package facts</h2>
            <dl className="facts">
              <div><dt>Owner</dt><dd>@{latest.owner.name}</dd></div>
              <div><dt>Latest</dt><dd>{latest.version}</dd></div>
              <div><dt>Versions</dt><dd>{item.versions.map(({ version }) => version).join(", ")}</dd></div>
              {latest.license && <div><dt>License</dt><dd>{latest.license}</dd></div>}
              <div><dt>Entrypoints</dt><dd>{latest.entrypoints.join(", ") || "Not specified"}</dd></div>
            </dl>
          </section>
          <section className="panel" style={{ marginTop: 18 }}>
            <h2>Files</h2>
            <ul className="file-list">
              {latest.files.map((file) => (
                <li key={file}>
                  <Link href={sourceUrl(item.owner, item.name, file)}>{file}</Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
