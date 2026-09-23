import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import catalogData from "@/generated/packages.json";
import type { CatalogPackage } from "@/lib/types";

const packages = catalogData as CatalogPackage[];
const repositoryRoot = resolve(process.cwd(), "../..");

type PageProps = {
  params: Promise<{ owner: string; name: string; path: string[] }>;
};

function findPackage(owner: string, name: string) {
  return packages.find((item) => item.owner === owner && item.name === name);
}

export function generateStaticParams() {
  return packages.flatMap((item) =>
    item.versions[0].files.map((file) => ({
      owner: item.owner,
      name: item.name,
      path: file.split("/"),
    })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner, name, path } = await params;
  return { title: `${path.join("/")} · ${owner}/${name}` };
}

export default async function SourcePage({ params }: PageProps) {
  const { owner, name, path } = await params;
  const item = findPackage(owner, name);
  const file = path.join("/");
  const latest = item?.versions[0];
  if (!item || !latest || !latest.files.includes(file)) notFound();

  const releaseRoot = resolve(repositoryRoot, latest.packagePath);
  const filePath = resolve(releaseRoot, file);
  if (!filePath.startsWith(`${releaseRoot}${sep}`)) notFound();

  let source: string;
  try {
    source = readFileSync(filePath, "utf8");
  } catch {
    notFound();
  }

  return (
    <div className="page-shell">
      <Link className="back-link" href={`/packages/${owner}/${name}`}>
        ← Back to {name}
      </Link>
      <p className="eyebrow">{owner}/{name} · v{latest.version}</p>
      <h1 className="source-title">{file}</h1>
      <div className="notice">
        <strong>Read-only source view.</strong> This community-submitted file is displayed as text
        and is never executed by vibenpm.
      </div>
      <pre className="source-code"><code>{source}</code></pre>
    </div>
  );
}
