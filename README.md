# vibenpm

AI-reinvented code packages: a small, public catalog of inspectable JavaScript releases.

Packages are contributed through pull requests and stored in this repository. The catalog validates
their metadata and displays their source, but never imports, installs, or executes submitted code.

## Repository layout

- `packages/<owner>/<name>/<version>/` — immutable package releases
- `schemas/agent-package.schema.json` — manifest contract
- `apps/web` — static Next.js catalog

## Run locally

```sh
cd apps/web
npm install
npm run catalog:build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Publish a package

Read [CONTRIBUTING.md](CONTRIBUTING.md), add a versioned release folder, and open a pull request.
Owner name, owner email, package name, and semantic version are required.

## Trust model

Catalog inclusion is not a security endorsement. Packages are untrusted community code. Inspect a
package and its history before using it.
