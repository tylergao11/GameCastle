# Network synchronization boundary

`server/signaling-server.js` provides a WebSocket room service for signaling, state synchronization, events, and ordered game input. It is not a semantic compiler, asset engine, or design decision maker.

The semantic product API is a separate HTTP service at `server/semantic-engine-api.js`. Keep the boundaries separate:

| Service | Owns | Does not own |
| --- | --- | --- |
| Semantic API | Source/Revision validation, deterministic assembly, AssetWorld binding | Multiplayer rooms, runtime authority, design inference |
| WebSocket server | Rooms, player membership, relay, synchronization, ordered input | Semantic Source mutation, LLM calls, asset binding |

An assembled project must be source-hash valid before it is delivered to any runtime. Multiplayer messages can drive runtime behavior only after that project exists; they cannot alter semantic compilation contracts.
