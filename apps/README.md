# Applications

`apps/` contains independently started or deployed product surfaces:

- `web/` is the React/Vite frontend.
- `api/src/server.js` is the authenticated loopback Product API and composes `packages/product` plus the semantic execution sub-boundary.
- `multiplayer/src/` is the independent WebSocket room and synchronization service.

The API owns product delivery inputs and storage composition. Multiplayer can synchronize an accepted runtime, but it cannot mutate semantic truth, invoke a model, create assets, or control product delivery.

```powershell
$env:PRODUCT_ENGINE_TOKEN = '<local-secret>'
npm run product:serve
node apps/multiplayer/src/signaling-server.js
npm --prefix apps/web run dev
```
