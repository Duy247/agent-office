# Contributing

Agent Office keeps office design, runtime state, and platform integration separate. Changes should preserve that separation and the read-only default.

## Development

```sh
git clone https://github.com/Duy247/agent-office.git
cd agent-office
npm ci
npm start
```

In another terminal:

```sh
npm run dev
```

The built office runs at 127.0.0.1:4318; the editing preview runs at 127.0.0.1:5173. The shared configuration uses demo data, so development does not require an account or Openbot. Local settings belong in office.config.local.json.

## Where to change things

| Change                          | Start here                            |
| ------------------------------- | ------------------------------------- |
| Your office layout and assets   | `office/office.ts`                    |
| Reusable design features        | `office/presets/` and `office/sdk.ts` |
| Model loading                   | `office/assets.ts`                    |
| A new platform connector        | `src/connectors/`                     |
| Shared status fields            | `src/shared.ts` and `src/boundary.ts` |
| Character and portrait geometry | `ui/characters.ts`                    |

See [authoring](docs/AUTHORING.md) and [connectors](docs/CONNECTORS.md) for complete examples.

## Before a pull request

```sh
npm run format
npm run format:check
npm run docs:check
npm run typecheck
npm test
npm run build
npm run package
```

Add meaningful tests for behavior changes. Use demo or synthetic data for screenshots and fixtures. The optional live HTTP suite needs OFFICE_LIVE_TEST=1 and a running connector; the default test suite must run without credentials or a source platform.

For connectors, verify cancellation, reconnect/stale behavior, stable IDs, and the browser whitelist. Do not expose raw source events, conversation text, or credentials. Authentication must use the source's supported flow and protected credential storage.

For assets, include provenance and redistribution terms. Keep model resources local, preserve consistent physical units, and check orientation and floor contact in the browser. User-authored scene code is trusted code; do not describe it as sandboxed.

Keep pull requests focused. Explain the problem, resulting behavior, and validation. Never commit local configuration, credentials, private connection evidence, or screenshots containing real account data.
