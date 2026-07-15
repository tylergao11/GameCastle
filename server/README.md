# Server services

This directory contains two independent services.

## Product Engine API

`product-engine-api.js` exposes the product engine on `PRODUCT_ENGINE_PORT` (`3030` by default):

- `POST /product/deliver` delegates to `ProductDeliveryOrchestrator`, the sole complete-product coordinator. LLM2 creates the initial Source and any source-bound Revision. The coordinator owns complete AssetWorld production, asset-bound seed creation, native geometry, accepted spatial projection, official libGD export, real-browser capture, independent assembly review, factual FeedbackBatch creation, downstream invalidation, and full rerun.
- `POST /semantic/execute` is only the strict deterministic Source/Revision compilation sub-boundary. It accepts `requestId`, a complete `source`, and an optional source-bound `revision`; unknown fields are rejected. It does not accept AssetWorld, call LLM2, run providers, write assets, perform spatial assembly, or claim product acceptance.

```powershell
$env:PRODUCT_ENGINE_TOKEN = '<local-secret>'
npm run product:serve
```

The service refuses startup without `PRODUCT_ENGINE_TOKEN`, listens only on loopback, requires a Bearer token, accepts JSON only, and returns a sanitized product projection. `POST /product/deliver` accepts exactly `deliveryId`, `projectId`, `userRequest`, and `creativeVision`. The product composition owns `PRODUCT_ENGINE_STORAGE_ROOT`, derives all delivery paths, fixes the contract budgets and stage policy, and stores each accepted Source version by hash. An HTTP caller cannot inject Source, a previous or partial AssetWorld, paths, budgets, stage configuration, capture/review adapters, lifecycle state, repair route, or mutation scope. The internal programmatic orchestrator may accept one fully validated Source for trusted bootstrap or resume; constructor adapters are likewise trusted composition/test seams and are not request data. TaskPlan remains LLM2's only mutation scope; product feedback contains source-bound facts and exact targets, never `changeScope` or `maxRounds`.

One cross-process execution lease serializes each delivery. Provider receipts are atomically persisted under `PRODUCT_ENGINE_STORAGE_ROOT`, isolated by a collision-resistant delivery namespace, and reconciled before resumed work. A nonterminal interrupted run is recovered by invalidating every downstream reference and rerunning from the persisted active Source; stage attempts, cost, elapsed time, semantic-cycle use, and observation fuses are never reset. A second assembly attempt is reserved only for one interrupted full rerun, not for retrying an assembly failure.

## Multiplayer signaling

`signaling-server.js` provides WebSocket rooms, synchronization, event relay, and ordered input only after an accepted product exists. Start it separately when a runtime needs multiplayer support:

```powershell
node server/signaling-server.js
```

Multiplayer synchronization cannot mutate a semantic Source, trigger product stages, bind assets, or call a model.

Run `npm run check:network` from the repository root, or `npm --prefix server run test:network`, to execute the same canonical multiplayer suite.
