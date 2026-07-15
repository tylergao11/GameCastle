# GameCastle

GameCastle turns an LLM2 design decision into a deterministic, source-bound GDevelop/GDJS project. It does not use game templates, downstream design routing, placeholder assets, or compatibility readers.

## What runs where

| Area | Responsibility |
| --- | --- |
| Semantic engine | Validates `GameSemanticSource` or `GameSemanticRevision` against the generated GDJS dictionary, then compiles events, assets, layout, and a libGD-validated project seed. |
| Asset engine | Searches the cloud library, generates one temporary SD1.5 master image on a miss, deterministically derives a static asset or FrameSet, binds it locally, and enqueues accepted revisions for asynchronous cross-project publication. It also accepts type-checked local resources such as fonts, video, models, Spine data, and JSON. |
| Spatial Planner | Runs after asset acceptance. A configured vision LLM proposes scene/UI coordinates inside an explicit GDJS coordinate frame, layer stack, and legal pixel regions; Runtime validates and accepts only previewed candidates. |
| Cloud library | A private, pinned [Supabase Storage](https://github.com/supabase/storage) service backed by PostgreSQL metadata and MinIO/S3 objects. It accelerates creation; it never chooses a game's semantic intent. |
| Product API | `POST /semantic/execute` deterministically returns a project seed or an asset-bound project seed; final spatial assembly is asset-aware and separate. |
| Platform | Small Vite/React shell. It does not emulate a deleted local runtime. |
| Multiplayer server | Separate WebSocket signaling and room synchronization service. It is not part of semantic compilation. |

## Core flow

```text
Pinned GDevelop source
  -> generated GDJS Semantic Dictionary

LLM1 creative direction
  -> LLM2 plain-text semantic DSL batches
  -> local incremental execution + runtime feedback
  -> GameSemanticSource v6 or GameSemanticRevision
  -> dictionary-owned component expansion
  -> deterministic event + asset + layout compilation
  -> spatial assembly request + libGD project seed (no scene coordinates)

Async asset path
  -> accepted AssetWorld
  -> source-hash-checked asset-bound project seed
  -> Spatial Planner input (accepted assets + native geometry + generated GDJS spatial truth + scene canvas)
  -> derived planning space -> visual LLM spatial-dsl-v1 candidate -> Runtime validation -> GDJS candidate preview
  -> later ACCEPT -> canonical spatial resolution -> final GDJS projection
```

LLM2 owns all semantic design choices. DeepSeek thinking stays enabled with high reasoning effort. Its prompt contains field meanings, current Draft facts, and positive fill-in forms, with no examples. The runtime owns dictionary binding, reference and parameter normalization, local execution, Source materialization, compilation, and factual feedback. Feedback is a source-bound fact batch returned to LLM2; it never selects an owner or repair route.

Common controls, abilities, and systems enter LLM2 as complete components. A component is admitted only when it encapsulates a frequent, bottom-up complex capability. LLM2 selects one component handle, target, configuration, and semantic bindings; Runtime expands its inherited dictionary blueprint into members, entities, behaviors, layout, and events. Jump and attack are action-button bindings, not parallel button component types. A cooldown skill binds one trigger and one effect. A state machine binds named transition conditions and optional effects. The editable Source retains only component instances; expanded GDJS facts are deterministic evidence tied to the same dictionary fingerprint.

Asset production follows one official LangGraph path: semantic asset requirements → optional `AssetLibrary` lookup → core-node ComfyUI master candidates → deterministic candidate selection → pinned BiRefNet background removal when transparency is required → deterministic trim/fit/FrameSet derivation → accepted AssetWorld → resource-binding seed → publication outbox. `ai/spatial-product-pipeline.js` then gives accepted resources, frozen semantic facts, and the GDJS scene canvas to the Spatial Planner LangGraph. Runtime derives one planning space from generated fixed-version coordinate truth, that canvas, and dictionary layout constraints. The visual model emits only `spatial-dsl-v1`; its parser/runtime/trace are independent of LLM2's `semantic-dsl-v1`, and the Spatial Adapter alone projects accepted coordinates into GDJS. Its candidate preview derives from the same GDJS projection; only a later ACCEPT creates the canonical spatial resolution. Asset stages and Spatial Planner stages each resolve their contract-declared modules before graph invocation. Master images are transient and are never published.

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

Run the real DeepSeek probe with a configured local `DEEPSEEK_API_KEY` and explicit process authorization:

```powershell
$env:LLM_ALLOW_EXTERNAL = 'true'
npm run debug:snake:live
```

The probe defaults to one LLM2 semantic-DSL round within 120 seconds for atomic inspection. Pass `-- --max-rounds=2` for a direct WRITE plus `complete()`, or `-- --max-rounds=3` for extension lookup, WRITE, and `complete()`. Production LLM2 allows at most eight rounds within 120 seconds. Every probe round prints raw DeepSeek output and writes the run ledger and trace to `output/semantic-live/`.

The platform shell can be built with `npm run build` or developed with `npm --prefix platform run dev`.

## Documentation

- [Architecture and contracts](docs/architecture.md)
- [Spatial Planner and Runtime](docs/spatial-engine.md)
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
