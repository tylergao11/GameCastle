# GameCastle architecture

## Design ownership

Director Planner coordinates only the cross-domain `semantic.design`, `asset.realize`, and `assembly.verify` APIs. It uses external DeepSeek as LLM1, freezes the accepted `director-dsl-v1` program, and reuses one compiled LangGraph. Semantic Planner owns semantic decomposition, and DSL Executor fills values for exactly one frozen active task. Both consume the same DSL syntax registry through separate model roles on the current open-source Semantic model. Runtime owns GDJS capability binding. After accepted assets exist, Spatial Planner owns visual arrangement within those frozen facts. The local semantic runtime commits accepted task batches and materializes the complete `GameSemanticSource` or source-hash-checked `GameSemanticRevision`.

Model selection belongs to the consuming domain, never the shared ProviderRuntime. `director-model-port.js` pins Director LLM1 to DeepSeek `deepseek-v4-flash`; `semantic-model-policy.js` pins Semantic LLM2 to CUDA llama.cpp with `Qwen/Qwen3.5-9B`. `.env.local` supplies only machine-private endpoints, keys, and local authorization. Every Semantic request passes `enable_thinking=false` and its phase-specific GBNF. simulated-local is only a test double and does not form an alternate production Planner path. Ollama remains only the configured Spatial vision adapter.

Runtime owns deterministic mechanics: TaskPlan validation/sealing, task activation, capability retrieval, dictionary binding, official parameter ordering/default insertion, GDJS expression/token normalization, collision-safe internal reference generation, open-slot validation, scene/object variable routing, official recursive variable serialization, dictionary-declared event serialization, nested event construction, one-to-many operation expansion, Draft ordering, task transactions, Source/Revision materialization, and compilation. It does not choose gameplay or design values.

The semantic runtime follows one state-machine loop: `PLANNING → TASK_READY → TASK_ACTIVE → ... → FINALIZING → COMPLETED`, with repair, fuse, and expiry states on the same immutable event ledger. The Planner emits one complete typed `plan-*` command stream. Runtime resolves each declared capability slice without a model call, gives the Executor only the frozen active task, its authoritative Draft slice, exact facts, and append-only transition tail, then commits the complete batch or discards the fork. Two consecutive identical failure facts fuse; no second status or fuse counter exists.

The versioned Planner and Executor system prompts are byte-stable within their profiles. Request/plan facts form L2, exact active-task capabilities and Draft facts form L3, and the canonical transition log is the append-only L4 tail. State changes never rewrite the stable system prefix. The prompt contains no examples and the provider request sets no JSON schema or JSON response format. Instead, a grammar generated from the same `semantic-dsl-v9` registry constrains phase command names, declared fields, field types, composite shapes, and quoted text. The parser and Runtime still own semantic validity. Draft event operations expose `operationId`; updates use that identifier through `replace`.

The complete semantic run is bounded by one non-widenable 300-second deadline. Planner and active-task calls have no separate timeout; each call receives only the remaining total budget. Every LLM2 call receives the same explicit 8196-token output ceiling, shared by reasoning and DSL. A non-settling provider promise is still cut off by the shared deadline. Runtime performs final Source validation, assembly, and completion locally. Progress and termination are ledger states, not a fixed round count.

Director Planner sees one typed operation registry: `semantic.design`, `asset.realize`, and `assembly.verify`. These API boundaries return structured domain results and receipts. Director state stores only cross-domain dependencies, receipts, accepted hashes, and failure facts. Semantic slots, asset work items, assembly candidates, provider messages, and parser repairs remain inside their owning domains, keeping LangGraph orchestration state smaller than the combined domain harness states. DeepSeek planning produces a provider receipt persisted with the frozen Director plan. If a paid response fails DSL validation, its receipt is reconciled into `ProductDeliveryRun` cost history before the run is terminally blocked. Persisted plans are reused during recovery without a second model call.

`ProductDeliveryOrchestrator` owns the current cross-stage product loop; `ProductDeliveryRun` is its only persisted lifecycle truth. The orchestrator classifies stage failures as local retry, semantic Revision, or system block. Only exact-target semantic quality observations can become feedback. TaskPlan remains Semantic Planner's only mutation scope.

## Deterministic graph

```text
Pinned GDevelop source
  -> capability universe + official bindings + event grammar + object configuration truth
  -> GDJS Semantic Dictionary
  -> stable Event Algebra (dictionary-validated semantic composition)

Product request + Planner discovery catalog
  -> ProductDeliveryOrchestrator opens one persisted ProductDeliveryRun
  -> Director Planner freezes the DeepSeek-produced director-dsl-v1: semantic.design -> asset.realize -> assembly.verify
  -> semantic.design: Semantic Planner semantic-dsl-v9 typed tasks/target slots/capability aliases -> derive catalogs -> validate + freeze
  -> state machine activates one task
  -> deterministic capability slice -> one atomic Draft-write -> acceptance receipt
  -> next task -> Runtime validates, assembles, and completes deterministically
  -> GameSemanticSource / GameSemanticRevision
  -> asset.realize: dictionary-owned component realization
  -> event compiler + asset requirement compiler + layout compiler
  -> RuntimeLinker + spatial assembly request + official libGD project seed
  -> complete accepted AssetWorld v4
  -> GDJS resource binder + asset-bound project seed
  -> assembly.verify: native geometry facts
  -> source- and AssetWorld-bound native geometry facts
  -> Spatial Planner input (accepted assets + geometry + generated GDJS spatial truth + scene canvas)
  -> derived coordinate frame/layer stack/legal pixels
  -> visual LLM spatial-dsl-v1 candidate -> Runtime validation -> candidate GDJS projection + preview
  -> later ACCEPT -> canonical spatial resolution -> final GDJS projection
  -> official libGD HTML export -> tokenized loopback HTTP -> real Chrome/Edge capture
  -> independent assembly review bound to exact build and screenshot hashes
  -> accepted product

Assembly rejection
  -> exact-target, source-bound factual semantic-feedback-batch
  -> frozen Director repair route returns to semantic.design; LLM2 emits GameSemanticRevision through a new frozen TaskPlan
  -> activate new source hash and clear every downstream artifact reference
  -> rerun AssetWorld, spatial projection, browser capture, and assembly review
```

The dictionary records every declaration with source evidence and runtime availability and is the total production GDJS truth. Extractors compose the pinned component snapshots into this one artifact; production prompt, parser, Source validation, and compiler load only the generated dictionary. Parameter contracts are reordered by official runtime metadata and carry type class, optionality, exact default, generated normalization, and token vocabulary. Its event grammar records source-verified envelope fields, instruction channels, serialization parameters, emission rules, defaults, local variables, subevents, condition inversion, and action await. Source-only declarations remain queryable but cannot be emitted into a project. The event algebra does not duplicate declaration metadata: it names semantic operations, maps their open slots, and validates exact expansion structure against the dictionary.

Spatial semantics follow the same single-truth rule without entering the semantic dictionary. `packages/gdjs/generated/spatial-coordinate-truth.json` is generated from the pinned GDevelop/GDJS revision and owns coordinate, initial-camera, layer-stack, and z-order semantics. Spatial Runtime combines it with the selected scene canvas and the frozen dictionary layout snapshot to derive `spatial-planning-space`. Every Planner or Adapter boundary that holds the asset-bound seed re-derives and compares the seed-owned request, layout snapshot, and scene canvas, so a caller cannot re-sign a second scene or intent truth. The planning-space document gives the Planner an explicit `(0,0)` frame, axes, object-origin and display-size meaning, ordered layers, and legal pixel regions. The visual model chooses coordinates in `spatial-dsl-v1`; its parser, runtime, errors, and trace remain independent from `semantic-dsl-v9`. Only the GDJS Spatial Adapter serializes an accepted resolution into GDJS instances.

## Source and feedback contracts

`GameSemanticSource` v6 is strict and dictionary-pinned. It stores component instances beside entities, events, assets, and layout intent. A component instance contains one dictionary component reference, target, explicit `config`, and semantic bindings. Component authoring schema v3 has no parallel configuration shape. Defaults, inheritance, requirements, and implementation remain in the generated dictionary. Runtime expands the selected component into members, entities, behaviors, layouts, and events in private compilation material. The assembly exposes only a component-expansion evidence document with hashes, resolved configuration, and generated IDs; no second Source document crosses the boundary.

The public component grain is deliberately coarse. Action Button changes behavior through its action binding; Virtual Joystick changes direction and presentation through configuration. Both controls draw around their object center and use safe-area layout choices, making pointer-to-center direction comparisons symmetric. Cooldown Skill inherits a generic trigger/effect contract and adds readiness plus timer realization. State Machine receives a complete transition list and named condition/action bindings, then repeats one dictionary blueprint per transition. Individual jump buttons, attack buttons, states, and skill effects are instance configuration or bindings rather than new component types.

Exact event references are runtime output: LLM2 sees foundation entity, behavior, event, condition, action, expression, and complete component handles. Every event invocation retains runtime provenance (`use`, stable operation identifier, expansion part and size), its exact instruction channel, condition inversion or action await, and canonical normalized arguments. Event nodes retain recursive local variables and children. Member, asset, and layout bindings retain the same stable use plus its complete dictionary expansion. Member values use the official recursive GDJS variable types. Layouts, asset families/styles, extension groups, and retrieved extension object/behavior/event/operation kinds use compact handles. Internal `gdjs://...` and `gc-component://...` references remain runtime-only. Asset intents are compiled from the same Source as events and layout.

`semantic-feedback-batch` contains source-bound exact targets, observations, evidence, and descriptions. It has no owner route, repair instruction, `changeScope`, `maxRounds`, or autonomous decision field. LLM2 receives those facts, creates a new frozen TaskPlan as its only mutation scope, and decides the next source-bound Revision.

## Spatial contracts

`packages/spatial/contracts/spatial-engine-contract.json` separates intent from accepted layout. The semantic layout dictionary names relations and constraints; it has no resolved scene coordinates. `semantic-layout-compiler.js` derives a `reservation` from Source layout bounds and `semantic-runtime-linker.js` emits a `spatial-assembly-request`. Neither produces an instance position.

The selected GDJS scene canvas is derived from the exact asset-bound project: scene, project width/height, layers, and complete camera size/viewport facts. It is not an external device-screen input. `packages/spatial/src/spatial-planner-langgraph.js` gives one hash-bound semantic/component view and explicitly ordered accepted-image references to a visual LLM, which emits direct object-origin coordinate candidates. Dictionary anchors are preferences; Runtime validates safe regions, reservations, layers, z-order ranges, overlap, geometry, projection, and preview evidence without generating a first layout. Candidate GDJS projection feeds the same-path preview; only a later standalone ACCEPT with the actual projection and preview creates `spatial-layout-resolution`, the sole accepted spatial truth. Every external round is also persisted as diagnostic trace evidence. Final GDJS projection derives from the resolution. The project assembler and resource binder only carry facts across this boundary. They do not contain spatial math, asset-origin fallbacks, or a parallel object-coordinate dictionary. See [Spatial Planner and Runtime](spatial-engine.md).

## Asset contracts

The asset creation runtime is the official LangGraph in `packages/assets/src/asset-engine-langgraph.js`. `packages/assets/contracts/asset-engine-contract.json` owns both its ordered nine-stage graph and a resolvable module/export definition for every stage. `packages/assets/contracts/asset-engine-execution-profiles.json` is the only public execution-limit selector: production inherits pinned contract ceilings, while `asset-engine-test.v1` permits one generation-required work item, one production attempt, one two-candidate round, and one 180-second end-to-end deadline. Loose public timeout, batch, round, or attempt overrides are rejected. Graph startup validates the LangGraph runtime, resolves every declared definition, rejects extra or missing handlers, and then invokes the compiled graph. `SemanticRuntimeLinker.assetRequirements` is its only semantic-intent input; the complete accepted `AssetWorld` v4 and matching project seed are the only inputs to the GDJS resource binder. A caller cannot inject a previous or partial world.

The binding dictionary enumerates every official object configuration. Each record either declares no external resource or declares one exact resource kind, accepted formats, and official configuration operation.

- `image` resources use exact library reuse or the single master-image → deterministic-derivation path.
- `font`, `video`, `model3D`, `spine`, and `json` resources require an accepted materialized artifact with matching kind, format, file hash, and source hash.
- No resource type is converted into another type as a fallback.

`AssetLibrary` is the only cross-project reuse and publication boundary. Its production implementation is a thin domain adapter over the pinned [Supabase Storage](https://github.com/supabase/storage) service: Supabase owns PostgreSQL metadata, object atomicity and S3/MinIO persistence; GameCastle owns requirement fingerprints, accepted-revision validation and project-local materialization. It resolves only complete asset requirements, materializes a hash-verified accepted revision into the project, and receives newly accepted revisions for idempotent publication. It cannot choose an asset meaning or modify `GameSemanticSource`.

The cloud library is server-side only. A browser game consumes its project-bound resources after materialization; it never receives the service key and never talks to PostgreSQL, MinIO, Supabase Storage, or ComfyUI. `FrameSetRevision` is an equally first-class library payload: its identity is frame content plus animation structure, never the destination project path.

ComfyUI is not an asset processor. Its only registered image workflow is the hash-pinned SDXL Base→Refiner graph derived from the official ComfyUI SDXL example; the base owns the first 80% of latent denoising and the refiner owns the final 20%. It contains official core nodes only and returns exactly two transient candidates per round. Candidate prompts put the requested subject and composition first, express style positively, and keep negative clauses short. `CLIPImageReviewer` performs candidate semantic/composition gating and style/framing ranking without demanding transparency from the master. Once the selected master bytes are secured, the provider unloads both SDXL models and verifies ComfyUI health before BiRefNet starts. `AssetDerivationPipeline` then orchestrates deterministic processing: pinned `RembgBackgroundRemoval` owns BiRefNet segmentation, while `LocalDerivationKernel` owns trim, sizing, anchors, static materialization, and FrameSet transforms. A deterministic alpha policy rejects empty cutouts, nearly opaque backgrounds, and opaque perimeter contamination on every final image. `CLIPImageReviewer` reviews the actual final static pixels or every FrameSet frame. Missing or rejected final receipts block accepted AssetWorld v4, GDJS binding, and outbox. Cloud image reuse is keyed by the complete requirement plus exact Style DNA content and is re-reviewed when its receipt does not bind the current policy.

## Execution boundary

`apps/api/src/server.js` exposes the two current HTTP boundaries over authenticated loopback HTTP. `POST /product/deliver` calls `ProductDeliveryOrchestrator` and owns complete delivery. It accepts exactly product identity plus the initial user request, so semantic design owns normal initial Source creation. The product composition derives all storage paths, pins the dictionary, budgets, semantic settings, Asset policy and Spatial policy, and keeps constructor adapters as trusted bootstrap/test seams outside request data. HTTP request data cannot contain Source, storage paths, budgets, stage configuration, AssetWorld, stage results, capture/review adapters, lifecycle status, or repair scope. The internal programmatic orchestrator accepts one fully validated Source only for trusted bootstrap or resume.

The orchestrator fixes the order as `Source/Revision -> semantic-asset-product-pipeline -> official Asset LangGraph -> complete accepted AssetWorld -> asset-bound seed -> native geometry -> spatial-product-pipeline -> official Spatial LangGraph -> accepted final projection -> official libGD browser export -> real loopback browser capture -> independent assembly review`. Every artifact is hash-bound into `ProductDeliveryRun`. The capture authority additionally signs the complete browser evidence with a per-process HMAC; the reviewer accepts evidence only through that authority and rechecks the build manifest, response build hash, PNG bytes and viewport. Acceptance requires all completion references. A source-bound Revision activates a new source hash, invalidates AssetWorld and every later artifact, and reruns the complete downstream path. AssetCard is only a read-only projection over Source, AssetWorld, and the current run; it is never a fifth source of truth.

`ProductDeliveryRun` uses one cross-process lease per delivery. Every provider request uses a collision-resistant delivery namespace; its immutable receipt is atomically persisted under the product storage root. On recovery, receipts are loaded and reconciled into the run before new work. Semantic work is budget-authorized before a model call. Recovery of any nonterminal interrupted run preserves attempts, cost, elapsed time, semantic-cycle use and fuses, clears every downstream artifact reference, and reruns from the hash-addressed active Source. The second assembly attempt is reserved for one such interrupted full rerun; assembly failures are never locally retried. Changing an internal stage run id cannot reset a budget.

`POST /semantic/execute` calls `semantic-product-executor.js` as a strict deterministic sub-boundary. It accepts only a complete Source and optional source-bound Revision and returns a libGD `gdjs-project-seed`. It rejects AssetWorld and all product-loop fields; it does not call LLM2, run assets or spatial planning, capture a browser, review assembly, or claim delivery acceptance.

The WebSocket multiplayer server is independent of this boundary. It is responsible only for rooms, signaling, and synchronization after a game runtime exists.

## Verification

`npm run check:project` is the only complete acceptance gate. It verifies TaskPlan ownership and feasibility, the hash-chained semantic state machine, generated truth snapshots, Source/Revision rules, asset production and binding, ProductDeliveryRun ordering and invalidation, real-browser capture integrity, independent assembly review, feedback-to-Revision rerun, provider governance, and multiplayer runtime isolation. Narrower suites are diagnostic slices and cannot establish project acceptance on their own.
