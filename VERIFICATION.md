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

## Latest local run

On Windows, all 37 tests passed with the live HTTP suite enabled; type checking and production build passed. The shareable ZIP was extracted into a separate folder, dependencies installed using npm ci, built, and its dependency-free demo source launched on a separate port. The browser explicitly displayed Demo and four sample agents. A JSON-file adapter instance also ran independently and exposed its own normalized agent. The original installation continued using its separately stored Openbot session.

The editor preview was checked on 127.0.0.1:5173: changing office/office.ts automatically reloaded the scene, a local GLB returned HTTP 200, and the from-scratch room replaced the campus without changing the connector. The development API returned 403 for a foreign Origin and 405 for POST. Browser page errors were empty. A final archive audit confirmed local configuration, DPAPI files, private connection evidence, screenshots and installation-specific agent IDs were absent.

macOS/Linux credential backends and the three-platform GitHub workflow remain unexecuted locally. The demo/JSON adapters and their normalized contracts do not require OS credential access.
