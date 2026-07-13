# AI 引擎

`ai/` 将自然游戏意图转换为可执行项目，并用 semantic playtest evidence 驱动 owner-routed repair。

The live LLM2 product surface is a closed Intent slot packet. LLM2 不接触坐标、组件 ID、GDJS 对象或 `project.json` 细节；这些由确定性 owner 处理。

## 常用命令

```powershell
set GAMECASTLE_GDEVELOP_SOURCE_DIR=<path-to-GDevelop-master>
npm run check:ai
npm run test:ai
npm run check:project
```

## 入口链接

- [Pipeline](pipeline.js)：创建、继续与产物写入。
- [Intent slots](intent-slots.js)：LLM2 的封闭输入与 DSL 渲染。
- [资产生产循环](asset-production-loop-graph.js)：生成、验收、分割、修复与接受。
- [ComfyUI 适配器](comfyui-local-provider.js)：唯一的本地 ComfyUI 调用路径。
- [资产调优说明](../docs/comfyui-tuning-direction.md)
- [Intent 运行时桥](../docs/ai-first-intent-runtime-bridge.md)

生成物在 `output/`；它们是运行证据，不是长期设计真相。
