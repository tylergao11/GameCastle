# GameCastle architecture

## Design ownership

LLM1 supplies creative language. LLM2 is the only design authority: it fills semantic DSL with gameplay rules, design values, layout, and asset intent. It selects stable event-algebra operations, not GDJS capability declarations. The local semantic runtime executes each batch incrementally and materializes the complete `GameSemanticSource` or source-hash-checked `GameSemanticRevision`.

Both roles use DeepSeek V4 Flash with medium thinking. LLM1 uses creative temperature `1.5`; LLM2 uses temperature `0`.

Runtime owns deterministic mechanics: dictionary binding, official parameter ordering/default insertion, GDJS expression/token normalization, collision-safe internal reference generation, open-slot validation, scene/object variable routing, official recursive variable serialization, dictionary-declared event serialization, nested event construction, one-to-many operation expansion, persistent operation grouping, Draft ordering, slot allocation, completed-command deduplication, failure normalization, Source/Revision materialization, and compilation. It does not choose gameplay or design values.

The semantic runtime follows Comdr's incremental control model: semantic DSL → local incremental execution → runtime feedback → remaining work. Stable foundation event operations are present in the prompt before the first write. `retrieve` reads one selected extension kind and exposes its exact dictionary operations when the design extends beyond the direct foundation forms. Successful commands and failures enter `task-ledger`; the next round receives the updated semantic Draft and completes the remaining work. The same normalized failure fuses on its second occurrence.

LLM2 receives field meanings, current Draft facts, the previous applied batch, and positive fill-in syntax, then returns one batch of canonical `name(...)` commands. The prompt contains no examples. Its provider request does not set a JSON schema or JSON response format. JSON-compatible quoting is used inside DSL strings, arrays, objects, and nested expression parameters. Draft event operations expose `operationId`; updates use that identifier through `replace`.

Production LLM2 is bounded to eight rounds and 120 seconds. The real Snake probe defaults to one round and 120 seconds for atomic inspection; tests explicitly select two rounds for direct WRITE plus `complete()` or three for extension lookup plus WRITE plus `complete()`.

## Deterministic graph

```text
Pinned GDevelop source
  -> capability universe + official bindings + event grammar + object configuration truth
  -> GDJS Semantic Dictionary
  -> stable Event Algebra (dictionary-validated semantic composition)

LLM1 creative direction + task + Event Algebra + current WORLD
  -> LLM2 plain-text semantic DSL batch
  -> parser -> local incremental runtime -> feedback / remaining work
  -> GameSemanticSource / GameSemanticRevision
  -> event compiler + asset requirement compiler + layout compiler
  -> RuntimeLinker + official libGD project seed
  -> accepted AssetWorld
  -> GDJS asset binder + official libGD bound project
```

The dictionary records every declaration with source evidence and runtime availability and is the total production GDJS truth. Extractors compose the pinned component snapshots into this one artifact; production prompt, parser, Source validation, and compiler load only the generated dictionary. Parameter contracts are reordered by official runtime metadata and carry type class, optionality, exact default, generated normalization, and token vocabulary. Its event grammar records source-verified envelope fields, instruction channels, serialization parameters, emission rules, defaults, local variables, subevents, condition inversion, and action await. Source-only declarations remain queryable but cannot be emitted into a project. The event algebra does not duplicate declaration metadata: it names semantic operations, maps their open slots, and validates exact expansion structure against the dictionary.

## Source and feedback contracts

`GameSemanticSource` v4 is strict and dictionary-pinned. Its exact event references are runtime output: LLM2 sees foundation entity, behavior, event, condition, action, and expression names. Every event invocation retains runtime provenance (`use`, stable semantic slot, expansion part and size), its exact instruction channel, condition inversion or action await, and canonical normalized arguments. Event nodes retain recursive local variables and children. Member, asset, and layout bindings retain the same stable use plus its complete dictionary expansion. Member values use the official recursive GDJS variable types. Layouts, asset families/styles, extension groups, and retrieved extension object/behavior/event/operation kinds use compact handles. Internal `gdjs://...` references remain runtime-only. Asset intents are compiled from the same Source as events and layout.

`semantic-feedback-batch` contains source-bound observations, evidence, and descriptions. It has no owner route, repair instruction, or autonomous decision field. LLM2 receives those facts and decides the next Source or Revision.

## Asset contracts

The asset creation runtime is the official LangGraph in `ai/asset-engine-langgraph.js`. `shared/asset-engine-contract.json` owns both its ordered nine-stage graph and a resolvable module/export definition for every stage. Graph startup validates the LangGraph runtime, resolves every declared definition, rejects extra or missing handlers, and then invokes the compiled graph. `SemanticRuntimeLinker.assetRequirements` is its only semantic-intent input; the accepted `AssetWorld` and matching project seed are the only inputs to the GDJS asset binder.

The binding dictionary enumerates every official object configuration. Each record either declares no external resource or declares one exact resource kind, accepted formats, and official configuration operation.

- `image` resources use exact library reuse or the single master-image → deterministic-derivation path.
- `font`, `video`, `model3D`, `spine`, and `json` resources require an accepted materialized artifact with matching kind, format, file hash, and source hash.
- No resource type is converted into another type as a fallback.

`AssetLibrary` is the only cross-project reuse and publication boundary. Its production implementation is a thin domain adapter over the pinned [Supabase Storage](https://github.com/supabase/storage) service: Supabase owns PostgreSQL metadata, object atomicity and S3/MinIO persistence; GameCastle owns requirement fingerprints, accepted-revision validation and project-local materialization. It resolves only complete asset requirements, materializes a hash-verified accepted revision into the project, and receives newly accepted revisions for idempotent publication. It cannot choose an asset meaning or modify `GameSemanticSource`.

The cloud library is server-side only. A browser game consumes its project-bound resources after materialization; it never receives the service key and never talks to PostgreSQL, MinIO, Supabase Storage, or ComfyUI. `FrameSetRevision` is an equally first-class library payload: its identity is frame content plus animation structure, never the destination project path.

ComfyUI is not an asset processor. Its registered SD1.5 graph contains only core checkpoint, prompt, latent, sampler, decode, and save nodes and returns transient master candidates. `AssetDerivationPipeline` orchestrates accepted-candidate processing; the pinned `RembgBackgroundRemoval` owner performs BiRefNet segmentation, while `LocalDerivationKernel` owns deterministic trim, sizing, anchors, static materialization, and FrameSet transforms. Only accepted outputs can reach GDJS or the asynchronous publication outbox.

## Execution boundary

`POST /semantic/execute` is implemented by `server/semantic-engine-api.js`. It takes a complete Source, optional Revision, and optional accepted AssetWorld. It returns either `gdjs-project-seed` or `gdjs-bound-project`. Unknown fields are rejected.

The endpoint does not invoke the asset LangGraph. Asset production is an explicit server/application orchestration step because it can call ComfyUI, write project files, access the private cloud library, and mutate the publication outbox. `semantic-asset-product-pipeline.js#run` is the sanctioned production entry and fixes the order as `RuntimeLinker assembly -> runAssetEngine(assembly.assetRequirements) -> debt gate -> bind(assembly.projectSeed, assetState.assetWorld)`; source-hash checks prevent mixing outputs from different semantic sources.

The WebSocket multiplayer server is independent of this boundary. It is responsible only for rooms, signaling, and synchronization after a game runtime exists.

## Verification

`npm run check:semantic-engine` verifies the generated truth snapshots, full dictionary coverage, Source/Revision rules, fact-only feedback, asset binding, non-image resource ingestion, product execution API, seven family architecture coverage, and asset production contracts.
