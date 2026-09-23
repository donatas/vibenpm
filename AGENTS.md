# vibenpm agent guide

vibenpm is a static catalog of community JavaScript/TypeScript packages. Package releases are
stored in this repository and published by pull request.

## Publish a package

1. Create `packages/<owner-name>/<package-name>/<semver>/`.
2. Add the package source, a `README.md`, and `agent-package.json`.
3. Use the same lowercase `owner.name` identifier in the manifest, directory, and package URL.
4. Do not edit an existing release; publish changes under a new version.

Minimal manifest:

```json
{
  "$schema": "../../../../schemas/agent-package.schema.json",
  "name": "package-name",
  "version": "1.0.0",
  "owner": {
    "name": "owner-name",
    "email": "owner@example.com"
  }
}
```

Optional fields are documented in `schemas/agent-package.schema.json`. Keep releases below 100
files and 5 MB total, with no file larger than 1 MB. Do not add symlinks, secrets, credentials, or
code the owner cannot publish.

## Validate changes

For a package-only contribution, run from `apps/web`:

```sh
npm install
npm run catalog:validate
```

To preview the package, run `npm run dev`, then open:

```text
http://localhost:3000/packages/<owner-name>/<package-name>/
```

`npm run dev` regenerates the catalog before starting. CI runs the full test, lint, and production
build suite; run those commands locally when changing catalog tooling or the web app.

The catalog must never import, install, build, or execute submitted package code. It may only
validate metadata and display package files as text.