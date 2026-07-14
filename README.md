# GameCastle

GameCastle turns an LLM2 design decision into a deterministic, source-bound GDevelop/GDJS project. It does not use game templates, downstream design routing, placeholder assets, or compatibility readers.

## What runs where

| Area | Responsibility |
| --- | --- |
| Semantic engine | Validates `GameSemanticSource` or `GameSemanticRevision` against the generated GDJS dictionary, then compiles events, assets, layout, and a libGD-validated project seed. |
| Asset engine | Produces accepted image assets through the image review loop, or accepts type-checked local resources such as fonts, video, models, Spine data, and JSON. |
| Product API | `POST /semantic/execute` deterministically returns a project seed or a fully bound GDJS project. |
| Platform | Small Vite/React shell. It does not emulate a deleted local runtime. |
| Multiplayer server | Separate WebSocket signaling and room synchronization service. It is not part of semantic compilation. |

## Core flow

```text
LLM1 creative language
  -> LLM2 complete Source or Revision
  -> generated GDJS Semantic Dictionary
  -> deterministic event + asset + layout compilation
  -> libGD project seed
  -> accepted AssetWorld (optional)
  -> source-hash-checked bound GDJS project
```

LLM2 owns all deterministic design choices. Later stages compile, validate, or report facts only. Feedback is a source-bound fact batch returned to LLM2; it never selects an owner or repair route.

## Quick start

```powershell
npm run check:semantic-engine
npm run check:provider
npm run build
```

Start the deterministic execution API:

```powershell
npm run semantic:serve
```

It listens on port `3030` by default. Send `POST /semantic/execute` with a complete `GameSemanticSource`, an optional source-hash-checked `GameSemanticRevision`, and optionally an accepted `semantic-asset-world`.

The platform shell can be built with `npm run build` or developed with `npm --prefix platform run dev`.

## Documentation

- [Architecture and contracts](docs/architecture.md)
- [Semantic engine handoff and invariants](docs/semantic-engine-terra-handoff.md)
- [Asset and provider operations](docs/asset-operations.md)
- [Local deterministic derivation](docs/local-derivation-kernel.md)
- [Network synchronization boundary](docs/network-sync-model.md)
- [Pinned GDJS runtime assets](engine/README.md)

## Repository layout

```text
ai/       semantic compiler, dictionary extraction, asset engine, providers
server/   semantic HTTP API and independent multiplayer WebSocket server
shared/   pinned contracts and dictionaries
engine/   pinned GDevelop/GDJS runtime and libGD preparation artifacts
platform/ React/Vite shell
docs/     current architecture and operations documentation
```
