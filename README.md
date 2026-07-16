# GameCastle

GameCastle turns an LLM2 design decision into one source-bound, evidence-gated GDevelop/GDJS product delivery. It does not use game templates, downstream design routing, placeholder assets, or compatibility readers.

## What runs where

| Area | Responsibility |
| --- | --- |
| Director Planner | Uses DeepSeek through one compiled LangGraph to coordinate only `semantic.design`, `asset.realize`, and `assembly.verify`, emitting `director-dsl-v1`. |
| Semantic engine | Validates `GameSemanticSource` or `GameSemanticRevision` against the generated GDJS dictionary, then compiles events, assets, layout, and a libGD-validated project seed. |
| Semantic model runtime | Runs the open-source `Qwen/Qwen3.5-9B` model through pinned CUDA llama.cpp. Semantic Planner and Semantic Executor requests disable thinking and carry a phase- and field-specific GBNF grammar for `semantic-dsl-v9`. |
| Asset engine | Searches the cloud library, runs the pinned official-core SDXL Base→Refiner workflow on a miss, selects a reviewed transient master candidate, deterministically derives a static asset or FrameSet, reviews the final pixels, binds accepted revisions locally, and enqueues them for asynchronous cross-project publication. It also accepts type-checked local resources such as fonts, video, models, Spine data, and JSON. |
| Spatial Planner | Runs after asset acceptance. A configured vision LLM proposes scene/UI coordinates inside an explicit GDJS coordinate frame, layer stack, and legal pixel regions; Runtime validates and accepts only previewed candidates. |
| Cloud library | A private, pinned [Supabase Storage](https://github.com/supabase/storage) service backed by PostgreSQL metadata and MinIO/S3 objects. It accelerates creation; it never chooses a game's semantic intent. |
| Product API | `POST /product/deliver` owns the complete Source/Revision → asset → spatial → browser assembly → review → factual feedback loop. `POST /semantic/execute` is only the strict deterministic Source/Revision compilation sub-boundary. |
| Platform | Small Vite/React shell. It does not emulate a deleted local runtime. |
| Multiplayer server | Separate WebSocket signaling and room synchronization service. It is not part of semantic compilation. |

## Public module boundaries

Product assembly uses one public path. The three private npm workspaces are the
sole Source to SemanticAssembly to GDJS seed / asset-bound seed / spatial handoff
entries. Internal packages (`semantic`, `assets`, `gdjs`, `spatial`, `product`)
remain the implementation owners behind those facades. There is no parallel
runtime-linker assembly identity.

| Workspace | Input -> output | Focused command |
| --- | --- | --- |
| `@gamecastle/semantic-module` | `GameSemanticSource` / `GameSemanticRevision` -> hash-bound `SemanticAssembly` | `npm run check:semantic-module` |
| `@gamecastle/asset-engine` | `AssetRequirementSet` -> accepted `AssetWorld` v4 (deterministic offline conformance) | `npm run check:asset-module` |
| `@gamecastle/assembly-module` | `SemanticAssembly` + accepted `AssetWorld` -> GDJS seed, bound seed, canonical spatial handoff | `npm run check:assembly-module` |

Run all three boundary checks plus the single public-assembly identity gate with
`npm run check:modules`. Package READMEs and [Module boundaries and truth
audit](docs/module-boundaries.md) document the contracts.

## Core flow

```text
Pinned GDevelop source
  -> generated GDJS Semantic Dictionary

Product request
  -> ProductDeliveryOrchestrator opens one persisted ProductDeliveryRun
  -> DeepSeek Director Planner freezes the director-dsl-v1 route: semantic.design -> asset.realize -> assembly.verify
  -> semantic.design: Semantic Planner emits one semantic-dsl-v9 TaskPlan slot stream
  -> Runtime freezes the plan and activates exactly one task at a time
  -> deterministic capability retrieval -> one atomic Draft-write batch -> deterministic acceptance
  -> next task -> Runtime validates, assembles, and completes deterministically
  -> GameSemanticSource v6 or GameSemanticRevision
  -> asset.realize: dictionary-owned component expansion
  -> deterministic event + asset + layout compilation
  -> spatial assembly request + libGD project seed (no scene coordinates)
  -> complete accepted AssetWorld v4
  -> source-hash-checked asset-bound project seed
  -> assembly.verify: native geometry facts
  -> Spatial Planner input (accepted assets + geometry + generated GDJS spatial truth + scene canvas)
  -> derived planning space -> visual LLM spatial-dsl-v1 candidate -> Runtime validation -> GDJS candidate preview
  -> later ACCEPT -> canonical spatial resolution -> final GDJS projection
  -> official libGD HTML export -> tokenized loopback HTTP -> real Chrome/Edge capture
  -> independent assembly review bound to the exact build and screenshot hashes
  -> accepted product

Assembly rejection
  -> source-bound factual semantic-feedback-batch
  -> frozen Director repair route returns to semantic.design; LLM2 plans a GameSemanticRevision through a new frozen TaskPlan
  -> invalidate every downstream artifact from the prior source hash
  -> rerun asset, spatial, capture, and review
```

Semantic design is split into Semantic Planner, DSL Executor, and deterministic Runtime. `semantic-dsl-v9` is the sole model-facing wire truth and is generated from one syntax registry. Planner uses typed target commands with globally unique target slots, capability aliases, and retrieval aliases; `plan-task.after` owns ordered dependencies and one event target slot owns its declared facet list. Model-visible context uses read-only DSL fact rows. `read` slots bind existing references, while `create`, `update`, and `delete` slots authorize mutation. Executor refers only to frozen slots and aliases. Runtime resolves semantic addresses and Dictionary handles, derives catalogs, validates scope, commits one-task transactions, materializes Source or Revision, completes deterministically, and emits factual feedback. Provider selection lives behind a Semantic Model Port. The current local adapter is pinned CUDA llama.cpp serving `Qwen/Qwen3.5-9B`; simulated-local supplies deterministic tests through the same contracts. Every request disables Qwen thinking and includes the exact Planner or Executor GBNF generated from the syntax registry. The grammar constrains command names, field order, field types, list/record shapes, and quoted text before the parser performs semantic validation. Every model call produces a distillation-ready training record with prompt hashes, raw output, parsed DSL, resolved commands, validation result, feedback, usage, and receipt. JSON bracket/brace output has no model-protocol parser path; JSON used inside the HTTP transport envelope is infrastructure only.

Director Planner has a separate boundary from Semantic LLM2. LLM1 is the external DeepSeek `deepseek-v4-flash` model and emits only the three-domain `director-dsl-v1` program. LLM2 remains the local open-source Semantic DSL model. Each domain owns its model selection: `director-model-port.js` pins LLM1 and `semantic-model-policy.js` pins LLM2. The shared ProviderRuntime only transports requests and records receipts. `.env.local` contains private endpoint and key values; `npm run product:serve` loads them automatically. Use `npm run model:director:check` for a local configuration check and `npm run model:director:smoke` for one real DeepSeek DSL probe.

Common controls, abilities, and systems enter LLM2 as complete components. A component is admitted only when it encapsulates a frequent, bottom-up complex capability. LLM2 selects one component handle, target, configuration, and semantic bindings; Runtime expands its inherited dictionary blueprint into members, entities, behaviors, layout, and events. Jump and attack are action-button bindings, not parallel button component types. A cooldown skill binds one trigger and one effect. A state machine binds named transition conditions and optional effects. The editable Source retains only component instances; expanded GDJS facts are deterministic evidence tied to the same dictionary fingerprint.

Asset production follows one official LangGraph path: semantic asset requirements → optional exact `AssetLibrary` lookup → pinned ComfyUI SDXL Base→Refiner candidates → structural and CLIP semantic/style selection → unload Base/Refiner at the registered `/free` barrier → pinned BiRefNet background removal when transparency is required → deterministic trim/fit/FrameSet derivation → deterministic final-alpha validation → final-pixel CLIP review → complete accepted AssetWorld v4 → resource-binding seed → publication outbox. The master-candidate gate permits a removable solid background; transparent isolation is required only from the derived runtime pixels. Any failed alpha or final review becomes blocking debt before GDJS or outbox. Only the current ledger, Style DNA key, and review-receipt contracts are accepted. Review receipts bind the exact work item, target slot, current Style DNA/review policy, model revision, every image hash, and every required composition check. `ProductDeliveryOrchestrator` passes that exact asset-bound product to `packages/product/src/spatial-product-pipeline.js`, then to real browser capture and independent assembly review. A source revision clears all downstream product references before the orchestrator reruns them. Master images are transient and are never published.

## Quick start

Before preparing the runtime, configure a checksum-verified GDevelop source
and libGD binary pair as described in [Pinned GDJS runtime
assets](docs/gdevelop-runtime.md). The preparation and runtime code both fail
closed when those pinned inputs do not match.

```powershell
git submodule update --init --recursive
npm install
npm --prefix apps/web install
npm run runtime:prepare
npm run check:project
npm run build
```

`npm run check:project` is the only complete repository acceptance gate. It owns the semantic, asset, product, provider, assembly-feedback, multiplayer, and public-module evidence chains. The narrower `check:*` suites are diagnostic slices only and never establish project acceptance by themselves.

Its semantic-loop slice runs the six `snake-layered-v2` tasks through the real internal Planner -> state machine -> task transaction -> completion path with a deterministic offline provider, then replays every recorded call and applies the independent semantic/runtime oracle. It does not call a live provider or claim a live-model pass rate.

`npm run check:network` is the single multiplayer verification entry. It covers tick policy/runtime, input replay, runtime binding, generated network code, snapshot/event/persistence modes, reconnect behavior, signaling protocol errors, transport integration, and the two-client bridge path.

For the local cloud library, populate the storage values in `.env.local` from `.env.local.example`, then follow [Asset library and creation loop](docs/asset-library.md). The browser never receives a storage service key and never calls the cloud library directly.

Start the product engine API:

```powershell
$env:PRODUCT_ENGINE_TOKEN = '<local-secret>'
npm run product:serve
```

`apps/api/src/server.js` listens only on `127.0.0.1:3030` by default and requires `Authorization: Bearer $PRODUCT_ENGINE_TOKEN`. `POST /product/deliver` accepts only `deliveryId`, `projectId`, and `userRequest`. The product layer derives every run, Source-version, asset, preview, trace, and browser path beneath `PRODUCT_ENGINE_STORAGE_ROOT`; it also owns the fixed budgets and stage policy. The endpoint owns semantic design, official Asset and Spatial LangGraph execution, real-browser evidence, independent assembly review, and any source-bound semantic Revision cycle. HTTP callers cannot inject Source, AssetWorld, storage paths, budgets, stage options, or test adapters. The internal programmatic orchestrator may receive one fully validated Source for a trusted bootstrap or resume. `POST /semantic/execute` accepts only a complete `GameSemanticSource` and optional source-hash-checked `GameSemanticRevision`; it deterministically returns the libGD project seed and does not run a model or any downstream product stage.

Start or restore the pinned local Semantic model service. Docker Desktop, an
NVIDIA GPU, and the NVIDIA container runtime are required; the first start
downloads the GGUF into the persistent `gamecastle-llm-cache` volume:

```powershell
npm run model:semantic:start
npm run model:semantic:smoke
npm run model:semantic:benchmark
```

The smoke test exercises the real ProviderRuntime, disabled thinking, GBNF,
and DSL parser. The command-following benchmark covers twelve basic Planner
and Executor commands and reports syntax validity, exact-value following,
reasoning leakage, and latency. The latest local RTX 5070 Laptop GPU run
produced 12/12 valid DSL commands, 12/12 without thinking, 11/12 strict
literal matches, and a 770 ms warm average. These numbers are diagnostic
evidence for that machine and prompt cache state, not a cross-machine SLA.
Detailed operations are in [Local text-model runtime](scripts/models/README.md).

Run the layered live semantic diagnostic when a complete model-backed task is
needed rather than a command-level probe:

```powershell
npm run debug:snake:live -- --benchmark-task=core-model --timeout-ms=300000
```

The semantic run has one hard total deadline of 300 seconds. There are no separate Planner, active-task, or finalization deadlines: every model call receives only the remaining total budget. Every Planner and Executor call receives an explicit 8196-token total output limit shared by reasoning and DSL; the same fact is present in both stable protocols so task decomposition can account for execution capacity. Deterministic capability retrieval adds no model call. The live Snake probe prints a heartbeat every 10 seconds, and every completed model call prints phase, active task, latency, stable-prefix hash/cache usage, raw output, and the state-machine result, then writes the hash-chained ledger and trace under `.gamecastle/output/semantic-live/`. The six `snake-layered-v2` tasks are a benchmark oracle only; no Snake rule enters production semantic modules.

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
- [Module boundaries and truth audit](docs/module-boundaries.md)
- [Core package ownership](packages/README.md)
- [Application boundaries](apps/README.md)

## Repository layout

```text
apps/      independently started web, API, and multiplayer applications
packages/  legacy implementation owners plus semantic-module, asset-engine, and assembly-module public workspaces
tests/     the single project gate, domain evidence, fixtures, and benchmarks
scripts/   repository automation grouped by GDevelop, assets, semantic diagnostics, and Docker
vendor/    pinned third-party Git submodules
docs/      current architecture and operations documentation
```
