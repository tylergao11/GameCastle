# Playable Runtime Terra 实施交接

> PRT-3～PRT-5 的实现状态与复验命令见 `docs/prt3-prt5-implementation-report.md`。PRT-6 仍保持未启动。

## 开工读取顺序

Terra 必须依次读取：

1. `shared/playable-runtime-contract.json`
2. `shared/asset-production-pipeline-contract.json`
3. `docs/playable-runtime-architecture.md`
4. `shared/project-completion-contract.json`
5. `shared/wp2-product-module-contract.json`
6. `shared/asset-engine-contract.json`
7. `shared/asset-template-dictionary.json`
8. `shared/local-derivation-contract.json`
9. `ai/contracts/schema.json`

机器合同优先。不得为 Golden-001 增加专用分支，不得保留旧字段兼容、双 loop、双绑定或双坐标变换。

## PRT-0：合同与失败门

- 为机器合同中的 artifact 建立 fail-closed schema/validator。
- 为每个失败类别保留唯一 owner route。
- 将 `PlayableRuntimeEvidence` 接入 aggregate validation，但在后续包完成前保持失败，不得用默认 pass 占位。
- 不改变 Asset Engine、Semantic Engine、PlacementResolver 的既有领域所有权。

停止条件：旧 artifact 被新 reader 静默接受，或 aggregate gate 能在缺证据时通过。

## PRT-1：Tick Policy、性能与回放

- 实现 `TickPolicyResolver`，由 module/network plan 选择明确 profile。
- 单机固定60Hz；realtime simulation/input/network 最低30Hz，优先60Hz。
- 分离 simulation、input、network、render clock。
- rAF 每帧渲染；低状态频率必须基于前后 committed state 插值。
- 每个 simulation tick 写 replay frame，包含空输入帧、事件和 state hash。
- 实现最多5 tick catch-up 和性能 debt，不允许静默降频。
- 删除本地20Hz默认和 wall-clock tap 真相。

必须测试：60Hz 单机平台物理、30/60Hz联机政策、长帧 catch-up、按下/保持/释放、原始与 replay 最终 hash、性能报告字段。

停止条件：本地观测低于60Hz；任何 realtime 配置允许低于30Hz；render 只在 simulation tick 更新；replay 漏掉空输入 tick。

## PRT-2：统一 Viewport

- 实现唯一 `RuntimeViewportCoordinator`。
- overlay root 与 GDJS Canvas Content Rect 精确重合，不挂 body 坐标。
- 将 PlacementResolver 的 UI 产物收敛为 `UIControlLayoutSpec`，禁止 CSS px。
- 实现 safe-area、letterbox、DPR、resize、orientation 和 fullscreen 更新。
- 所有虚拟摇杆、按钮、inventory panel 使用同一 transform。
- 删除 intent runtime 内部各自的 `place()` 固定坐标算法。

必须测试：合同规定的六种 viewport、带 letterbox、模拟 notch safe-area、横竖屏往返、PointerEvent 命中、无重复 listener/control。

停止条件：任一控件仍直接设置 project-authored body `left/top`；可视区域和点击区域不一致；横竖屏后出现重复控件。

## PRT-3：ComfyUI 资产生产循环

**接入范围（Asset Engine → Terra）**：Terra 必须删除当前混合 Parent Sheet 方向，把现有简单 `generate/edit/review` 修复环升级为 [`shared/asset-production-pipeline-contract.json`](../shared/asset-production-pipeline-contract.json) 定义的唯一 `AssetProductionLoopGraph`。Asset Engine 拥有循环、Revision、预算和验收；ComfyUI 只执行受控原子 workflow；ProjectWeave 只编排。

- **输入真相**：固定模板版本、唯一 Style DNA、模块 `VisualSlotDeclaration` 和显式 required `targetVisualSlotId`。
- **输出真相**：`AssetProductionSetPlan`、每槽 `AssetWorkItemPlan`、完整 loop history、不可变 Draft/Mask/Repair/Color/Normalized Revision、逐项 `WorkItemAcceptanceReceipt` 和最终 `AssetProductionSetAcceptanceReceipt`。
- **执行拓扑**：一个受治理 ComfyUI endpoint，多份版本化 workflow job。生成、识图、分割和局部改图是不同动作；操作系统进程数量属于部署扩容，不属于领域合同。

- 删除旧混合异类父图 planner、artifact、layout 字段、相关测试和 live smoke，不提供兼容 reader。
- 实现 `AssetProductionPlanner`：每个 required slot 恰好一个 work item，并声明 production family、recipe、Style Prompt 引用、`targetVisualSlotId` 和预算。
- 实现 LangGraph 状态循环：`observe → diagnose → plan-one-action → act → revise → reobserve → decide`。
- 最短路径为 generate/reuse、Vision inspect、deterministic validate、final review；只有 typed defect 需要时才进入 segment/cutout、masked edit、color apply 或 style normalize。
- 每次像素变化都创建 child Revision、记录 provider/operation receipt，并使旧 Review 失效；必须重新 observe。
- Vision 只输出事实；Alpha、尺寸、hash、mask、trim、anchor 等确定性事实由 LocalDerivationKernel 验证；AssetAcceptanceGate 独占最终决定。
- 分割 mask 必须成为版本化 `MaskRevision`，不能藏在 Comfy workflow history 中。
- 上色先生成 `ColorPlan`；能确定性换色时不调用模型，需要新阴影像素时才走受控 image-edit。
- 全部 required work item accepted 后才产生生产集验收；任一失败阻塞新项目版本。

必须测试：最短成功路径、背景污染抠图、无效 mask、局部修复、上色双路由、像素变化强制复检、整体重生仅限当前工作项、预算耗尽、timeout/cancel/restart 恢复、幂等、stale workflow、stale parent、缺槽、重复目标槽、完整 required-slot coverage。

停止条件：混合异类父图路径仍可运行；Comfy workflow 自己决定接受；新像素沿用旧 Review；mask 无 Revision；部分资产完成即可进入可玩版本。

## PRT-4：可视槽和真实对象绑定

**PRT-3/PRT-4 串联门**：任何 required `targetVisualSlotId` 若没有来自同一 `AssetProductionSetAcceptanceReceipt` 的 accepted final revision，必须 fail-closed；不得绑定 Draft、Mask、Repair 中间图、临时 Comfy output 或模拟资产。

- 扩展 product module declaration，声明 `VisualSlotDeclaration`。
- AssetSpec 改为只引用 `targetVisualSlotId`；删除自由文本 runtime target。
- 实现合法的四种 binding mode 和 preservation checks。
- Player 等 world role 必须绑定对象自身 renderer 或受控 attached visual。
- 删除 `GameCastleAsset_*` 固定 UI overlay 注入。
- Vision Review 增加角色、轮廓、构图、背景、边缘与风格检查。
- 生成 `PlayableAssetBindingReceipt`，包含对象、实例、资源、preservation 与 runtime check。

必须测试：Player/Enemy/Collectible/Background/UI 正常绑定，未知槽、错误角色、UI/world 混绑、碰撞/行为丢失、detached visual、低质量图片拒绝和 repair。

停止条件：生成 PNG 可以在目标对象未使用它时通过；world role 可以落到 UI layer；binding receipt 只证明文件存在。

## PRT-5：联合 RuntimeValidator

- 聚合 ViewportMatrix、AssetProduction、AssetBinding、TickPerformance、TickReplay、BrowserPlaytest。
- 任何 required 子证据失败都阻塞 `playable` 和 release commit。
- 每个 failure route 到机器合同规定 owner，ProjectWeave 只编排。
- Semantic playtest 保留，但不得替代物理输入、性能或渲染证据。

## PRT-6：干净 Golden 重建

- 从新的项目 id 和空 output/release transaction 构建，不复用旧 runtime。
- 走真实 DeepSeek、真实 ComfyUI 资产套件合成、确定性裁切、逐格 review/repair 和真实 target binding。
- 从 HTTP origin 打开 immutable `game.html`。
- 执行 viewport resize、真实点击跳跃、60Hz观测、目标对象截图、tick replay。
- Golden 报告必须包含完整 `PlayableRuntimeEvidence` 和 `AssetProductionSetAcceptanceReceipt`，不能再只报告 provider、单张 PNG 或单工作项成功。

## 删除审计

完成前全库搜索并确认以下旧路径不存在：

- local interactive `tickRate: 20`；
- runtime control 直接 append 到 body 后按设计坐标定位；
- free-form runtime `bindingTarget`；
- world asset 通用 UI overlay；
- 混合角色/平台/道具/背景/UI 的 Parent Sheet 和固定格 Prompt；
- 像素变化后沿用旧 Review，或无父 Revision/receipt 的修改资产；
- simulated-local 或单工作项结果被计为完整生产集证据；
- Golden id 条件分支；
- `playable` 仅依赖文件/manifest/semantic pseudo-playtest。

## Terra Definition of Done

- PRT-0 至 PRT-6 全部完成，正常、失败、恢复测试齐全。
- Asset Engine 的生产循环已作为 PRT-3/PRT-4 的强制交接项完成：每槽独立工作项、条件修复循环、像素变化强制复检、完整 Revision 血缘、逐项验收、required-slot coverage 与真实对象绑定均有可复验报告。
- `shared/playable-runtime-contract.json` 仍是唯一上层真相源，领域合同只被引用。
- 旧路径删除，不保留兼容 alias 或双写。
- Writer、独立 Tester、独立 Auditor 分别留下证据。
- 在所有证据齐全前，不得把合同 status 从 `designed` 改为 `implemented`。
