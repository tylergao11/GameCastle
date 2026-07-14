# AI and deterministic compilation

The `ai/` directory contains the semantic compiler and asset engine. The name does not mean that every module calls a model: after LLM2 emits a semantic document, this layer is deterministic.

## Source of truth

`scripts/` extracts the pinned GDevelop no-code declarations, official runtime bindings, event grammar, project defaults, and object configuration facts. `ai/capability-semantic-dictionary.js` compiles those snapshots into the generated semantic dictionary at `ai/semantic-mapping/capability-semantic-index.json`.

No undocumented GDJS capability is inferred. A declaration is either executable, source-only, or rejected at validation time.

## Main modules

| Module | Purpose |
| --- | --- |
| `game-semantic-source.js` | Strict Source and Revision validation, structure projection, and relative-value revisions. |
| `semantic-context-provider.js` | Explicit dictionary read operations for LLM2. |
| `semantic-compiler.js` | Source to official GDJS events. |
| `semantic-asset-compiler.js` | Source to source-bound asset requirements, including resource kind and accepted formats. |
| `semantic-layout-compiler.js` | Source to declared layout realization. |
| `semantic-runtime-linker.js` | Combines the three compilers and materializes a libGD-validated project seed. |
| `gdjs-project-asset-binder.js` | Binds an accepted AssetWorld with an exact source hash. |
| `semantic-product-executor.js` | Product-facing deterministic Source/Revision execution boundary. |
| `asset-engine-langgraph.js` | Asset acceptance orchestration; image and non-image resource paths are explicit. |

## Invariants

- LLM2 writes Source, Revision, or an exact dictionary query.
- Numeric values are legal Source values. Relative edits use the Source policy rather than hidden runtime state.
- A semantic Source pins the complete dictionary fingerprint.
- AssetWorld, project seed, and bound project share one source hash.
- Feedback contains observed facts only and is returned to LLM2.
- Missing capabilities, resource kinds, files, formats, hashes, or bindings fail closed.

Run the complete semantic gate with:

```powershell
npm run check:semantic-engine
```
