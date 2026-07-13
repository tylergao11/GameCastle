# PRT-3～PRT-5 实施报告

日期：2026-07-13

## 结论

PRT-3、PRT-4、PRT-5 的代码与零模型成本契约门已完成。PRT-6 未启动；本报告不构成真实浏览器、真实 ComfyUI 质量、GPU 性能或 Golden 重建证据。

## 唯一真相源

- 上层闭环与聚合门：`shared/playable-runtime-contract.json`
- 资产生产状态、artifact、owner 与失败路由：`shared/asset-production-pipeline-contract.json`
- 核心模块到经批准资产模板的唯一映射：`shared/asset-template-dictionary.json`
- 唯一风格语法：`shared/asset-style-dictionary.json`
- Product Module 的真实对象、场景、保留项与绑定模式：各模块的 `declarationContract.visualSlots`
- ProjectWeave 只负责按上述真相编排，不拥有资产接受、对象绑定或 playable 决策。

## PRT-3：资产生产循环

- `AssetProductionPlanner` 按精确模板版本展开生产集，每个 required slot 恰好一个工作项。
- `AssetProductionLoopGraph` 使用 LangGraph 执行 observe、diagnose、单动作计划、像素操作、child revision、强制复检与最终接受。
- Draft、Mask、RepairPlan、ColorPlan、Normalized Revision、逐项 receipt 和生产集 receipt 均为显式 artifact。
- ledger 每个节点原子落盘；重入不会重复生成已接受工作项，注入中断后可恢复。
- resolver 顺序固定为本地/项目、云 exact/near、确定性派生、受治理生成；缺计划、预算或能力时 fail-closed。
- ComfyUI 只执行 provider/workflow 原子动作，不拥有接受决定。

## PRT-4：真实对象绑定

- `RuntimeAssetBinder` 只接受同一 accepted production set 的 final revision。
- 绑定目标只来自 `targetVisualSlotId`；自由文本 `bindingTarget` 拒绝。
- 图片安装到 GDJS resource，并把声明目标对象转换为 Sprite；行为、变量、实例、层、z-order 与 collision mask 保留并出 receipt。
- 通用 UI overlay 与 `asset-runtime.js` 注入已删除。
- 9 个核心 Product Module 均拥有唯一批准资产模板及等量真实 `VisualSlotDeclaration`；ProjectWeave 不再默认使用 runner 三槽。
- 四种合法绑定模式由 binder 契约测试覆盖；当前核心模块生产模板使用 `object-resource`，UI/background/attached 模式必须由对应声明显式选择，不能猜测。

## PRT-5：联合 RuntimeValidator

- 必需证据为 ViewportMatrix、AssetProduction、AssetBinding、TickPerformance、TickReplay、BrowserPlaytest 六类。
- 生产集、final revision、绑定目标与 binding receipt 必须相互一致；模拟浏览器证据和 file origin 均拒绝。
- 任一缺失或失败均路由至唯一 owner，并阻止 `playable`、ProjectVersion 与 release commit。
- ProjectStore create/continue 只有完整聚合证据才提交不可变版本；失败运行不改变 active version。
- release store 在提交时独立重验聚合证据，不能信任调用方标签。

## 已删除的旧真相

- AssetWeave graph、旧 review/repair loop 与相关测试。
- `GameCastleAsset_*`/DOM overlay codegen 与 overlay runtime 测试。
- local direct binding store、`/api/runtime/assets/bindings` 与 cloud resolve 直绑 API。
- 两条废弃的单阶段 ComfyUI live smoke 及对应 scripts。
- 前端直接保存 Runtime binding 的 client API。

仓库扫描对上述旧名称为零匹配；文档不再把它们描述为可运行路径。

## 复验结果

- `npm run check:project-design`：通过
- `npm run check:visual-assets`：通过
- `npm run check:provider`：通过
- `npm run check:comfyui-local`：通过
- `npm run check:comfyui-stage-b`：通过
- `npm run check:project`（含完整 WP2）：通过
- `npm --prefix platform run build`：通过

## 明确未做

- 未进行 PRT-6 Golden 重建、真实浏览器点击/resize/截图、真实 30/60Hz 观察或真实 ComfyUI 质量验收。
- Florence2 主体分割已接入当前资产链；真实生产候选仍必须经过单独的质量验收。
