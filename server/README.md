# Server services

This directory contains two independent services.

## Semantic execution API

`semantic-engine-api.js` exposes `POST /semantic/execute` on port `3030` by default. It executes a complete semantic Source, optional Revision, and optional accepted AssetWorld deterministically.

```powershell
npm run semantic:serve
```

The API does not call an LLM, accept a repair route, or select gameplay behavior.

## Multiplayer signaling

`signaling-server.js` provides WebSocket rooms, synchronization, event relay, and ordered input. Start it separately when a runtime needs multiplayer support:

```powershell
node server/signaling-server.js
```

The signaling service does not compile semantic sources or bind assets.
