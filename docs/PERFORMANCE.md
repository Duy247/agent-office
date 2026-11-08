# Performance

The default office batches static scenery and the rigid sections of animated characters. Colours are baked into vertex attributes so compatible objects share draw calls; glass, textures, monitors, character joints and other animated objects stay independent. Geometry is preserved, including mirrored transforms and imported material groups.

## Measured results

Local Chromium/WebGL tests on Windows, at a 1600 × 1050 viewport, with one group, a boss suite, and every synthetic agent working:

| Metric                                           | 3 agents before | 3 agents after | 50 agents before | 50 agents after |
| ------------------------------------------------ | --------------: | -------------: | ---------------: | --------------: |
| Draw calls per animated frame, including shadows |           1,284 |            154 |            5,732 |           1,492 |
| Rendered triangles, including shadows            |          43,358 |         43,358 |          201,362 |         201,362 |
| GPU geometry objects reported by Three.js        |             626 |             78 |            2,646 |             700 |
| Median `renderer.render()` CPU submission time   |          7.5 ms |         2.9 ms |          19.7 ms |          8.0 ms |

Timing is an indicative same-browser comparison, not a GPU timing or end-to-end FPS guarantee. The renderer retains its 30 FPS animation cap. Paused and simulated hidden-tab checks produced zero additional office frames after settling; restoring visibility resumed rendering.

## Loading and idle costs

- Built-in furniture is parsed and converted during the build, then loaded in one browser-ready pack instead of 32 OBJ/MTL requests. Original asset sources and credits remain included.
- Optional GLTF/OBJ/MTL parsers load only when their asset type is used.
- Production builds generate Brotli and gzip sidecars. The server selects the accepted encoding without compressing on the request path. In the tested build, main JavaScript transferred as approximately 217 KB of Brotli; the furniture pack transferred as approximately 60 KB.
- Hashed JavaScript/CSS is cached as immutable. HTML, models and branding revalidate so edits appear; live state is never cached, and SSE is never compressed or buffered by this middleware.
- Paused, disconnected and reduced-motion views redraw only for visual changes, resize, camera movement or asynchronous asset completion. Hidden tabs cancel the office's animation-frame loop.
- Unchanged state deliveries avoid redundant serialization/render updates. Portraits are cached and reuse a temporary renderer during a panel-opening burst.
- Sustained slow render work reduces pixel ratio gradually. Hysteresis restores quality only after sustained headroom. No geometry is removed, and the normal maximum remains 1.75 device pixels per CSS pixel.

## Custom office code

Use `batchStaticMeshes(group)` from `office/optimize.ts` only after finishing a static subtree. It replaces eligible meshes; references to those individual source meshes no longer control rendered geometry. Build animation outside that subtree, or mark its root `userData.officeDynamic = true`. The supplied room/workstation presets accept `{ batch: false }` when you want to modify or animate their individual pieces. Moving the complete room or workstation still works with batching enabled.

`ctx.invalidate?.()` requests a redraw after an asynchronous visual change, including in a paused scene. `update()` runs only while visible, connected and motion-enabled; its elapsed time excludes paused/hidden time.

For fixed rendering quality, set this in `office/office.ts`:

```ts
performance: {
  maxPixelRatio: 1.5,
  adaptiveResolution: false,
},
```

Use the browser's performance tools and Three.js `renderer.info` through `configureScene` to measure your own design. Recheck animated objects and close-up camera views after changing batching boundaries. Unit coverage verifies geometry, joints, material colours, physical model scale, encoding negotiation, caching and traversal protection.
