# 资源引擎当前完成度审计

审计日期：2026-07-12。此文件区分已由代码/测试证明的闭环与明确未接入的外部能力，避免把
fixture 成功描述为真实 provider 已上线。

| 目标 | 当前证据 | 结论 |
| --- | --- | --- |
| 手绘可选、本地优先 | `/assets` 是可选入口；本地 Asset Weave 路由与浏览器 Play overlay 均有测试 | 已实现 |
| 裁切、美化、透明 PNG、revision | 共享 RGBA handler 覆盖裁切、去白边、despill、描边、投影、高光、改色、锚点、分帧和动画 sheet；每个操作回执带父 revision 与 hash | 已实现 |
| STYLE 1 统一视觉词典 | `shared/asset-style-dictionary.json` 被工作台、UI registry、Runtime binding 共同读取 | 已实现 |
| 低成本状态机 | Asset Weave binding 包含状态机；导出 overlay dispatcher 实测状态转换 | 已实现 |
| 本地库 | 内容哈希、来源/授权、binding、导出 PNG 与本地优先路由 | 已实现 |
| 云端 exact/near/template-kit 复用 | 受控词典过滤、license/quality rights、exact/near/template-kit、`assets/cloud` 完整 materialization receipt 回归 | 已实现（可替换 Port 的本地开发适配器） |
| 导出与 immutable release | binding manifest、PNG、overlay 进入 HTML manifest 与 release 回归 | 已实现 |
| 图像生成/编辑端口 | `AssetModelPorts` fail-closed；无端口产出 PlaceholderDebt；模拟本地端口明确标记 simulated | 已实现为安全降级，未配置真实 provider |
| 视觉审查修复循环 | mock Vision 通过、修复后二次审查、预算 debt 回归；跨槽共享 `__modelBudget`，外层 policy maxCost 压入 Weave | 已实现为适配器契约，未配置真实 Vision provider |
| UI 模板资产消费 | `asset-template-dictionary.json` 同时驱动 Template Registry 与工作台模板/槽位选择 | 已实现 |
| 外部云服务 | 当前为受控本地持久云仓；未接入外部对象存储/账号/同步服务 | 明确保留 |

## 总契约阶段核对（2026-07-12）

| 阶段 | 当前证据 | 审计结论 |
| --- | --- | --- |
| intake / local archive | `asset-engine-langgraph.js` 编译 slot、归档可选本地输入；无输入回归通过 | 已闭环 |
| local / cloud exact / cloud near resolve | AssetWeave 本地优先、approved-only repository、项目本地 materialize 回归 | 已闭环（本地持久云仓） |
| deterministic derive | `local-derivation-contract.json` 的每一个 operation 均有 default handler；`LocalDerivationPort` 将 kernel RGBA 实际写为 project-local PNG 并进入 AssetWeave/Runtime binding 回归 | 已闭环 |
| image edit / generation / review | LangGraph 路由、授权、预算、repair 和 debt 均有测试；没有真实 provider 凭据 | 端口闭环，外部实现保留 |
| immutable revision / receipt | LocalAssetStore 与 derivation kernel 写 hash、parent revision、receipt；绑定和导出回归 | 已闭环 |
| Runtime / AssetWorld | 实际 GDevelop resource、Sprite、layout usedResources、manifest 和 AssetWorld 回归 | 已闭环 |
| cloud promotion | 受控 ID、显式 consent、Acceptance/Runtime receipt、完整状态、重试、幂等、audit receipt 和可替换授权 Port | 已实现（真实线上服务适配器未部署） |

## 真相源审计

- `shared/asset-engine-contract.json` 是流程、阶段、端口和 artifact 的总事实源。
- `shared/asset-style-dictionary.json` 是色板、描边/投影/高光、锚点与动画策略的唯一事实源。
- `shared/asset-template-dictionary.json` 是 UI/game template、版本、slot 与约束的唯一事实源。
- `shared/cloud-asset-dictionary.json` 是公共 tag、bundle、quality、provenance 与 license ID 的唯一事实源。
- `shared/local-derivation-contract.json` 是本地 operation 与回执字段的唯一事实源。
- `styleId` 是词典外键；`styleTags` 只能作项目本地提示，不得进入公共云索引。Runtime 不从 tag 推断 styleId。
- 公共动态事实由 RelationIndex/BlobStore 拥有；PromotionQueue 只拥有工作流状态，Projection 只允许重建。

云库 P0 实现以 `docs/cloud-asset-engine-terra-handoff.md` 为准；对象存储、数据库、Worker、认证和
运营告警的真实线上适配器尚未部署，不得将本地开发适配器称为线上服务。

## P0 离线增量（2026-07-12）

- `simulated-local` 可一次生成一张 3 格 sprite sheet，由 Runtime 真实裁切为 3 个透明 PNG；
  每帧走 simulated Vision、AssetSpec、binding 和 HTML export。它明确不是现实模型。
- HTML 导出不再创建 iframe 外图片覆盖层；`asset-runtime.js` 在 GDevelop 构造前向
  `gdjs.projectData` 注入 image resource、Sprite object 和 UI instance。resource `name` 不再复用
  PNG 相对路径，`file` 保留项目本地相对路径，并同步进入 `layout.usedResources`，避免首场景
  未预加载而退化为紫色缺失纹理。
- cloud near 命中使用 deterministic variant port 写出不同 PNG 字节，并记录
  `deterministicVariant`，不再把同一文件伪装为变体。

## 当前发布门

执行 `npm run check:visual-assets` 与 `npm --prefix platform run build`。常规门不访问模型或网络；
真实模型 smoke 只能在 provider、用户授权、预算和审查记录都配置后单独运行。
