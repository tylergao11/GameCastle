# WP2 产品模块系统深度设计（Sol → Terra）

## 1. 设计结论

WP2 不建设第二套语义引擎，也不把五类 archetype 写成五个生成器分支。现有语义引擎已经拥有
`semantic_concepts`、`gameplayRoles`、`playGoals`、`eventMeanings`、语义路由和 2481 项完整 GDJS
能力语义覆盖。WP2 的缺口是把这些语义事实投影成经过批准、可确定编译、可验证、可继续修改的产品
模块组合。

正式链路是：

```text
自然请求
  → SemanticEngine：理解体验、角色、目标、压力、反馈和生命周期
  → ProductModulePlanner：覆盖、选模块、解依赖、解冲突、生成最小 delta
  → ProductModuleCompiler declaration phase：从批准 manifest 产生对象原型、尺寸和 ownership 声明
  → SpatialCompositionPlanner：选择宏观拓扑、区域、角色和节奏关系
  → PlacementResolver：解析最终坐标、避让和摆放证据
  → ProductModuleCompiler emission phase：展开批准 manifest 的内部模板
  → RuntimeValidator + SemanticPlaytestAgent：证明 artifact 与玩法语义
```

机器真相源是 [`shared/wp2-product-module-contract.json`](../shared/wp2-product-module-contract.json)。
本文解释它为什么这样划界，Terra 实现时不得用更方便的临时路径绕开机器合同。

## 2. 当前证据与真正缺口

当前已有：

- `ai/semantic-mapping/semantic-feedback.json`：现有语义词典；WP2 只能引用，不复制。
- `ai/semantic-mapping/capability-semantic-index.json`：2481/2481 能力覆盖；不是 WP2 待补词典。
- `ai/product-modules/`：五个已存在 manifest，包括 platformer、shooter、score、start 和 game-over。
- `ai/module-compiler.js`：安装、配置、冲突、内部槽链接、网络计划和 continue 局部更新骨架。
- `ai/placement-resolver.js`：具体摆放、模式生成、safe area、关系解析的 owner。
- `ProjectWorld.modules`：continue 时已安装模块的基础真相。

当前缺失：

1. `BuildContract.moduleContract` 仍以宽泛数组表达，Project Weave 默认生成空的 `moduleIntents` 和
   `gameplaySlots`，没有正式的语义需求到模块计划产物。
2. 模块 manifest 没有完整声明语义覆盖、宏观空间需求、生命周期、可删除所有权和可玩验收。
3. 没有确定性的 ProductModulePlanner，现有模块选择主要发生在 Intent DSL/编译路径中。
4. PlacementResolver 能解析局部关系和最终坐标，但没有 owner 提供“arena、rooms、lanes、linear”等
   宏观空间结构。
5. continue 支持安装和配置骨架，却没有安全 remove/replace 所需的完整 artifact ownership。
6. 现有五类 archetype 是路线图声明，不是十个布局多样化 create fixture 与五个 continue fixture。
7. 模块云库只有 repository policy，尚无不可变 revision、候选验证和 promotion receipt 的完整门。

还存在两个必须诚实记录的跨层缺口：

- 2481/2481 表示底层 GDJS capability 语义覆盖完整，不表示五类玩法所需的高层 play goal 已全部存在。
  当前高层词典偏向 platformer；puzzle 的 solve、idle 的 grow、shooter 的 aim/fire 等必须由
  SemanticEngine owner 写回现有 `semantic-feedback.json`。这是原词典的受控扩展，不是第二套 WP2 词典。
- BuildContract 的 `ModuleIntent.action` 已声明 `remove`，但当前 `module-compiler.js` 只处理 install 和
  configure；这是“定义但未实现”，Terra 必须用 ownership 与原子 rollback 补齐，不能沿用假能力。

因此，WP2 不是“补三个核心 JSON”，而是完成从语义需求到产品组合、空间组合、确定编译、玩法验证、
持续沉淀的闭环。

## 3. 覆盖范围的定义

产品模块系统不承诺“知道一个游戏类型名称就支持所有游戏”。只有满足以下条件才可以声明支持：

1. 用户意图中的每个 required semantic id 被批准模块覆盖，或产生明确 blocking debt。
2. 模块依赖、冲突、参数、槽和 revision 全部通过合同。
3. 所需空间角色能由至少一个受支持 topology 完整承载。
4. 编译结果通过 RuntimeValidator。
5. 玩法目标、压力、失败、恢复和进度通过 SemanticPlaytestAgent。
6. create 和 continue 都有可执行证据。

“GDJS 底层能够表达”只能说明 Foundry 有可能扩展，不能说明产品当前已经支持。

五类 archetype 是覆盖多样性的验收样本：

| Archetype | 核心差异 | 最低空间差异 |
| --- | --- | --- |
| runner/platformer | 连续移动、跳跃、障碍、收集、失败重开 | linear + branching-route |
| top-down collector | 自由移动、收集目标、完成条件 | arena + rooms |
| lightweight shooter | 射击、命中、伤害、压力、波次或路线 | arena + lanes |
| interaction puzzle | 交互、状态变换、约束、成功与重置 | rooms + grid |
| idle/clicker | 资源、转换、升级、持续进度和反馈 | single-screen + staged-zones |

生成器核心不得出现 `if archetype === ...` 的五分支。archetype id 只允许存在于 fixture 标签、验收矩阵
和产品展示层；真正规划必须依据语义需求、模块能力、空间合同和约束。

## 4. 在线 Composer 与离线 Foundry

### 4.1 在线 Composer

用户 create/continue 的实时路径只允许读取 approved、revision-pinned 模块。它可以安装、配置、保留、
删除或替换模块，但不能现场创造模块实现。

在线组合失败时必须返回 `ModuleDebt`。禁止：

- 把候选模块当作批准模块；
- 让 LLM 临时写 target-plan；
- 绕过 ProductModuleCompiler 直接改 `project.json`；
- 因为“差不多可玩”而静默丢弃 required semantic id；
- 自动进入耗时、不可预测的 Foundry。

### 4.2 离线 Foundry

Foundry 是扩展模块库的工程流，不是用户运行时降级策略。它从明确的 ModuleDebt 与获许可参考 fixture
开始，通过 GDJS 结构检查或 before/after diff 获取真实对象、事件、行为、变量、资源和运行时依赖，
再绑定到现有语义能力。

LLM 可以：

- 帮助解释 fixture 表达的玩法；
- 建议哪些参数值得公开；
- 辅助归类语义角色；
- 提议测试场景。

LLM 不可以：

- 写 `compiler.targetPlan`；
- 发明未验证的 GDJS 操作；
- 宣布候选通过；
- 修改 approved revision；
- 绕过 provenance、许可和 playable evidence。

Foundry 的输出是 `ModuleCandidate`，不是可在线选择的模块。只有 `ModulePromotionReceipt` 通过，才产生
新的 immutable approved revision。

## 5. 核心 artifact

### 5.0 统一语义引用

所有机器语义引用只能使用两种 canonical form：

```text
semantic-dictionary#/<section>/<key>
capability-index#/by_semantic/<semantic_id>
```

例如 `semantic-dictionary#/playGoals/collect`。裸字符串 `collect`、`fire`、`upgrade` 不是运行时合法 ID。
Sol 合同中的 `semanticReferenceResolution.ownerChangeRequests` 是对 SemanticEngine owner 的变更请求，
不是运行时词典；相应 target ref 写入现有语义词典并通过检查前，Planner 必须将其视为 unresolved debt。
每个请求独立维护 `open/closed` 和 closure evidence，Terra 可以渐进关闭，不需要提前把 WP2 总状态改成
`implemented`。

### 5.1 GameplayRequirementGraph

Owner：SemanticEngine。

它描述用户要什么体验，不包含 module id、component id、target-plan、GDJS 类型或最终坐标。至少包含：

- actor、reward、pressure、feedback、phase 等 gameplay roles；
- collect、survive、solve、grow 等 play goals；
- mechanic、lifecycle、feedback、control、progression、spatial-role、network requirements；
- start、pause、HUD、controls、game-over 等 surface requirements；
- 每个语义判断的 evidence id。

同一类游戏出现不同设计，首先体现在 requirement graph 不同，而不是换一个固定模板。例如同为 shooter：

- 自由走位生存：arena + surrounding pressure + timed progression；
- 多车道防守：lanes + before/after relation + objective pressure；
- 房间探索：rooms + gated connectivity + reward/pressure alternation。

### 5.2 ModuleCompositionPlan

Owner：ProductModulePlanner。

Planner 根据 approved catalog 求满足 requirements 的最小稳定组合。计划必须记录 catalog fingerprint、
revision、coverage、slot binding、debt 和确定性 hash。

create 通常产生 `install`；continue 可以产生：

- `retain`：模块及参数不变，不重放创建；
- `configure`：只修改 manifest 公开参数；
- `install`：添加新能力；
- `remove`：删除模块拥有的 artifact，先验证依赖安全；
- `replace`：原子执行 remove + install，并保持共享状态迁移合同。

每个 requirement 还声明 provider cardinality：`exclusive` 只能有一个 provider，`at-least-one` 可以由
多个模块重复覆盖，`composed` 必须由多个互补 provider 联合满足。不能用“每个语义只允许一个模块”破坏
共享 lifecycle、feedback 或 controls 组合。

所有 delta 操作带 base guard：expected ProjectWorld hash、catalog fingerprint 与 module revision set hash。
remove/replace 还必须带 stable artifact cleanup 顺序、shared owner/dependent policy、rollback 和 state migration。
replace 明确 from/to revision，不能用同一个宽泛 moduleId 猜测迁移。

相同 requirement graph、catalog fingerprint、base ProjectWorld hash 与 planner version 必须得到相同计划。
模型随机性不能影响这一步。

### 5.3 ModuleDeclarationPlan

Owner：ProductModuleCompiler declaration phase。

这是修复 Compiler/Placement 先后循环的关键 artifact。它从批准且固定 revision 的 manifest 中产生：

- subject stable id、module id、prototype id；
- semantic spatial roles；
- width/height/anchor 与 layer role；
- cardinality 和 placement policy；
- shared artifact owners、dependents 和 reference rule。

它不包含 target-plan，也不包含 x/y。Spatial Planner 与 PlacementResolver 都只能读取这份声明，不能再从
`compiler.targetPlan` 正则挖对象尺寸。Compiler 必须先 declaration，再在 Placement 后 emission。
manifest 的 `declarationContract.spatialSubjects` 是 prototype、bounds、layer、cardinality、placement policy
的唯一数据源；缺字段必须在 manifest validation 阶段失败。

### 5.4 SpatialCompositionPlan

Owner：SpatialCompositionPlanner。

它解决“同类型游戏也有不同布局”的问题，但不产生坐标。它只输出：

- topology：linear、branching-route、arena、rooms、grid、lanes、single-screen、staged-zones；
- regions：safe、active、reward、pressure、goal、transition 等语义区域；
- role assignments：某模块的 actor/reward/pressure/goal 对应哪个区域；
- relations：before、after、inside、near、far、between、surrounding、along-route；
- pacing bands：引导、建立、升级、高潮、恢复；
- variation seed：在规则不变的前提下产生布局变化。

最终 x/y、safe area、碰撞边界、对象尺寸和避让继续由 PlacementResolver 拥有。宏观空间计划不得复制
最终坐标模板，否则同类型变化仍然只是换皮。

### 5.5 CompiledModulePlan

Owner：ProductModuleCompiler。

它是唯一允许输出内部 target-plan 的 artifact。每条指令必须来自：

- approved manifest 的内部编译模板；或
- PlacementResolver 的确定性 placement emission。

它还必须输出 ownership receipt，列出本轮 created、updated、removed、retained artifacts。没有 ownership
receipt，就不能证明 continue 没有重复创建，也不能安全 remove/replace。

### 5.6 ModuleDebt

Owner：发现问题的 Planner；处理 owner 由 code 决定。

缺能力、冲突、缺槽、不支持 topology、参数未声明、revision 未批准、删除不安全和 base world stale 都必须
显式失败。ModuleDebt 必须包含 semantic requirement、owner、blocking、自然说明和下一步，不能只返回异常文本。

## 6. 模块 manifest 的完整边界

现有 manifest 保持模块真相源，但 Terra 必须补齐五类合同：

1. `semanticContract`：引用现有语义词典，声明 provides/requires/goals/roles/pressures/rewards。
2. `spatialContract`：声明 supported topologies、required/optional roles、约束和 variation 参数。
3. `lifecycleContract`：声明 start、pause、failure、restart、continue 由本模块提供还是依赖其他模块。
4. `ownershipContract`：用 stable artifact id 声明 artifact kind、runtime id、exclusive/shared ownership、
   owner/dependent modules、cleanup phase 与 state policy。
5. `acceptanceContract`：声明 create、continue、失败、布局变体和 play-goal fixtures。

现有 `capabilities` 继续作为安全产品能力卡，不另建 WP2 词典。内部 `compiler.targetPlan`、slots、links、
configure/remove templates 继续只对 compiler 可见。

共享 artifact 必须显式声明 owner 和引用计数/依赖策略。例如多个模块共同使用 Score 变量时，删除其中一个
模块不得删除共享变量。未声明 shared ownership 的 artifact 禁止由两个模块同时创建。

## 7. 布局与设计多样性

多样性来自四个相互独立的轴：

1. 规则组合：相同 topology，不同 goal、pressure、progression。
2. 空间拓扑：相同规则，arena/rooms/lanes 等结构不同。
3. 参数与节奏：密度、速度、奖励风险比、阶段长度不同。
4. 表现与资产：由 Asset Engine 和模板主题负责，不改变玩法规则真相。

验收必须证明“规则变化”和“布局变化”是两件事：

- 同一个 composition plan，改变 variation seed，应产生不同布局但相同 semantic coverage。
- 同一个 topology，改变 gameplay requirements，应产生不同 module plan。
- 改变美术 style，不应改变 module plan 或 spatial topology，除非资产约束产生明确 debt。

## 8. 云库边界

本地产品模块 catalog 是离线可执行真相。云库负责分发 approved immutable revision，不远程决定运行时
逻辑。在线计划必须固定 module id + revision + manifest hash，不能读取含义不稳定的 `latest`。

云晋升要求：

- reference fixture hash 和许可；
- semantic binding evidence；
- manifest contract evidence；
- create/continue/remove/replace evidence；
- runtime 与 semantic playtest evidence；
- 无个人项目数据；
- revision immutable。

用户项目中的一次性参数配置属于 ProjectVersion，不自动进入公共云库。只有可复用、去项目化、经过验证
的模块候选才能晋升。

## 9. Terra 实现顺序与停止条件

Terra 必须按机器合同的 `terraImplementationOrder` 工作。先完成语义 owner change、不可变 BuildContract、
两阶段 compiler、planner、空间与唯一执行入口，再补五类玩法，
不能先复制十个 fixture 然后反推抽象。

BuildContract 在 SemanticEngine/IntentAgent 阶段生成后保持不可变，只包含 GameplayRequirementGraph 内容或
hash。ModuleCompositionPlan、ModuleDeclarationPlan、SpatialCompositionPlan、PlacementPlan 和
CompiledModulePlan 是 ProjectRun 中各 owner 独立 artifact；后续 Planner 不得反写 BuildContract。

当前 Project Weave 直接执行 `intent.bridgePlan.targetPlanText`。Terra 必须删除这条在线旁路，使所有线上
模块指令只来自带 composition/declaration/placement hash 的 `CompiledModulePlan`。不得保留 legacy alias、
双执行路径或“旧 fixture 临时走 bridgePlan”的 fallback。

Terra 必须停下并回交 Sol 的情况：

- 需要新增与现有 semantic mapping 平行的词典；
- canonical semantic ref 既无法解析，也没有合同中明确的 SemanticEngine owner change；
- 需要让模型生成内部 target-plan 才能继续；
- PlacementResolver 前拿不到 ModuleDeclarationPlan；
- 需要让 SpatialCompositionPlanner 或模块 manifest 持有最终坐标；
- 想在 create/continue 中同步运行 Foundry；
- remove/replace 无法证明 artifact ownership；
- 为通过当前 fixture 需要在模块编译器之外写一次性项目补丁；
- archetype id 开始成为生成器核心 dispatch switch。
- 仍需执行 `intent.bridgePlan.targetPlanText` 才能让在线 fixture 通过。

## 10. 完成门

WP2 至少需要十个 create fixtures（每类两种布局）和五个 continue fixtures。每个 canonical archetype 都要
在浏览器中可玩，并证明其声明的目标、压力、失败、恢复和进度。还必须覆盖冲突、缺槽、缺能力、不支持
topology、未批准 revision、不安全删除和 stale continue base。

单个模块 schema 通过、target-plan 生成或 HTML 能打开都不等于 playable。只有机器合同中全部
`completionEvidence` 存在，独立 Tester 和 Auditor 均通过，才能将 WP2 从 `designed` 改为
`implemented`。

## 11. 角色交接表

| Role | Responsibility | Owned area | Required evidence | Handoff format | Audit concern |
| --- | --- | --- | --- | --- | --- |
| Sol | 目标、合同、owner、硬门和停止条件 | 本设计与 WP2 机器合同 | 合同自检、现状证据、无所有权冲突 | 本文 + JSON contract | 过度抽象或遗漏真实执行入口 |
| Terra | 完整实现与集成 | Planner、Spatial Planner、Compiler 扩展、modules、fixtures、gate | implementation diff + create/continue/failure/recovery evidence | 按 T1–T11 的逐项 receipt | fixture 特判、LLM 旁路、一次性补丁 |
| Tester | 独立运行合同、domain、project、browser 和 fixture matrix | 测试工作区和 evidence | 命令、日志、截图、fixture hashes | TesterReport | schema pass 冒充 playable |
| Auditor | 独立核对语义、模块、空间、placement、compiler、cloud owner | 全链只读审计 | 声明→schema→handler→evidence trace | AuditReport | 定义未实现、owner 穿透、静默 fallback |
