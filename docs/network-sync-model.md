# Network synchronization boundary

`apps/multiplayer/src/signaling-server.js` provides a WebSocket room service for signaling, state synchronization, events, and ordered game input after an accepted product exists. It is not a semantic compiler, asset engine, product orchestrator, or design decision maker.

The product engine is a separate HTTP service at `apps/api/src/server.js`. Keep the boundaries separate:

| Service | Owns | Does not own |
| --- | --- | --- |
| Product Engine `POST /product/deliver` | ProductDeliveryRun; Source/Revision; complete AssetWorld; asset-bound seed; geometry/spatial acceptance; real-browser capture; independent assembly review; factual feedback and LLM2 Revision rerun | Multiplayer rooms or live game authority |
| Deterministic sub-boundary `POST /semantic/execute` | Strict Source/Revision validation and libGD project-seed compilation | AssetWorld input, model calls, assets, spatial assembly, browser evidence, product acceptance |
| WebSocket server | Rooms, player membership, relay, synchronization, ordered input | Semantic Source mutation, LLM calls, product delivery, asset or spatial binding |

The intended deployment contract is that only a product accepted by
`ProductDeliveryOrchestrator`—with one source hash binding its complete
AssetWorld, accepted spatial projection, browser capture, and assembly
review—may be delivered to a multiplayer runtime. The current signaling server
validates delivery attestation when `sessionKind` is `friend-invite` (or
`requireDelivery` is set): `create_room` requires `deliveryAttestation.sourceHash`,
and `join_room` must present the same `sourceHash`. Open rooms remain backward
compatible without attestation. Multiplayer messages can drive runtime behavior,
but they cannot alter TaskPlan, Source/Revision, product feedback, compilation
contracts, or delivery evidence.

## Friend-invite session (default multiplayer)

Lightweight friend sessions are the product default. Contract owner:
`packages/network/src/friend-session-policy.js` plus `packages/network/contracts/sync-schema.json`.

| Rule | Value |
| --- | --- |
| Session kind | `friend-invite` |
| Host | Room **initiator** |
| Sync | Lockstep **input intents** (frame/tick), not each-peer world authority |
| Local machine | Simulator + **local prediction** for feel |
| Server | Signaling / relay only (not gameplay authority for MVP) |
| Simulation Hz | **Default 60**, **minimum 30** |
| Unplayable | **Below 30 Hz** (including legacy 20 Hz defaults) is rejected |
| Host disconnect | Dissolve room (no host migration in MVP) |
| Admission | `friend-invite` rooms require matching `deliveryAttestation.sourceHash` on create/join |
| Host leave | Dissolves the room (`room_closed` / `host_disconnect`) |

Tick policy enforcement already rejects interactive lockstep below 30 Hz
(`tick-policy-resolver.js`, runtime adapter, tick-intent bridge). Templates must
not reintroduce 20 Hz interactive defaults.

Latency is handled by **local prediction** (`nextPredictedTicks` on the tick
intent runtime: hold-last remote + confirm via lockstep with optional
`reconcile.rollback`) plus interpolation policy — not by switching to server
authority. Server authority does not remove RTT; it only changes who owns truth.
