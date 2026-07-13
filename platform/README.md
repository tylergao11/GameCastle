# Platform

React/Vite 客户端负责创建输入、运行进度、取消与试玩 iframe；它只通过 Local Game Runtime 的 HTTP/SSE 合同工作。

```powershell
npm run dev
npm --prefix platform run build
npm --prefix platform run lint
```

- [本地运行时边界](../docs/local-game-runtime.md)
- [Creator Experience](../docs/creator-experience.md)
