# AI and deterministic compilation

The `ai/` directory contains the semantic compiler and asset engine. The name does not mean that every module calls a model: after LLM2 emits a semantic document, this layer is deterministic.

## Source of truth

`scripts/` extracts the pinned GDevelop no-code declarations, official runtime bindings, event grammar, project defaults, and object configuration facts. `ai/capability-semantic-dictionary.js` compiles those snapshots into `ai/semantic-mapping/capability-semantic-index.json`. Extraction and drift checks may read the component snapshots; the production semantic runtime loads only this generated dictionary.

No undocumented GDJS capability is inferred. A declaration is either executable, source-only, or rejected at validation time.

## Main modules

| Module | Purpose |
| --- | --- |
| `game-semantic-source.js` | Strict Source and Revision validation, event-operation provenance, recursive GDJS variable values, structure projection, and relative-value revisions. |
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
| `semantic-layout-compiler.js` | Source to declared layout realization. |
| `semantic-runtime-linker.js` | Combines the three compilers and materializes a libGD-validated project seed. |
| `gdjs-project-asset-binder.js` | Binds an accepted AssetWorld with an exact source hash. |
| `semantic-product-executor.js` | Product-facing deterministic Source/Revision execution boundary. |
| `asset-engine-langgraph.js` | Official LangGraph asset orchestration; exports `describeGraph()` so every contract-declared stage module and callable is resolved before invocation. |
| `semantic-asset-product-pipeline.js` | Sanctioned end-to-end entry: RuntimeLinker assembly → Asset LangGraph → debt gate → source-bound GDJS binding. |

## Invariants

- LLM2 writes one function-shaped semantic DSL batch through positive fill-in forms. The prompt contains no examples. Its provider call has no JSON schema or JSON response format; runtime parses and executes canonical `name(...)` commands.
- LLM1 and LLM2 use DeepSeek V4 Flash with medium thinking. LLM1 temperature is `1.5`; LLM2 temperature is `0`.
- Production LLM2 is bounded to eight rounds and 120 seconds. The Snake live probe defaults to one round and 120 seconds; atomic tests explicitly select two rounds for WRITE plus `complete()` or three for extension lookup plus WRITE plus `complete()`.
- Foundation event operations are stable prompt constructors derived from one event algebra. `retrieve` exposes exact dictionary operations from a selected extension when the design needs semantic space beyond those direct forms.
- The generated GDJS Semantic Dictionary is the total production truth for capabilities, official runtime parameter order/type/optionality/defaults, generated normalization/value domains, object types, behavior types, event grammar, and runtime availability.
- The event algebra owns semantic composition only. Initialization validates structural expansion variants, so an exact binding, kind, parameter, fixed operator, ordering rule, or nested expression drift fails closed.
- Event-operation provenance persists semantic use, stable slot, and expansion part/size beside exact dictionary invocations; binding provenance likewise retains one semantic use and its complete dictionary expansion. Compilation consumes exact dictionary references while later Drafts recover the original semantic multiplication.
- Runtime converts semantic text into serialized GDJS string expressions, finite numbers into number expressions, booleans and operators into official tokens, references into collision-safe internal names, and omitted/code-only parameters into official defaults.
- Source schema v4 accepts canonical dictionary references and canonical runtime-normalized argument shapes. Event connections retain the dictionary-selected instruction channel, condition inversion, action await, recursive event locals, and nested children.
- Event output uses source-derived serializer truth for type/envelope fields, instruction-list keys including `whileConditions`, parameter emission/defaults, local variables, and subevent emission.
- Member values follow the official recursive GDJS variable model: number, string, boolean, structure, or array.
- Model-facing context contains semantic operation names and extension-only handles rather than internal GDJS references.
- Numeric values are legal Source values. Relative edits use the Source policy rather than hidden runtime state.
- A semantic Source pins the complete dictionary fingerprint.
- AssetWorld, project seed, and bound project share one source hash.
- Feedback contains observed facts only and is returned to LLM2.
- Missing capabilities, resource kinds, files, formats, hashes, or bindings fail closed.

Run the complete semantic gate with:

```powershell
npm run check:semantic-engine
```
