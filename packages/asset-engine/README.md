# Asset Engine public module

`@gamecastle/asset-engine` is the public boundary for the existing production Asset LangGraph and a deterministic offline `AssetRequirementSet -> AcceptedAssetWorld` conformance run.

It intentionally keeps the existing asset contracts as the source of truth: final-world construction and validation delegate to `packages/assets/src/asset-world.js`, and production-family/recipe planning delegates to `packages/assets/src/asset-production-planner.js`. No asset contract JSON is copied into this package.

## Public API

```js
const {
  contracts,
  createOfflineRequirementSet,
  runProduction,
  runOffline,
  validateAcceptedAssetWorld
} = require('@gamecastle/asset-engine');

// The production entry delegates directly to the existing official LangGraph path.
const productionState = await runProduction(productionInput);

// The offline entry is only for deterministic contract verification.
const acceptedAssetWorld = await runOffline(assetRequirementSet);
validateAcceptedAssetWorld(acceptedAssetWorld, {
  sourceHash: assetRequirementSet.sourceHash
});
```

The package exposes exactly `contracts`, `createOfflineRequirementSet`,
`runProduction`, `runOffline`, and `validateAcceptedAssetWorld`.

`runProduction(input)` delegates without adapting input or output to `packages/assets/src/asset-engine-langgraph.js#runAssetEngine`. It is the only public production entry and retains that implementation's provider authorization, named execution profile, ledger, acceptance, and outbox behavior. Product delivery calls this production facade or the same canonical Asset LangGraph through the sole public assembly path.

The semantic-to-asset bridge is intentionally limited to `runOffline`; it does
not redirect the existing production orchestrator or imply that an arbitrary
`SemanticAssembly` can bypass the production asset acceptance flow.

`createOfflineRequirementSet({ semanticAssembly, projectId })` is the explicit
public bridge from the semantic module to the constrained offline harness. It
recompiles `semanticAssembly.source` and rejects forged or stale compiler
evidence before mapping a canonical semantic asset requirement. The offline
bridge accepts only single-resource image intents that explicitly permit PNG;
it selects that PNG subset, maps semantic roles to `semanticTags`, preserves
the applicable semantic fields, and defaults missing width/height to 32 pixels.
FrameSet, non-image, and no-PNG intents fail closed rather than being silently
flattened or reformatted.

```js
const semantic = require('@gamecastle/semantic-module');
const semanticAssembly = semantic.compileSemanticAssembly(source);
const assetRequirementSet = createOfflineRequirementSet({
  semanticAssembly,
  projectId: 'offline-semantic-demo'
});
const acceptedAssetWorld = await runOffline(assetRequirementSet);
```

`AssetRequirementSet` is schema version `1` and has this shape:

```js
{
  schemaVersion: 1,
  documentKind: 'asset-requirement-set',
  sourceHash: 'semantic.example.v1',
  projectId: 'example-project',
  requirements: [{
    semanticId: 'hero',
    subject: 'hero',
    description: 'A playable hero sprite',
    productionFamily: 'character',
    recipeId: 'character-sprite.v1',
    styleId: 'gamecastle.style-dna.v1',
    semanticTags: ['hero', 'character'],
    constraints: { width: 24, height: 32, transparent: true },
    acceptedFormats: ['png']
  }]
}
```

The offline runtime accepts only static PNG image requirements with dimensions from 1 through 256 pixels. It fails closed for animated, non-image, or alternate-format requests. By default, a generated slot uses an in-memory `data:image/png;base64,...` path. Pass an explicit absolute directory to materialize bindable files instead:

```js
const acceptedAssetWorld = await runOffline(assetRequirementSet, {
  assetDir: 'D:\\GameCastle\\artifacts\\asset-engine-demo'
});
```

Each materialized path is named `<sha256>.png`; the file is re-hashed before acceptance, and an occupied path with different bytes fails closed. The returned `AcceptedAssetWorld` is rebuilt with those file paths, so its `contentHash` remains valid for the materialized world.

## What this verifies

`runOffline` deterministically creates actual in-memory PNG bytes, hashes them, creates one source-bound work-item receipt and review receipt per requested slot, then builds and validates a complete `AcceptedAssetWorld`. Repeating the same input produces the same world.

This is an offline contract/conformance harness. It does not call a cloud library, ComfyUI, or CLIP, and its synthetic review receipt is not production visual-review evidence. Production orchestration remains in `packages/assets` until the broader package dependency cycles are removed.

Run the example:

```powershell
node packages/asset-engine/examples/deterministic-offline.js
node packages/asset-engine/examples/from-semantic-assembly.js
```

Run the targeted public-boundary check:

```powershell
node tests/modules/check-asset-engine-module.js
```
