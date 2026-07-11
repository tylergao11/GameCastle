# Platform — GameCastle 前端

`platform/` 是 GameCastle 的 React/Vite 前端壳，只负责创建、生成进度、取消、试玩和继续迭代。

当前创建主链通过 Local Game Runtime API 调用真实 `ai/pipeline.js`。前端只消费稳定的运行状态和试玩 URL，不读取本地文件，也不解析管线日志。

## 技术栈

- React
- TypeScript
- Vite
- 手写 CSS
- Browser History API

## 入口

| 文件 | 职责 |
|------|------|
| `src/main.tsx` | React 挂载入口 |
| `src/App.tsx` | 单一产品入口 |
| `src/pages/GameCastleExperience.tsx` | 创建、真实进度、试玩和继续迭代 |
| `src/runtime/` | Local Game Runtime HTTP/SSE 客户端 |

## 命令

```bash
# 从仓库根目录启动完整产品
npm run dev

# 单独验证前端
npm --prefix platform run build
npm --prefix platform run lint
```

## Local Runtime

从仓库根目录运行 `npm run dev`，会同时启动 `127.0.0.1:4183` 的 Local Game Runtime 和 Vite。创建、继续迭代、状态流、失败展示与 iframe 试玩都走 `/api/runtime` 契约。
