# Engine - GDJS HTML Runtime

`engine/gdevelop-runtime/` is the local cache of the official GDJS browser
runtime built from `D:\GDevelop-master\GDJS`.

Prepare or refresh it with:

```bash
npm run runtime:prepare
```

Use `GDEVELOP_SOURCE_DIR` or `scripts/prepare-gdjs-runtime.js --source <path>`
when the GDevelop checkout is not at `D:\GDevelop-master`.

GameCastle does not maintain a hand-written GDJS runtime shim. The pipeline
emits a GDevelop-style HTML export:

- `output/project.json` is the generated project truth for GDJS.
- `output/data.js` exposes `gdjs.projectData`.
- `output/code*.js` exposes scene functions such as `gdjs.GameCode.func`.
- `output/html-export-manifest.json` records the HTML runtime files required by
  the current project.
- `output/index.html` and `output/game.html` load those files and start
  `new gdjs.RuntimeGame(...)`.

The HTML export manifest owns the boundary between GameCastle modules and the
GDJS runtime. It keeps 2D Pixi runtime available by default, adds 3D runtime
files only when the project uses 3D capabilities, and excludes non-HTML platform
packages such as Cordova, Electron, Facebook Instant Games, debugger clients,
and TypeScript declaration bundles.
