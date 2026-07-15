# AI and deterministic compilation

The `ai/` directory contains the semantic compiler, asset engine, spatial assembly pipeline, and product delivery loop. The name does not mean that every module calls a model: deterministic boundaries own validation, compilation, evidence binding, lifecycle, and fail-closed transitions.

## Source of truth

`scripts/` extracts the pinned GDevelop no-code declarations, official runtime bindings, event grammar, project defaults, and object configuration facts. `ai/capability-semantic-dictionary.js` compiles those snapshots into `ai/semantic-mapping/capability-semantic-index.json`. Extraction and drift checks may read the component snapshots; the production semantic runtime loads only this generated dictionary.

No undocumented GDJS capability is inferred. A declaration is either executable, source-only, or rejected at validation time.

## Main modules

| Module | Purpose |
| --- | --- |
| `game-semantic-source.js` | Strict Source and Revision validation, event-operation provenance, recursive GDJS variable values, structure projection, and relative-value revisions. |
| `component-catalog.js` | Validates component authoring inputs and resolves internal inheritance before dictionary generation. |
| `component-expander.js` | Expands Source component instances into private compilation material and a public hash/ID evidence document. |
| `semantic-prompt-bundle.js` / `semantic-llm2-prompt.js` | Versioned zero-example Planner and Executor stable prefixes plus ordered L2-L4 incremental context and runtime hashes. |
| `semantic-dsl-syntax.js` / `semantic-dsl-parser.js` | Positive fill-in command grammar and strict plain-text DSL parsing. |
| `semantic-event-algebra.js` | Defines the stable game-event constructors and validates every exact expansion against the generated GDJS Semantic Dictionary. |
| `semantic-reference-runtime.js` | Resolves event algebra through the dictionary, expands selected extension groups, and normalizes internal references plus dictionary-typed parameter values. |
| `semantic-task-plan.js` | Owns the strict generic TaskPlan, capability slices, target scope, intent feasibility, plan hash, and task write receipts. |
| `semantic-commander-context.js` | Builds Planner discovery context and exact active-task facts without broadcasting the complete Draft or catalog. |
| `semantic-draft.js` | Executes open event DSL locally, builds nested event trees, expands one semantic operation into ordered invocations, allocates runtime slots, and materializes strict Source/Revision documents. |
| `semantic-task-draft-slice.js` | Projects the compact global identity index plus authoritative active/dependency facts from the one Draft owner. |
| `semantic-run-state-machine.js` | Owns the immutable hash-chained run ledger, projected state, legal mode, task order, one failure fuse, and terminal truth. |
| `semantic-run-observer.js` | Records prompt hashes/bytes, cache usage, model latency, output, and deterministic outcomes without controlling state. |
| `semantic-run-pipeline.js` | Validates that one parsed response contains exactly one legal plan, write, or completion batch. |
| `semantic-llm2-runtime.js` | Seals a TaskPlan, resolves each task's capabilities deterministically, commits one atomic write batch per active task, and finalizes with `complete()`. |
| `provider-runtime.js` | Sole provider invocation boundary; enforces role policy and cost reservation, then atomically stores immutable redacted receipts for crash reconciliation. |
| `semantic-compiler.js` | Source to official GDJS events. |
| `semantic-asset-compiler.js` | Source to source-bound asset requirements, including resource kind and accepted formats. |
| `semantic-layout-compiler.js` | Source to dictionary layout intent plus derived reservation. |
| `semantic-runtime-linker.js` | Combines the three compilers, emits a spatial assembly request, and materializes an instance-free libGD project seed. |
| `gdjs-project-asset-binder.js` | Binds an accepted AssetWorld with an exact source hash and returns an asset-bound project seed. |
| `spatial-assembly-stage.js` | Derives one frozen assembly input from the asset-bound seed, native geometry facts, generated GDJS spatial truth, and scene-canvas facts. |
| `spatial-planner-langgraph.js` | Contract-declared LangGraph: visual LLM DSL candidate, Runtime validation, same-path GDJS preview feedback, later acceptance, and final projection. |
| `spatial-planner-context.js` / `spatial-planner-prompt.js` / `spatial-planner-dsl.js` | Frozen visual-planner slots, concise positive prompt, and strict `PLACE` / standalone `ACCEPT` grammar. |
| `spatial-product-pipeline.js` | Explicit accepted-asset-to-final-spatial-product bridge. |
| `spatial-geometry-fact-producer.js` | Derives source- and AssetWorld-bound native render geometry for spatial planning. |
| `runtime/spatial/` | Derives the exact planning space, validates candidates and acceptance, and projects GDJS; it does not design a first layout. |
| `semantic-product-executor.js` | Strict deterministic Source/Revision compilation sub-boundary; it does not accept AssetWorld or run product stages. |
| `asset-engine-langgraph.js` | Official LangGraph asset orchestration; exports `describeGraph()` so every contract-declared stage module and callable is resolved before invocation. |
| `semantic-asset-product-pipeline.js` | Sanctioned asset path: RuntimeLinker assembly -> Asset LangGraph -> debt gate -> source-bound GDJS resource-binding seed. |
| `product-delivery-run.js` | Persisted hash-bound lifecycle, stage budgets, cross-process lease, artifact references, invalidation, recovery, fuses, and terminal truth for one delivery. |
| `product-failure-classifier.js` / `product-feedback-builder.js` | Separates system failures from semantic quality observations and emits exact-target factual FeedbackBatch documents. |
| `asset-card-projector.js` | Read-only Source/AssetWorld/run projection for product inspection; never a truth or mutation input. |
| `gdjs-browser-capture.js` / `gdjs-headless-browser-capture-port.js` | Exports the accepted projection through official libGD, serves it over tokenized loopback HTTP, captures a real browser frame, binds build/image hashes, and signs evidence with the product capture authority. |
| `assembly-reviewer.js` / `assembly-review-provider-port.js` | Independently verifies the signed browser evidence and returns exact-target factual assembly observations with in-viewport pixel regions, or acceptance. |
| `product-delivery-orchestrator.js` | Sole complete-product coordinator from initial Source/Revision through assets, spatial projection, browser capture, assembly review, factual feedback, and full downstream rerun. |

## Invariants

- LLM2 first writes one `plan-task(...)` batch. Runtime freezes it, then asks the Executor for one function-shaped Draft-write batch per active task and finally `complete()` alone. Prompts contain no examples and provider calls use no JSON schema or JSON response format.
- TaskPlan is LLM2's only mutation scope. A source-bound `feedbackBatch` supplies exact observed targets and evidence but cannot carry `changeScope`, `maxRounds`, route, owner, or repair commands.
- LLM1 and LLM2 use DeepSeek V4 Flash with thinking enabled. LLM1 uses medium reasoning and temperature `1.5`; LLM2 uses high reasoning and temperature `0`.
- Production LLM2 has a 120-second hard total deadline, with local Planner/task/finalization call caps of 25/20/8 seconds. Progress is state-machine driven; there is no round-count input or terminal round truth.
- Foundation event operations are stable prompt constructors derived from one event algebra. A frozen task declares extension retrieval; Runtime resolves it deterministically and injects only the exact facts into that task, without another model call.
- The generated GDJS Semantic Dictionary is the total production truth for capabilities, official runtime parameter order/type/optionality/defaults, generated normalization/value domains, object types, behavior types, event grammar, and runtime availability.
- The event algebra owns semantic composition only. Initialization validates structural expansion variants, so an exact binding, kind, parameter, fixed operator, ordering rule, or nested expression drift fails closed.
- Event-operation provenance persists semantic use, stable slot, and expansion part/size beside exact dictionary invocations; binding provenance likewise retains one semantic use and its complete dictionary expansion. Compilation consumes exact dictionary references while later Drafts recover the original semantic multiplication.
- Runtime converts semantic text into serialized GDJS string expressions, finite numbers into number expressions, booleans and operators into official tokens, references into collision-safe internal names, and omitted/code-only parameters into official defaults.
- Source schema v6 accepts canonical dictionary references, component instances, and canonical runtime-normalized argument shapes. Event connections retain the dictionary-selected instruction channel, condition inversion, action await, recursive event locals, and nested children.
- Component manifests are dictionary build inputs only. Production LLM2 and Runtime consume the generated `by_component` dictionary section, and the dictionary fingerprint pins the complete resolved component catalog.
- Component authoring schema v3 has one configuration field, `config`. Public components are complete frequent abilities, while abstract parents share internal configuration, bindings, and blueprint fragments.
- Action Button and Virtual Joystick cover common controls and use centered geometry inside dictionary-declared safe screen anchors. Cooldown Skill inherits the generic trigger/effect contract. State Machine stores named transitions whose condition/effect names resolve through the instance binding map. Runtime expands each selected component into generated members, entities, behaviors, layouts, and events before compilation.
- Internal compilation material never enters the assembly contract. The public component-expansion document contains the original source hash, realization hash, resolved configuration, and generated semantic IDs, so it cannot be submitted as a second Source.
- Event output uses source-derived serializer truth for type/envelope fields, instruction-list keys including `whileConditions`, parameter emission/defaults, local variables, and subevent emission.
- Member values follow the official recursive GDJS variable model: number, string, boolean, structure, or array.
- Model-facing context contains semantic operation names and extension-only handles rather than internal GDJS references.
- Numeric values are legal Source values. Relative edits use the Source policy rather than hidden runtime state.
- A semantic Source pins the complete dictionary fingerprint.
- A complete accepted AssetWorld v4, project seed, asset-bound project seed, and all later spatial artifacts share one source hash. A final spatial input additionally pins the exact AssetWorld hash. Callers cannot inject a previous or partial world.
- Semantic layout bounds are reservations. Resolved rectangles, object-origin positions, and GDJS instance coordinates are forbidden before asset-aware spatial assembly.
- Spatial Planner receives ordered accepted-image references, source/component facts, and `spatial-planning-space`: an explicit coordinate frame, layer stack, and dictionary-derived legal pixel regions bound to the generated fixed-version GDJS spatial truth. It then proposes direct coordinates. Each external round is persisted for inspection. Candidate, projection, preview, and trace are evidence; `spatial-layout-resolution` is the only accepted spatial truth.
- `spatial-dsl-v1` and LLM2's `semantic-dsl-v2` have distinct language identifiers, parsers, runtimes, errors, and traces. The GDJS Spatial Adapter, not either model, serializes accepted coordinates into GDJS instances.
- `ProductDeliveryRun` is the only cross-stage lifecycle truth. Its product-owned budgets are authorized before work, one cross-process lease serializes execution, and interrupted nonterminal recovery preserves usage/fuses while invalidating all downstream references. Activating a new source hash clears AssetWorld, bound seed, geometry, spatial resolution/projection, browser capture, assembly review, and AssetCard projections before any rerun.
- Assembly acceptance requires the exact final projection to be exported, loaded over loopback HTTP by a real browser, captured without runtime/network/console errors, HMAC-signed by the product capture authority, and reviewed independently against immutable build and screenshot hashes.
- Feedback contains observed facts only and is returned to LLM2. Only classified semantic quality observations may trigger Revision; provider, contract, evidence, filesystem, and runtime faults block as system failures.
- Missing capabilities, resource kinds, files, formats, hashes, or bindings fail closed.

Run the complete semantic gate with:

```powershell
npm run check:semantic-loop
npm run check:semantic-engine
npm run check:product-loop
```

The semantic-loop gate includes all six benchmark tasks, deterministic replay parity, cache/latency assertions, and the independent semantic oracle. It is offline evidence; run the separately authorized live probe only when a real-model rate is required.
