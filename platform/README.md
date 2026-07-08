# Platform — GameCastle 前端

`platform/` 是 GameCastle 的 React/Vite 前端壳，负责发现、创建、生成进度、试玩、迭代和未来发布/联机入口。

当前实现仍是本地 mock 数据和模拟生成流程，尚未真正调用 `ai/pipeline.js`。

## 技术栈

- React
- TypeScript
- Vite
- Tailwind CSS v4
- React Router
- lucide-react

## 入口

| 文件 | 职责 |
|------|------|
| `src/main.tsx` | React 挂载入口 |
| `src/App.tsx` | 路由和整体壳 |
| `src/context/GameContext.tsx` | 游戏列表、分类、收藏和模拟生成状态 |
| `src/pages/DiscoverPage.tsx` | 发现页 |
| `src/pages/CreatePage.tsx` | 创建/迭代页 |
| `src/components/` | 页面组件 |

## 命令

```bash
npm install
npm run dev
npm run build
npm run lint
```

## 待接入

- 调用生成管线，而不是本地 `setTimeout` 模拟。
- 展示 LLM1 的创意摘要和 LLM2 的 patch/DSL 执行进度。
- iframe 加载可玩版本。
- postMessage 接收运行时事件、分数、错误和完成状态。
- 版本历史、发布、分享。
- 联机房间和同步状态入口。
