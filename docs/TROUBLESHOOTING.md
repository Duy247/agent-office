# Troubleshooting

## The browser cannot connect

Run `npm start`, then open http://127.0.0.1:4318. On Windows, Start office.cmd launches a background server; Stop office.cmd stops it. Check `%LOCALAPPDATA%/OpenbotOfficeDashboard/office-error.log` for background-launch errors.

If the port is already in use, stop the other office process or choose another port in office.config.local.json. A terminal instance can use `node src/server.ts --port 4320` after building.

## The editor has no agent data

`npm run dev` starts the scene preview, not the connector. Keep `npm start` running in another terminal. The default preview is http://127.0.0.1:5173 and proxies the connector's read-only API. Restart the preview after changing connector port settings.

## The office says Demo

This is the safe default. Demo activity is simulated and makes no AI calls. Configure a real connector in office.config.local.json or complete the Openbot sign-in flow. A real source never silently falls back to demo after disconnection.

## Openbot cannot be discovered

Windows auto-discovery requires the Openbot local server to be running. On any platform, provide the actual Team API address with `--server` or `connector.options.baseUrl`. Do not use a provider API URL or an Openbot invitation URL as the server address.

The adapter checks the saved server identity. Use another credential profile or sign in again if the configured server does not match the profile. It will not send an existing token to a mismatched server.

## Sign-in or secure storage fails

Run `npm run connect` using an account that already belongs to the selected server. Windows uses CurrentUser DPAPI; macOS uses the system keychain; Linux requires an unlocked Secret Service store and the optional keyring dependency. There is no plaintext fallback. Revoke obsolete sessions in Openbot when retiring profiles.

Never put tokens in a bug report, source file, shared configuration, or screenshot.

## A model is missing or incorrectly sized

Keep files under public/assets/custom and use `/assets/custom/...` URLs. A self-contained, uncompressed GLB is simplest. Draco, Meshopt, or KTX compression needs locally configured decoders. Remote resources are rejected.

Positions use metres. Builder rotations use degrees; direct Three.js rotations use radians. Try floor normalization for models with an off-center exported origin. Inspect placement from multiple angles and check floor contact.

## An agent sits in the wrong direction

The workstation's workAnchor controls seated position and facing. It must belong to the returned workstation root. Move or rotate the complete root, including furniture and anchor. Do not rotate only the chair or only the screen unless you intend to change their relative orientation.

## Agents walk through a custom wall

There is no automatic collision solver. Supply a route hook with clear intermediate waypoints after adding obstacles. See [the authoring guide](AUTHORING.md#layout-rooms-and-agent-desks).

## The scene is slow or too small

Use Find in office to focus a selected agent and Reset view to fit the full scene. Reduce model complexity, transparent surfaces, shadows, or per-frame animation for large teams. The layout tests cover 50 agents; they are not an unlimited GPU-performance guarantee.
