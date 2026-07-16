# Package ownership and public boundaries

`packages/` contains reusable product capabilities. Package code must not import
from `apps/`, `tests/`, or `scripts/`.

## Call chain (composition root)

```text
apps/api  (HTTP)
   |
   v
product   ProductDeliveryOrchestrator  <--- composition root
   |-- semantic.design  --> semantic LLM2  (injected modelPort/providerRuntime)
   |-- asset.realize    --> semantic-asset-product-pipeline
   |                         |-- @gamecastle/semantic-module
   |                         |-- @gamecastle/assembly-module
   |                         '-- assets Asset LangGraph
   |-- assembly.verify  --> spatial-product-pipeline
                             |-- spatial (plannerPort + previewPort injected here)
                             |-- gdjs browser capture (spatialEngine injected)
                             '-- assembly review
```

Product is the only layer that wires cross-domain ports. Domain packages do not
default-construct each other's transports.

## Public workspaces

| Workspace | Public authority | Focused check |
| --- | --- | --- |
| `@gamecastle/semantic-module` | Dictionary + Source/Revision + `SemanticAssembly` | `npm run check:semantic-module` |
| `@gamecastle/asset-engine` | Asset LangGraph façade + offline AssetWorld | `npm run check:asset-module` |
| `@gamecastle/assembly-module` | Seed + bind + spatial handoff | `npm run check:assembly-module` |

```text
semantic-module ----> asset-engine --+
       +-------------------------------+--> assembly-module --> gdjs/spatial adapters
```

## Canonical owners

| Package | Authority |
| --- | --- |
| `semantic` | LLM2 TaskPlan, DSL, Source/Revision, SemanticAssembly compile |
| `assets` | Asset LangGraph, AssetWorld, derivation, library, asset model policy |
| `spatial` | Spatial planner/runtime (ports injected) |
| `product` | ProductDeliveryRun and full delivery composition |
| `providers` | Transport, receipts, governance (no asset/domain adapters) |
| `gdjs` | libGD seed, resource bind, HTML export, capture, spatial preview renderer |
| `network` | Multiplayer only |

## Dependency rules (enforced)

`tests/modules/check-package-boundaries.js` (via `npm run check:modules`):

- **acyclic** code requires among packages
- **forbidden reverse edges** (examples):
  - no `semantic -> providers|assets|gdjs|spatial|product`
  - no `assets -> providers` (policy lives in assets; ProviderRuntime is injected)
  - no `providers -> assets|semantic|gdjs|spatial|product`
  - no `spatial -> providers` (plannerPort from product)
  - no `gdjs -> spatial` (spatialEngine injected into capture/preview)

Contract JSON data under another package may still be read; the gate ignores `*.json`.

## Sole assembly identity

- Owner: `packages/semantic/src/semantic-assembly.js`
- Façade: `@gamecastle/semantic-module` re-exports only
- Seed identity: `projectSeed.assemblyHash === SemanticAssembly.contentHash`
- Gate: `tests/modules/check-public-assembly-identity.js`
