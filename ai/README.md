# AI and deterministic compilation

The `ai/` directory contains the semantic compiler and asset engine. The name does not mean that every module calls a model: after LLM2 emits a semantic document, this layer is deterministic.

## Source of truth

`scripts/` extracts the pinned GDevelop no-code declarations, official runtime bindings, event grammar, project defaults, and object configuration facts. `ai/capability-semantic-dictionary.js` compiles those snapshots into `ai/semantic-mapping/capability-semantic-index.json`. Extraction and drift checks may read the component snapshots; the production semantic runtime loads only this generated dictionary.

No undocumented GDJS capability is inferred. A declaration is either executable, source-only, or rejected at validation time.

## Main modules

| Module | Purpose |
| --- | --- |
| `game-semantic-source.js` | Strict Source and Revision validation, event-operation provenance, recursive GDJS variable values, structure projection, and relative-value revisions. |
| `component-catalog.js` | Validates component authoring inputs and resolves internal inheritance before dictionary generation. |
| `component-expander.js` | Expands Source component instances into private compilation material and a public hash/ID evidence document. |
| `semantic-llm2-prompt.js` | Comdr-structured, zero-example system prompt plus current WORLD sections. |
| `semantic-dsl-syntax.js` / `semantic-dsl-parser.js` | Positive fill-in command grammar and strict plain-text DSL parsing. |
| `semantic-event-algebra.js` | Defines the stable game-event constructors and validates every exact expansion against the generated GDJS Semantic Dictionary. |
| `semantic-reference-runtime.js` | Resolves event algebra through the dictionary, expands selected extension groups, and normalizes internal references plus dictionary-typed parameter values. |
| `semantic-commander-context.js` | Builds foundation operations, parameter context, Draft, retrieve results, and task-ledger WORLD state. |
| `semantic-draft.js` | Executes open event DSL locally, builds nested event trees, expands one semantic operation into ordered invocations, allocates runtime slots, and materializes strict Source/Revision documents. |
| `semantic-run-ledger.js` | Records the completed DSL boundary and drives incremental continuation, repair, and fuse feedback. |
| `semantic-run-pipeline.js` | Applies one parsed batch left to right and returns runtime feedback plus remaining work. |
| `semantic-llm2-runtime.js` | Runs extension-read, Draft-write, and `complete()` rounds against DeepSeek V4 Flash. |
| `semantic-compiler.js` | Source to official GDJS events. |
| `semantic-asset-compiler.js` | Source to source-bound asset requirements, including resource kind and accepted formats. |
| `semantic-layout-compiler.js` | Source to dictionary layout intent plus derived reservation. |
| `semantic-runtime-linker.js` | Combines the three compilers, emits a spatial assembly request, and materializes an instance-free libGD project seed. |
| `gdjs-project-asset-binder.js` | Binds an accepted AssetWorld with an exact source hash and returns an asset-bound project seed. |
| `spatial-assembly-stage.js` | Derives one frozen assembly input from the asset-bound seed, native geometry facts, and GDJS scene-canvas facts. |
| `spatial-planner-langgraph.js` | Contract-declared LangGraph: visual LLM DSL candidate, Runtime validation, same-path GDJS preview feedback, later acceptance, and final projection. |
| `spatial-planner-context.js` / `spatial-planner-prompt.js` / `spatial-planner-dsl.js` | Frozen visual-planner slots, concise positive prompt, and strict `PLACE` / standalone `ACCEPT` grammar. |
| `spatial-product-pipeline.js` | Explicit accepted-asset-to-final-spatial-product bridge. |
| `runtime/spatial/` | Independent candidate validation, acceptance, and GDJS projection boundary; it does not design a first layout. |
| `semantic-product-executor.js` | Product-facing deterministic Source/Revision execution boundary. |
| `asset-engine-langgraph.js` | Official LangGraph asset orchestration; exports `describeGraph()` so every contract-declared stage module and callable is resolved before invocation. |
| `semantic-asset-product-pipeline.js` | Sanctioned asset path: RuntimeLinker assembly -> Asset LangGraph -> debt gate -> source-bound GDJS resource-binding seed. |

## Invariants

- LLM2 writes one function-shaped semantic DSL batch through positive fill-in forms. The prompt contains no examples. Its provider call has no JSON schema or JSON response format; runtime parses and executes canonical `name(...)` commands.
- LLM1 and LLM2 use DeepSeek V4 Flash with thinking enabled. LLM1 uses medium reasoning and temperature `1.5`; LLM2 uses high reasoning and temperature `0`.
- Production LLM2 is bounded to eight rounds and 120 seconds. The Snake live probe defaults to one round and 120 seconds; atomic tests explicitly select two rounds for WRITE plus `complete()` or three for extension lookup plus WRITE plus `complete()`.
- Foundation event operations are stable prompt constructors derived from one event algebra. `retrieve` exposes exact dictionary operations from a selected extension when the design needs semantic space beyond those direct forms.
- The generated GDJS Semantic Dictionary is the total production truth for capabilities, official runtime parameter order/type/optionality/defaults, generated normalization/value domains, object types, behavior types, event grammar, and runtime availability.
- The event algebra owns semantic composition only. Initialization validates structural expansion variants, so an exact binding, kind, parameter, fixed operator, ordering rule, or nested expression drift fails closed.
- Event-operation provenance persists semantic use, stable slot, and expansion part/size beside exact dictionary invocations; binding provenance likewise retains one semantic use and its complete dictionary expansion. Compilation consumes exact dictionary references while later Drafts recover the original semantic multiplication.
- Runtime converts semantic text into serialized GDJS string expressions, finite numbers into number expressions, booleans and operators into official tokens, references into collision-safe internal names, and omitted/code-only parameters into official defaults.
- Source schema v6 accepts canonical dictionary references, component instances, and canonical runtime-normalized argument shapes. Event connections retain the dictionary-selected instruction channel, condition inversion, action await, recursive event locals, and nested children.
- Component manifests are dictionary build inputs only. Production LLM2 and Runtime consume the generated `by_component` dictionary section, and the dictionary fingerprint pins the complete resolved component catalog.
- Component authoring schema v3 uses one term, `config`; the retired `slots` shape is rejected. Public components are complete frequent abilities, while abstract parents share internal configuration, bindings, and blueprint fragments.
- Action Button and Virtual Joystick cover common controls and use centered geometry inside dictionary-declared safe screen anchors. Cooldown Skill inherits the generic trigger/effect contract. State Machine stores named transitions whose condition/effect names resolve through the instance binding map. Runtime expands each selected component into generated members, entities, behaviors, layouts, and events before compilation.
- Internal compilation material never enters the assembly contract. The public component-expansion document contains the original source hash, realization hash, resolved configuration, and generated semantic IDs, so it cannot be submitted as a second Source.
- Event output uses source-derived serializer truth for type/envelope fields, instruction-list keys including `whileConditions`, parameter emission/defaults, local variables, and subevent emission.
- Member values follow the official recursive GDJS variable model: number, string, boolean, structure, or array.
- Model-facing context contains semantic operation names and extension-only handles rather than internal GDJS references.
- Numeric values are legal Source values. Relative edits use the Source policy rather than hidden runtime state.
- A semantic Source pins the complete dictionary fingerprint.
- AssetWorld, project seed, asset-bound project seed, and all later spatial artifacts share one source hash. A final spatial input additionally pins the exact AssetWorld hash.
- Semantic layout bounds are reservations. Resolved rectangles, object-origin positions, and GDJS instance coordinates are forbidden before asset-aware spatial assembly.
- Spatial Planner receives ordered accepted-image references, source/component facts, and a frozen GDJS scene/camera canvas, then proposes direct coordinates. Each external round is persisted for inspection. Candidate, projection, preview, and trace are evidence; `spatial-layout-resolution` is the only accepted spatial truth.
- Feedback contains observed facts only and is returned to LLM2.
- Missing capabilities, resource kinds, files, formats, hashes, or bindings fail closed.

Run the complete semantic gate with:

```powershell
npm run check:semantic-engine
```
