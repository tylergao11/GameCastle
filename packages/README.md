# Package ownership and public boundaries

`packages/` contains reusable product capabilities. Package code must not import
from `apps/`, `tests/`, or `scripts/`.

## Public workspaces

New focused integrations and boundary verification use these three private npm
workspaces. `npm install` links them under `node_modules/@gamecastle/` and
`npm run check:modules` proves their public APIs through the workspace names.
The existing product delivery entry still uses the legacy runtime linker until
the compatibility-tested identity migration is complete.

| Workspace | Public authority | Example and focused verification |
| --- | --- | --- |
| `@gamecastle/semantic-module` | One generated dictionary, Source/Revision validation, and deterministic `SemanticAssembly`. It intentionally stops before libGD and spatial work. | `packages/semantic-module/examples/game-semantic-source-to-semantic-assembly.js`; `npm run check:semantic-module` |
| `@gamecastle/asset-engine` | Production Asset LangGraph facade plus deterministic offline `AssetRequirementSet -> AcceptedAssetWorld` conformance. | `packages/asset-engine/examples/deterministic-offline.js`; `npm run check:asset-module` |
| `@gamecastle/assembly-module` | `SemanticAssembly` plus an accepted AssetWorld to a GDJS seed, resource-bound seed, and canonical spatial handoff. | `packages/assembly-module/examples/semantic-assembly-to-project-seed.js`; `npm run check:assembly-module` |

Their public dependency direction is intentionally small:

```text
semantic-module ----> asset-engine --+
       +-------------------------------+--> assembly-module --> internal GDJS/spatial adapters
```

`asset-engine` declares `semantic-module` only for its constrained offline
semantic-to-asset converter; its production facade still delegates to the
canonical Asset LangGraph. `assembly-module` declares both public workspace
dependencies. Within this public path it does not call the legacy
`semantic-runtime-linker`.

## Canonical implementation owners

| Package | Authority |
| --- | --- |
| `semantic` | LLM2 TaskPlan loop, semantic DSL, Source/Revision validation, component expansion, compilation, and the generated semantic dictionary. |
| `assets` | Official Asset LangGraph, AssetWorld, deterministic derivation, review, library publication, contracts, and pinned workflows. |
| `spatial` | Visual Planner LangGraph, candidate validation, deterministic spatial runtime, and the sole accepted spatial resolution. |
| `product` | ProductDeliveryRun and the complete asset -> spatial -> browser assembly -> factual feedback -> LLM2 Revision loop. |
| `providers` | Provider governance, model transports, authorization, receipts, and runtime adapters. |
| `gdjs` | Pinned GDevelop truth, libGD compilation, resource binding, spatial projection, HTML export, and browser capture. |
| `network` | Multiplayer client/runtime synchronization, protocol contract, and generated network templates. |

Each contract, generated truth, component manifest, workflow, and template is
colocated with its canonical implementation owner. There is no repository-wide
`shared`, `runtime`, `contracts`, or `generated` truth directory.

## Migration status

This is a boundary extraction, not a claim that the historical implementation
packages are already acyclic or independently publishable. They still contain
cross-package imports, especially among `semantic`, `assets`, `providers`,
`gdjs`, and `spatial`. The public workspaces deliberately delegate to those
owners instead of copying contracts or generated data. The underlying owners
remain singular, but the legacy and public assembly documents currently have
different identities; `tests/modules/check-legacy-public-assembly-compatibility.js`
proves their executable projections agree. Removing the legacy internal cycles
and migrating persisted product identities are later, separately verifiable
migrations.
