export const metadata = {
  title: "Submit a package",
  description: "Publish a JavaScript package to vibenpm through a pull request.",
};

const manifestExample = `{
  "$schema": "../../../../schemas/agent-package.schema.json",
  "name": "your-package",
  "version": "1.0.0",
  "owner": {
    "name": "your-name",
    "email": "packages@example.com",
    "url": "https://example.com"
  },
  "description": "What your package does",
  "license": "MIT",
  "keywords": ["useful", "small"],
  "entrypoints": ["index.js"]
}`;

export default function SubmitPage() {
  return (
    <div className="page-shell narrow">
      <p className="eyebrow">Publish through a pull request</p>
      <h1 className="detail-title">Bring your own package.</h1>
      <p className="detail-summary">
        Releases live in the public repository. Every version is immutable and reviewed before it
        appears in the catalog.
      </p>

      <ol className="steps">
        <li>
          <h2>Create the release folder</h2>
          <p>Use <code>packages/your-name/your-package/1.0.0/</code>. The owner directory must match <code>owner.name</code>. Add the package source, README, and manifest.</p>
        </li>
        <li>
          <h2>Add agent-package.json</h2>
          <p>Owner name, contact email, package name, and a semantic version are required.</p>
          <pre className="example">{manifestExample}</pre>
        </li>
        <li>
          <h2>Open a pull request</h2>
          <p>Automated checks validate the manifest, paths, file limits, and entrypoints. A maintainer reviews the package before merge.</p>
        </li>
      </ol>

      <div className="notice">
        <strong>Email privacy:</strong> manifests are public forever in Git history. Use a role address
        or GitHub noreply address instead of a personal email when appropriate.
      </div>

      <a className="button" href="https://github.com/donatas/vibenpm/compare" rel="noreferrer">
        Start a contribution ↗
      </a>
    </div>
  );
}
