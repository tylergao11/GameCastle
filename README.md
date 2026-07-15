# GameCastle

GameCastle turns an LLM2 design decision into a deterministic, source-bound GDevelop/GDJS project. It does not use game templates, downstream design routing, placeholder assets, or compatibility readers.

## What runs where

| Area | Responsibility |
| --- | --- |
| Semantic engine | Validates `GameSemanticSource` or `GameSemanticRevision` against the generated GDJS dictionary, then compiles events, assets, layout, and a libGD-validated project seed. |
| Asset engine | Searches the cloud library, generates one temporary SD1.5 master image on a miss, deterministically derives a static asset or FrameSet, binds it locally, and enqueues accepted revisions for asynchronous cross-project publication. It also accepts type-checked local resources such as fonts, video, models, Spine data, and JSON. |
| Cloud library | A private, pinned [Supabase Storage](https://github.com/supabase/storage) service backed by PostgreSQL metadata and MinIO/S3 objects. It accelerates creation; it never chooses a game's semantic intent. |
| Product API | `POST /semantic/execute` deterministically returns a project seed or a fully bound GDJS project. |
| Platform | Small Vite/React shell. It does not emulate a deleted local runtime. |
| Multiplayer server | Separate WebSocket signaling and room synchronization service. It is not part of semantic compilation. |

## Core flow

```text
Pinned GDevelop source
  -> generated GDJS Semantic Dictionary

LLM1 creative direction
  -> LLM2 plain-text semantic DSL batches
  -> local incremental execution + runtime feedback
  -> GameSemanticSource or GameSemanticRevision
  -> deterministic event + asset + layout compilation
  -> libGD project seed
  -> accepted AssetWorld (optional)
  -> source-hash-checked bound GDJS project
```

LLM2 owns all semantic design choices. Its prompt contains rules, slot meanings, and positive fill-in forms, with no examples. The runtime owns dictionary binding, reference and parameter normalization, local execution, Source materialization, compilation, and factual feedback. Feedback is a source-bound fact batch returned to LLM2; it never selects an owner or repair route.

Asset production follows one official LangGraph path: semantic asset requirements → optional `AssetLibrary` lookup → core-node ComfyUI master candidates → deterministic candidate selection → pinned BiRefNet background removal when transparency is required → deterministic trim/fit/FrameSet derivation → accepted AssetWorld → GDJS binding → publication outbox. Its nine stages and every required module export are declared in `shared/asset-engine-contract.json` and resolved before graph invocation. Master images are transient and are never published.

## Quick start

```powershell
git submodule update --init --recursive
npm install
npm --prefix platform install
npm run runtime:prepare
npm run check:semantic-engine
npm run check:provider
npm run build
```

For the local cloud library, populate the storage values in `.env.local` from `.env.local.example`, then follow [Asset library and creation loop](docs/asset-library.md). The browser never receives a storage service key and never calls the cloud library directly.

Start the deterministic execution API:

```powershell
npm run semantic:serve
```

It listens on port `3030` by default. Send `POST /semantic/execute` with a complete `GameSemanticSource`, an optional source-hash-checked `GameSemanticRevision`, and optionally an accepted `semantic-asset-world`.

Run the real DeepSeek Snake probe with a configured local `DEEPSEEK_API_KEY`:

```powershell
npm run debug:snake:live
```

The probe runs LLM1 creative direction, at most three LLM2 semantic-DSL rounds within 30 seconds, incremental runtime feedback, and libGD project-seed assembly. These are probe limits, not production semantic boundaries. Production LLM2 allows at most eight rounds within 120 seconds. The probe writes the run ledger and trace to `output/semantic-live/`.

The platform shell can be built with `npm run build` or developed with `npm --prefix platform run dev`.

## Documentation

- [Architecture and contracts](docs/architecture.md)
- [Semantic engine handoff and invariants](docs/semantic-engine-terra-handoff.md)
- [Asset and provider operations](docs/asset-operations.md)
- [Asset library and creation loop](docs/asset-library.md)
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
