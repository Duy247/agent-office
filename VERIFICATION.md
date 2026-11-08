# Verification

The template separates design code, renderer, normalized connector data and source-specific authentication. It ships with simulated demo data and no saved server/account identity.

Local validation is performed on Windows. macOS/Linux credential-store paths are implemented, and a three-platform CI workflow is included; those operating systems have not been exercised in this local session.

Automated coverage includes:

- Native 3D workstation facing, desk surface height and seated/standing geometry.
- Layout growth to 50 agents, stable desk slots, recreation spacing and unequal group rooms.
- Main/side work, queued/input/approval/takeover/failure states, duplicates, removals and resynchronization.
- Custom asset cloning, nested transforms, degree-based rotation, physical scale and imported GLB geometry.
- Workstation anchors following moved/rotated roots.
- Local-only model paths and rejection of external/traversal URLs.
- Demo labelling/cancellation, third-party connector registration, source privacy whitelists and clean defaults.
- Openbot endpoint/profile validation and protocol/capability checks.
- Optional live HTTP access, SSE and credential/chat filtering checks.

Run npm run typecheck, npm test and npm run build. Set OFFICE_LIVE_TEST=1 while the server is running to include live HTTP tests. The default unit suite does not require Openbot, authentication or OS credential access.

Browser checks cover the built office, custom code-created asset, local GLB loading, editing preview, source labels, agent selection and live source continuity. Private installation-specific connection evidence and screenshots are deliberately excluded from the template export.

## Secondary-server remote connection

Openbot 0.65.0 was tested with an additional desktop-created server whose owner account was rejected by local HTTP authentication. The remote-session transport completed account membership verification, signed DTLS-bound authentication, negotiated Team API reads, agent roster/sidebar discovery and a live runtime snapshot. The office displayed the separate server's existing agent and its own boss configuration. The primary local HTTP connection retained its roster and original boss. Restarting the dashboard connector restored the remote session without another email code, and the published HTTPS dashboard showed the selected secondary server. All 80 Windows tests passed with live HTTP checks enabled; type, format, documentation, build and template-package checks passed.

An actual WebRTC peer test verifies mutual signatures, RPC reads, runtime events and offer-before-ICE ordering. Additional tests reject altered proof bindings, untrusted hosts, unsafe Signal addresses, work-changing requests, unauthorized account operations and malformed/oversized/noncontiguous frames. Protected setup credentials permit retries without another email code; tokens and raw payloads remain outside browser responses and logs.

## Team sidebar

Server switching adds a GET-only server catalog and server-specific state/event subscriptions. Tests cover shared feeds, independent viewers, identical agent IDs on different servers, separate credentials/protocol versions, rejected server IDs/endpoints/profiles, isolated failures and sign-in states, idle feed shutdown, late-event rejection, and concurrent appearance persistence. Browser fixtures cover switching from an agent inspector, rapid switching, failed sign-in, refresh persistence and phone layout. The installed Openbot 0.65.0 default connection was checked live; additional authenticated real servers were not available during validation. All 74 Windows tests passed with live HTTP checks enabled.

The sidebar uses the existing filtered snapshot and event stream. It shows reported activity, queue counts, provider/model, office area, channel membership and last state change. Queue titles and conversation content remain in Openbot. Office area identifies the agent's group, not its current animated position. Stale connections preserve the last reported states.

Windows browser checks covered the live roster, character portraits, selection, camera focus, filtering, attention states, channel membership, changing snapshots, selected-agent removal, empty and stale states, and a 390-pixel phone layout. Automated tests cover filter boundaries, attention sorting, missing activity/timestamps and current group/channel membership. The user also confirmed the earlier live channel meeting behavior in Openbot.

All 66 tests passed on Windows with live HTTP checks enabled. Type checking, formatting, documentation checks and production build passed.

## Performance validation

The park/channel update passed all 61 Windows tests with the live HTTP suite enabled, plus type, format, build and documentation checks. Browser fixtures verified park visits, walking, unique conference seats, the channel-name screen, return after completion, and pause/stale behavior. Authenticated read-only discovery against installed Openbot 0.65.0 confirmed channel-chats-v1 and channel-attention-v1 and a successful channel-summary read. No channels were configured during that check; meeting activity was demonstrated with synthetic data, without creating work or channels in Openbot.

The optimization pass added regression coverage for static batching, rigid character joints, mirrored geometry, material groups, compiled model scale, adaptive resolution and compressed HTTP delivery. Windows live validation passed all 53 tests, type checking and production build. Browser tests covered 3 and 50 working agents, retained geometry, paused rendering, visibility suspension/resume, and production scene/selection/live updates through an explicitly configured HTTPS proxy. See [measured results](docs/PERFORMANCE.md). Installation-specific screenshots and benchmark scratch files remain local.

## Initial template local run

On Windows, all 37 tests passed with the live HTTP suite enabled; type checking and production build passed. The shareable ZIP was extracted into a separate folder, dependencies installed using npm ci, built, and its dependency-free demo source launched on a separate port. The browser explicitly displayed Demo and four sample agents. A JSON-file adapter instance also ran independently and exposed its own normalized agent. The original installation continued using its separately stored Openbot session.

The editor preview was checked on 127.0.0.1:5173: changing office/office.ts automatically reloaded the scene, a local GLB returned HTTP 200, and the from-scratch room replaced the campus without changing the connector. The development API returned 403 for a foreign Origin and 405 for POST. Browser page errors were empty. A final archive audit confirmed local configuration, DPAPI files, private connection evidence, screenshots and installation-specific agent IDs were absent.

macOS/Linux credential backends and the three-platform GitHub workflow remain unexecuted locally. The demo/JSON adapters and their normalized contracts do not require OS credential access.

## GitHub CI

The [initial GitHub Actions run](https://github.com/Duy247/agent-office/actions/runs/42447845420) passed on Ubuntu, Windows, and macOS with Node 24. Each runner installed locked dependencies, checked formatting and documentation links, checked types, ran the unit suite, built the application, and packaged the source template. The Ubuntu job also uploaded the clean template artifact.

Each CI run passed 36 tests and skipped the optional live HTTP test. The separate Windows live run passed all 37 tests. This validates cross-platform installation/build/test behavior; native macOS/Linux keychain sign-in still needs a live platform-specific check.
