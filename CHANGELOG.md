# Changelog

## 0.1.0 — 2026-11-08

Initial preview of the programmable 3D office template.

- TypeScript room, asset, workstation, camera, route, and animation hooks.
- Procedural Three.js assets and local GLB/glTF/OBJ loading.
- Modern campus preset with glass meeting space, greenery, cafe, and recreation.
- Automatic room growth, stable desk assignments, and agent-focused navigation.
- Matching 3D characters and portraits with runtime attention indicators.
- Demo, Openbot, and JSON-file adapters behind a shared read-only contract.
- Protected Openbot sign-in profiles and server identity checks.
- Live development preview, clean source export, and automated checks.

### Known limits

- User-created geometry does not automatically generate collision-free walking paths.
- Compressed model formats require locally configured decoders.
- OS credential backends on macOS/Linux require additional live validation.
- This is a local application; remote and multi-user hosting are not implemented.
