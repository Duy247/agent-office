# Connect a source

The renderer does not speak Openbot's wire protocol. Node-side connectors emit the shared `OfficeSnapshot` shape from `src/shared.ts`; `src/boundary.ts` strips every extra field before browser delivery. Connectors have no browser-visible authentication endpoint and must not emit secrets, chat text or raw source payloads.

Select an adapter in **office.config.local.json**. Shared defaults in office.config.json start with demo. Local overrides are ignored by Git and excluded from the source export.

## Demo

```json
{ "connector": { "type": "demo" } }
```

Runs without accounts, Openbot or AI providers. Activity is simulated, the toolbar explicitly says Demo, and no AI calls are made. `npm run demo -- --port 4320` runs an independent demo using a different port.

## Openbot

```json
{
  "connector": {
    "type": "openbot",
    "options": {
      "baseUrl": "http://127.0.0.1:9000",
      "profile": "work-server",
      "accountApiUrl": "https://api.openbot.run"
    }
  }
}
```

Replace the example port with the actual Team API address from your Openbot installation. Run:

```sh
npm run connect -- --server http://127.0.0.1:9000 --profile work-server
```

Enter your account email and emailed code in the terminal. The supported account-to-Team-API flow creates this dashboard's separate session and closes the temporary account session. After successful sign-in, the command selects Openbot in the ignored local configuration. Your account must already belong to that server. Restart the connector to apply changes.

On Windows, omit baseUrl to rediscover the local Openbot process's port after restarts. With an explicit baseUrl, any OS can connect to that address. HTTP is permitted only on loopback; remote servers require HTTPS. The saved server identity/fingerprint is checked before authenticated requests. Use distinct credential profiles for different servers. `accountApiUrl` may target another supported account service; default is Openbot's official service. The account/ticket endpoints must match the released Openbot protocol, not an arbitrary provider API.

Windows sessions use CurrentUser DPAPI outside the project. macOS uses the OS keychain through the optional `@napi-rs/keyring` package. Linux requires a working unlocked Secret Service store; it is explicitly selected, without kernel/plaintext fallback. If protected storage is unavailable, sign-in fails; no tokens are written into this project, environment files or browser storage. macOS/Linux paths are implemented but were not exercised on those systems during this Windows build.

Credentials are stored per `profile`; the default Windows profile retains compatibility with existing OpenbotOfficeDashboard/session.dpapi. Revoke the corresponding session in Openbot to invalidate access, and remove the saved dashboard credential when retiring a profile. A source token's permissions come from Openbot; the adapter additionally enforces a local read-only endpoint allowlist. Authentication and subscription setup are the only setup writes. Task listing is an Openbot read endpoint that uses POST.

The adapter negotiates capabilities, reads roster/groups, requests runtime snapshots without conversation subscriptions, reconciles queues/side tasks and reconnects. Missing/expired authentication or an unavailable source remains stale; it does not silently switch to demo.

When supported, it also reads channel summaries through GET /v1/channels and observes channels-changed events. Only channel ID, name, visible member IDs and active-work state are exported; preview text, instructions, messages and execution thread IDs are discarded. This drives [conference meetings](ACTIVITIES.md) without reading transcripts or writing channel commands. Channel capability absence or a forbidden/missing optional summary endpoint leaves the normal agent feed working.

### Switch servers

The sidebar's Server menu lists locally configured connections. Each browser chooses its own server; the selection stays in its page URL across refreshes. Switching clears agent selection and the scene before subscribing to the selected server. It does not follow Openbot's desktop server menu or change any Openbot setting.

For additional servers created inside Openbot, use the remote-session transport. Openbot 0.65.0 keeps internal owner credentials on these servers, so local `/v1/auth/account` can return HTTP 400 even when the Members screen shows Owner. The remote transport authenticates your account membership through Openbot's supported session, Signal and WebRTC flow.

```sh
npm run connect -- --server http://127.0.0.1:9001 --transport remote --profile second-office --save-server second --name "Second office"
```

Replace the example port with that server's current local Team API port. This initial read pins the server ID, public key and fingerprint. Setup verifies account membership, mutual signed proofs bound to both DTLS fingerprints, protocol capabilities, roster, sidebar layout and a runtime snapshot before selecting the connection. Afterward, it uses the saved server ID and encrypted remote connection; the local port can change without editing configuration.

Remote connections retain a separate dashboard account session and remote session ID in protected OS credential storage. This account session renews short-lived connection tickets; it is never sent to the dashboard browser or written to configuration/logs. The local HTTP transport continues to close its temporary account sign-in session. No Openbot saved credentials or provider tokens are read.

If remote setup fails after sign-in, its dedicated protected session stays available for a retry without another email code:

```sh
npm run connect -- --resume --transport remote --profile second-office --save-server second --name "Second office"
```

A remote profile's saved options are `transport: "remote"`, `profile`, and `hostId`, with an optional `accountApiUrl`. Setup writes these automatically and preserves that server's boss and branding. Restart the dashboard connector after successful setup. Revoke the dedicated dashboard session through Openbot's account device/session controls to retire access; renewing expired account credentials requires email sign-in again.

The Node connector maintains the data connection; browsers receive the same filtered office snapshots as the local transport. The remote transport allows only the existing office-read routes and authentication/session setup. It requests runtime snapshots and acknowledges ordered events, without subscribing to conversation threads, downloading chat history, uploading files, or sending work commands. Metadata emitted by the host is discarded unless needed for normalized office state. Connections verify the pinned host key on each reconnect, retain stale state on failure, replace ended remote sessions, and reconnect before TURN credentials expire. WebRTC runs in Node without installing another browser or controlling your desktop.

Keep the current connection as the default. To connect and register an additional server, run this locally with its actual Team API address:

```sh
npm run connect -- --server https://team.example.com --profile second-office --save-server second --name "Second office"
```

Complete the email sign-in, then restart the office dashboard and reload the page. Registration happens only after authentication succeeds and preserves the default connection. Use a separate profile for each server. An unavailable or expired session shows that server's connection state; it never falls back to another server or demo data. Renew an additional server's session with the same command and server ID.

You can also edit `office.config.local.json` directly if the profiles are already connected:

```json
{
  "serverName": "Main office",
  "servers": [
    {
      "id": "second",
      "name": "Second office",
      "options": {
        "baseUrl": "https://team.example.com",
        "profile": "second-office"
      },
      "boss": { "name": "Office owner", "gender": "male" },
      "logo": null
    }
  ]
}
```

This is a partial local override; keep existing connector and office settings. Up to 15 additional servers are supported. IDs must be unique, and `default` identifies the existing connection. Each additional server has separate character and desk assignments in the ignored `serverAppearance` settings, so identical agent IDs cannot share appearances across servers. Existing default assignments remain compatible.

An additional server can override `boss` and `logo`. Omit either field to inherit the default office setting. Set `boss.enabled` to `false` to hide that server's boss, or set `logo` to `null` to remove inherited branding. Reconnecting with `--save-server` preserves these overrides.

The browser receives only server IDs and display names from `GET /api/servers`. State and event requests select a configured ID with `?server=second`; arbitrary addresses and credentials are not accepted from the browser. Feed connections are shared between viewers of the same server and stop 30 seconds after their last viewer leaves. Source credentials remain in protected OS storage. All dashboard endpoints remain GET-only.

If you expose the dashboard through a reverse proxy, its viewers can select any server in this catalog. Adding a server makes its filtered office data available through that same dashboard. The dashboard has no sign-in screen or per-viewer server access policy.

## JSON file

```json
{ "connector": { "type": "json-file", "options": { "path": "examples/status.json" } } }
```

Another local program can write a normalized status file. The sample shows the schema. The connector reads it once per second, preserves the last state if the file is missing/malformed, and exposes only allowed fields. Use atomic file replacement to avoid partial reads. Paths are relative to the project root unless absolute. The example has a deliberately static timestamp; your writer should update timestamps when state changes.

Required: `agents` and `groups` arrays. Agent fields: `id`, `name`, `title`, `provider`, `model`, `groupId`, `deskIndex`, `character`, `state`, `queueCount`, `activity`, `updatedAt`. States: idle, working, queued, question, approval, takeover, failed, unknown. Use a stable deskIndex and agent ID; never turn disconnected/unknown work into idle.

Optional `channels` entries have `{id, name, agentIds: string[], active: boolean}`. Only known agents and channels with at least two visible members survive the browser boundary. Set active from actual channel work, not from unrelated agent activity or conversation text.

## Write your own adapter

Create `src/connectors/my-system.ts`:

```ts
import type { OfficeConnector } from './types.ts';
import { publicSnapshot } from '../boundary.ts';

export function myConnector(options: Record<string, unknown>): OfficeConnector {
  return {
    async start({ signal, emit }) {
      // Authenticate separately using your source's supported client flow.
      // Poll or subscribe; keep credentials and raw source payloads inside this module.
      emit(
        publicSnapshot({
          source: { id: 'my-system', label: 'My system', mode: 'live' },
          connection: 'connected',
          updatedAt: new Date().toISOString(),
          groups: [{ id: 'team', name: 'My team' }],
          agents: [],
        }),
      );
      // Await your read-only subscription, honor signal, and release resources on abort.
    },
  };
}
```

Register the factory in `src/connectors/index.ts`, then set `connector.type` to your registration key. The scene and server do not need changing. The interface is `start({signal, config, emit, saveAppearance})`. It should remain active until aborted and clean up sockets/timers. Emit disconnected snapshots preserving known agents when the source goes offline. Namespace IDs when bridging different systems. `saveAppearance` can persist generated character/desk assignments to the ignored local config. Register adapters only from trusted local code; they execute in Node with your account's filesystem/network access.

The server binds to 127.0.0.1, rejects foreign Host/Origin and non-GET requests, then broadcasts filtered state and SSE. The development preview proxies only those same GET APIs and also rejects foreign origins. Nothing in this interface submits work, approves actions or exposes provider controls.
