# Templates — 网络同步模型参考

`templates/` 目录当前保留网络同步模型的参考模板。游戏模板（platformer、shooter、breakout、avoidance）已移除——游戏能力的真相源已统一到 `ai/product-modules/`。

## 当前内容

| 目录 | 说明 |
|------|------|
| `network/` | 6 种联机同步模型模板（async-state、event-room、host-snapshot、p2p-lockstep、peer-event、server-authoritative） |

## 真相源

游戏模块的唯一真相源在 `ai/product-modules/`。每个 product-module 文件包含：
- 模块元信息（id、name、category、presets）
- LLM 提示卡（llm1Card）
- 内部目标计划（compiler.targetPlan）
- 能力卡片（capabilities 数组）——从中派生 LLM1 创意摘要和 LLM2 修复上下文
- 网络兼容性声明（networking）
- 模块间链接契约（compiler.links、compiler.slots）

网络同步模型模板保留在此供参考，未来可能迁移到 `ai/network/` 或 `ai/product-modules/` 作为 network category 模块。

## 不再保留

- ~~platformer/template.json~~ → 能力已合并到 `ai/product-modules/core-platformer.json`
- ~~shooter/template.json~~ → 能力可从此派生的 capabilities 重建
- ~~breakout/template.json~~ → 同上
- ~~avoidance/template.json~~ → 同上
