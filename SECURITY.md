# Security policy

Agent Office is a local dashboard. Its shipped connectors observe state; they do not submit tasks, answer approvals, or control providers.

## Trust boundaries

- The HTTP server binds to 127.0.0.1 and checks Host, Origin, and request method.
- Every connector output crosses a whitelist before reaching the browser.
- Openbot credentials remain in protected OS storage, outside the repository and browser.
- Source-specific raw events and credentials stay inside their connector.
- Model resources load from local `/assets/` paths. External model resources are rejected.
- Office design code and custom connectors are trusted local code. They are not sandboxed.

Do not expose the server or development preview directly to a network. A reverse proxy, remote authentication layer, and multi-user hosting are outside the current design.

## Reporting

Use GitHub's **Report a vulnerability** option if it is available for the repository. Otherwise, open a minimal issue requesting a private reporting channel, without sensitive details. Never attach real tokens, session files, local configuration, raw conversation events, or account screenshots.

Include the affected version/commit, operating system, connector, and a sanitized reproduction. Use synthetic credentials and data. Do not test against other people's services or accounts.

## Current support

The initial 0.1.x release is a preview. Openbot compatibility is tested against Team API protocol 9 / Openbot 0.64.0. Native sign-in on macOS and Linux still needs platform-specific live validation; the demo and normalized adapter contracts do not require credential access.
