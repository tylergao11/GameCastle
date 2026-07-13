# GameCastle

AI-first 的可持续游戏项目生成与迭代系统。它把自然语言意图编译为可运行的 GDevelop/GDJS 项目，并通过 semantic evidence 和 owner-routed repair 持续修正。

Current AI-first boundary: LLM2 fills a closed Intent slot packet only. LLM1 负责开放创意；确定性编译、运行时和验证层负责坐标、组件、GDJS 与项目文件事实。

## 开始

```powershell
npm run dev
set GAMECASTLE_GDEVELOP_SOURCE_DIR=<path-to-GDevelop-master>
npm run check:ai
```

`GAMECASTLE_GDEVELOP_SOURCE_DIR` 未设置时默认使用相邻目录 `../GDevelop-master`。

## 主要入口

| 目录 | 用途 |
| --- | --- |
| [ai/](ai/README.md) | 意图、资产、语义 playtest 与检查。 |
| [platform/](platform/README.md) | React/Vite 创建与试玩界面。 |
| [engine/](engine/README.md) | 官方 GDJS 浏览器运行时缓存。 |
| [docs/](docs/) | 需要深入了解时的设计说明。 |

## 有用链接

- [系统架构](docs/architecture.md)
- [本地运行时边界](docs/local-game-runtime.md)
- [资产链与 ComfyUI 调优](docs/comfyui-tuning-direction.md)
- [资产生产闭环合同](shared/asset-production-pipeline-contract.json)
- [产品模块](ai/product-modules/)
- [GDevelop 官方仓库](https://github.com/GDevelopApp/GDevelop)
