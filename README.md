# GameCastle

GameCastle turns an LLM2 design decision into one source-bound, evidence-gated GDevelop/GDJS product delivery. It does not use game templates, downstream design routing, placeholder assets, or compatibility readers.

## What runs where

| Area | Responsibility |
| --- | --- |
| Semantic engine | Validates `GameSemanticSource` or `GameSemanticRevision` against the generated GDJS dictionary, then compiles events, assets, layout, and a libGD-validated project seed. |
| Asset engine | Searches the cloud library, runs the pinned official-core SDXL Base→Refiner workflow on a miss, selects a reviewed transient master candidate, deterministically derives a static asset or FrameSet, reviews the final pixels, binds accepted revisions locally, and enqueues them for asynchronous cross-project publication. It also accepts type-checked local resources such as fonts, video, models, Spine data, and JSON. |
| Spatial Planner | Runs after asset acceptance. A configured vision LLM proposes scene/UI coordinates inside an explicit GDJS coordinate frame, layer stack, and legal pixel regions; Runtime validates and accepts only previewed candidates. |
| Cloud library | A private, pinned [Supabase Storage](https://github.com/supabase/storage) service backed by PostgreSQL metadata and MinIO/S3 objects. It accelerates creation; it never chooses a game's semantic intent. |
| Product API | `POST /product/deliver` owns the complete Source/Revision → asset → spatial → browser assembly → review → factual feedback loop. `POST /semantic/execute` is only the strict deterministic Source/Revision compilation sub-boundary. |
| Platform | Small Vite/React shell. It does not emulate a deleted local runtime. |
| Multiplayer server | Separate WebSocket signaling and room synchronization service. It is not part of semantic compilation. |

## Core flow

```text
Pinned GDevelop source
  -> generated GDJS Semantic Dictionary

LLM1 creative direction + product request
  -> ProductDeliveryOrchestrator opens one persisted ProductDeliveryRun
  -> LLM2 Planner emits one generic semantic-dsl-v2 TaskPlan batch
  -> Runtime freezes the plan and activates exactly one task at a time
  -> deterministic capability retrieval -> one atomic Draft-write batch -> deterministic acceptance
  -> next task -> final complete()
  -> GameSemanticSource v6 or GameSemanticRevision
  -> dictionary-owned component expansion
  -> deterministic event + asset + layout compilation
  -> spatial assembly request + libGD project seed (no scene coordinates)
  -> complete accepted AssetWorld v4
  -> source-hash-checked asset-bound project seed
  -> native geometry facts
  -> Spatial Planner input (accepted assets + geometry + generated GDJS spatial truth + scene canvas)
  -> derived planning space -> visual LLM spatial-dsl-v1 candidate -> Runtime validation -> GDJS candidate preview
  -> later ACCEPT -> canonical spatial resolution -> final GDJS projection
  -> official libGD HTML export -> tokenized loopback HTTP -> real Chrome/Edge capture
  -> independent assembly review bound to the exact build and screenshot hashes
  -> accepted product

Assembly rejection
  -> source-bound factual semantic-feedback-batch
  -> LLM2 plans a GameSemanticRevision through a new frozen TaskPlan
  -> invalidate every downstream artifact from the prior source hash
  -> rerun asset, spatial, capture, and review
```

LLM2 owns all semantic design choices. DeepSeek thinking stays enabled with high reasoning effort. A versioned Planner prefix contains discovery facts and `plan-task(...)`; a separate versioned Executor prefix contains write/completion forms. Requests, the frozen plan, exact active-task capability facts, the task-safe Draft slice, and append-only transition rows stay in ordered user-context layers, so state changes do not rewrite either stable system prefix. TaskPlan is LLM2's only mutation scope. Runtime owns plan sealing, dictionary binding, deterministic retrieval, one-task transactions, Source materialization, compilation, and factual feedback. Feedback is a source-bound fact batch returned to LLM2; it contains no `changeScope`, `maxRounds`, owner selection, repair route, or other execution control.

Common controls, abilities, and systems enter LLM2 as complete components. A component is admitted only when it encapsulates a frequent, bottom-up complex capability. LLM2 selects one component handle, target, configuration, and semantic bindings; Runtime expands its inherited dictionary blueprint into members, entities, behaviors, layout, and events. Jump and attack are action-button bindings, not parallel button component types. A cooldown skill binds one trigger and one effect. A state machine binds named transition conditions and optional effects. The editable Source retains only component instances; expanded GDJS facts are deterministic evidence tied to the same dictionary fingerprint.

Asset production follows one official LangGraph path: semantic asset requirements → optional exact `AssetLibrary` lookup → pinned ComfyUI SDXL Base→Refiner candidates → structural and CLIP semantic/style selection → unload Base/Refiner at the registered `/free` barrier → pinned BiRefNet background removal when transparency is required → deterministic trim/fit/FrameSet derivation → deterministic final-alpha validation → final-pixel CLIP review → complete accepted AssetWorld v4 → resource-binding seed → publication outbox. The master-candidate gate permits a removable solid background; transparent isolation is required only from the derived runtime pixels. Any failed alpha or final review becomes blocking debt before GDJS or outbox. Only the current ledger, Style DNA key, and review-receipt contracts are accepted. Review receipts bind the exact work item, target slot, current Style DNA/review policy, model revision, every image hash, and every required composition check. `ProductDeliveryOrchestrator` passes that exact asset-bound product to `packages/product/src/spatial-product-pipeline.js`, then to real browser capture and independent assembly review. A source revision clears all downstream product references before the orchestrator reruns them. Master images are transient and are never published.

## Quick start

```powershell
git submodule update --init --recursive
npm install
npm --prefix apps/web install
npm run runtime:prepare
npm run check:project
npm run build
```

`npm run check:project` is the only complete repository acceptance gate. It owns the semantic, asset, product, provider, assembly-feedback, and multiplayer evidence chain. The narrower `check:*` suites are diagnostic slices only and never establish project acceptance by themselves.

Its semantic-loop slice runs the six `snake-layered-v2` tasks through the real internal Planner -> state machine -> task transaction -> completion path with a deterministic offline provider, then replays every recorded call and applies the independent semantic/runtime oracle. It does not call DeepSeek or claim a live-model pass rate.

`npm run check:network` is the single multiplayer verification entry. It covers tick policy/runtime, input replay, runtime binding, generated network code, snapshot/event/persistence modes, reconnect behavior, signaling protocol errors, transport integration, and the two-client bridge path.

For the local cloud library, populate the storage values in `.env.local` from `.env.local.example`, then follow [Asset library and creation loop](docs/asset-library.md). The browser never receives a storage service key and never calls the cloud library directly.

Start the product engine API:

```powershell
$env:PRODUCT_ENGINE_TOKEN = '<local-secret>'
npm run product:serve
```

`apps/api/src/server.js` listens only on `127.0.0.1:3030` by default and requires `Authorization: Bearer $PRODUCT_ENGINE_TOKEN`. `POST /product/deliver` accepts only `deliveryId`, `projectId`, `userRequest`, and `creativeVision`. The product layer derives every run, Source-version, asset, preview, trace, and browser path beneath `PRODUCT_ENGINE_STORAGE_ROOT`; it also owns the fixed budgets and stage policy. The endpoint owns LLM2 design, official Asset and Spatial LangGraph execution, real-browser evidence, independent assembly review, and any source-bound LLM2 Revision cycle. HTTP callers cannot inject Source, AssetWorld, storage paths, budgets, stage options, or test adapters. The internal programmatic orchestrator may receive one fully validated Source for a trusted bootstrap or resume. `POST /semantic/execute` accepts only a complete `GameSemanticSource` and optional source-hash-checked `GameSemanticRevision`; it deterministically returns the libGD project seed and does not run LLM2 or any downstream product stage.

Run the real DeepSeek probe with a configured local `DEEPSEEK_API_KEY` and explicit process authorization:

```powershell
$env:LLM_ALLOW_EXTERNAL = 'true'
npm run debug:snake:live -- --skip-llm1 --benchmark-task=core-model
```

The semantic run has one hard total deadline of 120 seconds; callers cannot widen it. Planner, active-task, and finalization calls are additionally capped at 25, 20, and 8 seconds. Deterministic capability retrieval adds no model call. Every model call prints phase, active task, latency, stable-prefix hash/cache usage, raw output, and the state-machine result, then writes the hash-chained ledger and trace under `.gamecastle/output/semantic-live/`. The six `snake-layered-v2` tasks are a benchmark oracle only; no Snake rule enters production semantic modules.

The web app can be built with `npm run build` or developed with `npm --prefix apps/web run dev`.

## Documentation

- [Architecture and contracts](docs/architecture.md)
- [Spatial Planner and Runtime](docs/spatial-engine.md)
- [Semantic engine handoff and invariants](docs/semantic-engine-terra-handoff.md)
- [Asset and provider operations](docs/asset-operations.md)
- [Asset library and creation loop](docs/asset-library.md)
- [Local deterministic derivation](docs/local-derivation-kernel.md)
- [Network synchronization boundary](docs/network-sync-model.md)
- [Pinned GDJS runtime assets](docs/gdevelop-runtime.md)
- [Core package ownership](packages/README.md)
- [Application boundaries](apps/README.md)

## Repository layout

```text
apps/      independently started web, API, and multiplayer applications
packages/  semantic, asset, spatial, product, provider, GDJS, and network capabilities
tests/     the single project gate, domain evidence, fixtures, and benchmarks
scripts/   repository automation grouped by GDevelop, assets, semantic diagnostics, and Docker
vendor/    pinned third-party Git submodules
docs/      current architecture and operations documentation
```
