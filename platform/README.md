# GameCastle Platform

The React/Vite client owns creation input, runtime progress, cancellation, and
the playable iframe. It calls only the Local Game Runtime HTTP/SSE contract.

The product build path is singular:

```text
Platform -> Local Game Runtime -> ProjectWeaveRuntime -> immutable release
```

The UI does not read project files, parse engine logs, or invoke a build script.

## Commands

```bash
npm run dev
npm --prefix platform run build
npm --prefix platform run lint
```
