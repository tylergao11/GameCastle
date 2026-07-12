# Terra 完整项目实现路线图

## 使用方式

每次只派发一个 WP。Terra 开工时先读取 `shared/project-completion-contract.json`，再读取该 WP 引用的
领域契约。不得顺手实现后续 WP，也不得为了让测试通过缩小最终目标。

每个 WP 交付必须包含：实现、正常/失败/恢复测试、独立审计、文档更新和当前未解决风险。只有
`completionEvidence` 全部存在，才能把机器契约中的 status 从 `designed` 改为 `implemented`。

## 推荐顺序

### WP0 — Project Weave Live Orchestration

一句话目标：把现有 smoke 节点变成同一条正式 LangGraph 中真实读写 artifact、可 checkpoint/resume
的项目总编排，并建立 `npm run check:project` 总门。

拆分建议：

1. 扩展 Project PipelineState，但引用领域 artifact，不复制 schema。
2. 为 asset-weave、runtime-linker、tick-runtime、server-runtime、html-export、validator、ProjectWorld、
   playtest、feedback 建真实 graph handler。
3. create/continue/cancel/resume 全部走同一入口。
4. 建 owner failure matrix 和 checkpoint crash recovery。
5. 聚合语义、资产、Runtime、Server、HTML、ProjectWorld 测试为项目总门。

### WP1 — Real Provider Runtime

一句话目标：按 role 接入真实文本、图片生成、图片编辑和 Vision provider，并由统一治理控制隐私、
预算、超时、重试、provenance 和降级。

先实现 ProviderRuntimePort 和 receipts，再接具体供应商。没有凭据时保持 fail closed；fixture 和
simulated 只能证明离线控制流，不能满足 live smoke。

### WP2 — Gameplay Module and Template Coverage

一句话目标：复用现有语义引擎，让五类常见轻量玩法通过批准模块与宏观空间计划确定性组合生成，
不依赖 LLM 临时写玩法实现。

Terra 开工前必须完整读取 `shared/wp2-product-module-contract.json` 与
`docs/wp2-product-module-generator-design.md`。先完成 canonical semantic ref、不可变 BuildContract、
ProductModulePlanner、ModuleDeclarationPlan、SpatialCompositionPlanner、PlacementResolver 接线、
两阶段 ProductModuleCompiler 和唯一 CompiledModulePlan 在线入口；随后完成 runner/platformer、
top-down collector、lightweight shooter、interaction puzzle、idle/clicker，并补齐 HUD、start、pause、
game-over、score、controls。

五类 archetype 只是验收样本，不得成为生成器 dispatch switch。每类至少两个不同 topology 的 create
fixture 和一个 minimal-delta continue fixture。Foundry 只允许离线产生候选，promotion 之前不能进入在线
catalog。完整顺序和停止条件以 WP2 机器合同的 `terraImplementationOrder` 与 `solHandoff` 为准。

### WP3 — Project Workspace and Version Lifecycle

一句话目标：从单一 `output/` 升级为真正多项目、不可变版本、可恢复和可回滚的本地工作区。

ProjectStore 应保存项目索引和版本引用，Runtime 在隔离 transaction workspace 中运行，成功后提交
ProjectVersion，失败恢复上一版本。Asset Studio 仍是可选入口。

### WP4 — Playable Iteration and Repair UX

一句话目标：让新用户只凭一句话得到可玩版本，并能看懂进度、试玩、自然修改、取消、恢复和处理 debt。

前端只消费稳定 API，不解析 stdout。所有技术诊断先映射为自然 owner report；自动 repair 有次数、
预算和破坏范围上限。

### WP5 — Release and Publishing

一句话目标：把可发布 ProjectVersion 组装成不可变 release，提供分享、撤回、回滚和内容校验。

发布服务只读取 ReleaseCandidate；不得直接读取 mutable workspace。发布前重新验证资产、许可、hash、
HTML allowlist 和 blocking debt。

### WP6 — Identity and Project Cloud

一句话目标：提供账号、项目所有权、版本同步、冲突处理、访问策略和配额，同时保持个人项目云与公共
资产云分离。

### WP7 — Production Multiplayer

一句话目标：对声明支持的模板实现生产房间、player slot、同步、断线恢复和权威边界；不承诺所有游戏
自动联机。

优先选择一个实时模板和一个异步模板做完整纵切，再扩展其余策略。

### WP8 — Security, Observability, Cost, and Operations

一句话目标：建立从 Provider 到发布和房间的结构化监控、成本上限、隐私、安全、备份、迁移和故障定位。

## 派发模板

```text
实现 shared/project-completion-contract.json 中的 WP{N}。
保持完整 scope，不修改其他领域真相源的所有权。
先读取 docs/project-completion-architecture.md、
docs/project-completion-boundaries.md 和该 WP 依赖契约。
完成 implementation、failure/recovery tests、audit 和文档；
completionEvidence 不齐全时不得把 status 改为 implemented。
禁止旧字段兼容、双运行时或 smoke 冒充 live。
```

## 阶段停点

- 完成 WP0–WP4：可以评审 Local Creator Complete。
- 完成 WP5–WP6：可以评审 Shareable Product Complete。
- 完成 WP7：可以评审 Multiplayer Product Complete。
- 完成 WP8：可以评审 Operable Product Complete。

任一停点都必须运行对应完整 E2E，而不是把各 WP 单测相加后宣称产品闭环。
