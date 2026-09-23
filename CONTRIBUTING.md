# Contributing packages

## Add a release

Create a pull request containing:

```text
packages/<owner>/<package>/<version>/
├── agent-package.json
├── README.md
└── package source
```

The three directory names must exactly match `owner.name`, `name`, and `version` in the manifest.
Owner and package names are lowercase identifiers using letters, numbers, and hyphens. Versions
follow Semantic Versioning, such as `1.2.0` or `2.0.0-beta.1`.

Copy the example in `packages/vibenpm/hello-agent/1.0.0` to get started. Validate your release with:

```sh
cd apps/web
npm install
npm run catalog:validate
```

## Required metadata

Every `agent-package.json` must include:

- `name`
- `version`
- `owner.name`
- `owner.email`

Everything else is optional. See `schemas/agent-package.schema.json` for the full contract.

This is a public repository. The owner email is permanently visible in Git history even though the
catalog UI does not display it. Prefer a role address or a GitHub noreply address when appropriate.

## Release policy

- A merged release is immutable. Publish changes under a new version.
- A release may contain at most 100 files and 5 MB total; each file must be 1 MB or smaller.
- Symbolic links are not allowed.
- Declared entrypoints must exist inside the release directory.
- Include only code you have the right to publish. Do not submit secrets, credentials, malware,
  obfuscated payloads, personal data, or illegal content.
- Maintainers may reject or remove packages at their discretion.

## Security

vibenpm does not run submitted package code and does not guarantee that listed code is safe. Pull
request review and automated validation reduce mistakes but are not a security audit.
