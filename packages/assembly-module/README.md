# Assembly module

`@gamecastle/assembly-module` is the public boundary from a public
`SemanticAssembly` and an accepted `AcceptedAssetWorld` to a GDJS project
seed, asset-bound seed, and spatial-planning input.

It deliberately delegates each source of truth instead of copying contracts:

- `@gamecastle/semantic-module` owns `SemanticAssembly` compilation.
- `@gamecastle/asset-engine` owns `AcceptedAssetWorld` validation.
- the pinned GDJS assembler/binder own seed and resource projection.
- the canonical geometry producer and spatial assembly stage own spatial facts.

The module does not call the product orchestrator, generate a spatial plan, or
claim browser-reviewed delivery. `runDelivery` means the deterministic
assembly handoff through a validated spatial-planning input.

## Public API

All methods use named input objects and reject unknown fields.

```js
const assembly = require('@gamecastle/assembly-module');

const projectSeed = assembly.createProjectSeed({ semanticAssembly });
const assetBoundProjectSeed = assembly.bindAcceptedAssets({
  semanticAssembly,
  projectSeed,
  acceptedAssetWorld
});
const spatialAssemblyInput = assembly.prepareSpatialAssembly({
  semanticAssembly,
  projectSeed,
  assetBoundProjectSeed,
  acceptedAssetWorld
});

const delivery = assembly.runDelivery({
  semanticAssembly,
  acceptedAssetWorld
});
```

`createProjectSeed` and `runDelivery` may instead receive `{ source }`. That
is the explicit source route: the module calls only
`@gamecastle/semantic-module#compileSemanticAssembly` before continuing.
When a `SemanticAssembly` is supplied, its source, realized source, component
expansion, compiler evidence, and content hash are verified before GDJS
assembly. The module recompiles from `SemanticAssembly.source` and rejects any
input whose complete evidence does not exactly match that canonical result.
`bindAcceptedAssets` requires the same `semanticAssembly` (or `{ source }`) so
it can rederive and compare the project seed before resource binding.

`prepareSpatialAssembly` never accepts caller-supplied geometry. It derives
the geometry fact set from the exact accepted asset bytes, then passes it to
the canonical spatial stage. This prevents a second geometry truth from being
introduced at the public boundary. It also requires the original `projectSeed`
so the asset-bound seed must prove it is bound to that exact seed.

## libGD requirement

Creating or binding a GDJS seed invokes the pinned official libGD compiler.
Set `GAMECASTLE_LIBGD_PATH` to a `libGD.js` file whose sibling is the matching
pinned `libGD.wasm`, or prepare the repository runtime first. The runtime
verifies both hashes even for an explicit override. The semantic module does
not require libGD; only this seed-producing boundary does.

```powershell
npm run runtime:prepare
$env:GAMECASTLE_LIBGD_PATH = (Resolve-Path '.gamecastle/cache/gdevelop/codegen/libGD.js')
node packages/assembly-module/examples/semantic-assembly-to-project-seed.js
node tests/modules/check-assembly-module.js
```
