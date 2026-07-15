# Asset engine operations

## Runtime entry and boundary

`ai/semantic-asset-product-pipeline.js#run` is the production entry. It validates Source/Revision, asks `semantic-runtime-linker.js` for one source-bound assembly, passes its exact `SemanticAssetRequirements` to `asset-engine-langgraph.js#runAssetEngine`, blocks on any asset debt, and binds the accepted `AssetWorld` to the project seed from the same source hash.

```js
var result = await semanticAssetProductPipeline.run({
  runId: runId,
  projectId: projectId,
  source: source,
  projectAssetDir: projectAssetDir,
  assetEngine: {
    providerRuntime: providerRuntime,
    assetLibraryPort: assetLibraryPort,
    modelPolicy: modelPolicy
  }
});
var boundProject = result.artifact;
```

`POST /semantic/execute` remains a deterministic execution boundary. It never starts ComfyUI or writes assets: callers either request a seed without `assetWorld`, or run the asset graph first and submit its accepted `assetWorld` to obtain a bound project. This separation keeps model calls, filesystem writes, cloud credentials, and outbox mutation outside the deterministic product executor.

## Official LangGraph

The engine loads the official `@langchain/langgraph` package and requires `Annotation.Root`, `StateGraph`, `START`, and `END`. The ordered graph and every stage's module exports are declared in `shared/asset-engine-contract.json`. Startup calls `describeGraph()` and fails closed when a stage id, module, or export is missing; handler ids must also exactly match the contract.

```text
START
  -> asset-intake
  -> local-input-archive
  -> asset-library-search
  -> model-authorize
  -> asset-production-plan
  -> asset-resolve
  -> asset-production
  -> asset-finalize
  -> asset-publication-enqueue
  -> END
```

| Stage | Definition owner | Materialized state |
| --- | --- | --- |
| `asset-intake` | `asset-engine-langgraph.js#compileSpecs` | `assetSpecs`, `productionRequest` |
| `local-input-archive` | `asset-engine-langgraph.js#archiveLocalInputs` | immutable local-input records |
| `asset-library-search` | `asset-library.js#create` | exact library matches and acceleration events |
| `model-authorize` | `model-policy-gate.js#authorizeModelPorts`, `provider-runtime-adapters.js#createAssetProviderPorts` | authorized master-image ports and policy receipt |
| `asset-production-plan` | `asset-production-planner.js#compile` | pinned work items, recipe stages, coverage policy |
| `asset-resolve` | `asset-production-resolver.js#resolveProductionSet` | verified local/library candidates and resolution debts |
| `asset-production` | `asset-production-pipeline.js#runProductionSet` | accepted revisions, immutable receipts, blocking debts |
| `asset-finalize` | `asset-engine-langgraph.js#productionProjection`, `asset-world.js#buildAssetWorld` | manifest, binding manifest, AssetWorld, reports |
| `asset-publication-enqueue` | `asset-publication-outbox.js#create` | durable entries for new accepted revisions only |

The graph is deliberately linear; reuse versus creation is resolved as data inside `asset-resolve` and `asset-production`. This guarantees every run reaches the same finalization, debt reporting, and outbox gate instead of bypassing acceptance through a conditional edge.

## Image creation path

```text
exact AssetLibrary hit
  -> hash-verified project-local materialization

library miss
  -> core-node ComfyUI SD1.5 batch
  -> deterministic candidate quality selection
  -> transient MasterImageRevision
  -> pinned BiRefNet removal when transparency is required
  -> deterministic trim / fit / anchor
  -> static PNG or FrameSetRevision
  -> acceptance receipt
```

`ai/comfyui-local-provider.js` owns only the loopback ComfyUI protocol and the registered core-node workflow `gamecastle.master-image.sd15.v1`. It does not crop, remove backgrounds, create masks, resize, review, or animate.

`ai/asset-derivation-pipeline.js` owns processing orchestration. `RembgBackgroundRemoval` owns opaque-background segmentation; `LocalDerivationKernel` owns deterministic PNG normalization, alpha trim, canvas fitting, anchors, and FrameSet transforms. Master images are transient, non-playable, and non-publishable.

Background removal uses the MIT-licensed `vendor/rembg` submodule pinned to tag `v2.0.75` and commit `7b8de60ef9fc225af1768d81aa09da29db22a355`. `birefnet-general-lite.onnx` is accepted only when its SHA-256 matches `shared/background-removal-contract.json`.

```powershell
git submodule update --init --recursive
powershell -ExecutionPolicy Bypass -File scripts/setup-rembg.ps1
```

## Acceptance and publication

- Exact cloud matches must satisfy the complete requirement fingerprint and pass hash verification after materialization.
- Image misses require one transient master-image batch followed by accepted derivation.
- Non-image resources require an explicit local artifact with matching resource kind, format, and SHA-256.
- `FrameSetRevision` owns animation states, ordered frames, timing, loop policy, canvas, and anchor. A sprite sheet is only a projection.
- Missing definitions, providers, files, hashes, formats, model budget, or coverage become blocking debt. There are no placeholders, compatibility readers, or silent retries.
- Only newly accepted revisions enter the durable outbox. Library reuse never republishes the same revision.
- Outbox draining is asynchronous and owned by `asset-library-publisher.js`; the browser never receives storage service credentials.

## Verification

```powershell
npm run asset:graph
node ai/check-asset-engine-langgraph.js
node ai/check-semantic-asset-product-pipeline.js
node ai/check-comfyui-local-provider.js
node ai/check-rembg-background-removal.js
node ai/check-asset-production-pipeline.js
node ai/check-animated-asset-engine.js
npm run check:semantic-engine
npm run check:provider
npm run build
```
