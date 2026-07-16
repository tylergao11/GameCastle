# Network synchronization boundary

`apps/multiplayer/src/signaling-server.js` provides a WebSocket room service for signaling, state synchronization, events, and ordered game input after an accepted product exists. It is not a semantic compiler, asset engine, product orchestrator, or design decision maker.

The product engine is a separate HTTP service at `apps/api/src/server.js`. Keep the boundaries separate:

| Service | Owns | Does not own |
| --- | --- | --- |
| Product Engine `POST /product/deliver` | ProductDeliveryRun; Source/Revision; complete AssetWorld; asset-bound seed; geometry/spatial acceptance; real-browser capture; independent assembly review; factual feedback and LLM2 Revision rerun | Multiplayer rooms or live game authority |
| Deterministic sub-boundary `POST /semantic/execute` | Strict Source/Revision validation and libGD project-seed compilation | AssetWorld input, model calls, assets, spatial assembly, browser evidence, product acceptance |
| WebSocket server | Rooms, player membership, relay, synchronization, ordered input | Semantic Source mutation, LLM calls, product delivery, asset or spatial binding |

Only a product accepted by `ProductDeliveryOrchestrator`—with one source hash binding its complete AssetWorld, accepted spatial projection, browser capture, and assembly review—may be delivered to a multiplayer runtime. Multiplayer messages can drive that runtime behavior; they cannot alter TaskPlan, Source/Revision, product feedback, compilation contracts, or delivery evidence.
