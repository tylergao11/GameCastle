# WP2 产品模块系统深度设计（Sol → Terra）

## 1. 设计结论

WP2 不建设第二套语义引擎，也不把五类 archetype 写成五个生成器分支。五类玩法只保留为早期回归样例，
不再定义模板覆盖范围或 WP2 完成度。现有语义引擎已经拥有 `semantic_concepts`、`gameplayRoles`、
`playGoals`、`eventMeanings`、语义路由和 GDJS 能力语义索引；WP2 的核心是建立两个相互约束的系统：

- **能力生产轨**：从获许可的 GDevelop/GDJS 游戏模板和示例项目中摄取结构，标准化为 `TemplateIR`，拆成
  可复用、可确定编译、可验证、可继续修改的产品模块。
- **好玩方向轨**：由人工维护 `FunBlueprint`，声明核心循环、决策、压力、成长、奖励节奏、失败恢复、
  必需能力、可替换槽位和禁止组合。蓝图提供设计先验，不携带 GDJS target-plan，也不是完整项目副本。

在线计划只组合 approved、revision-pinned 的模块与蓝图。GDJS 模板是生产模块的证据来源，Fun Blueprint
是好玩方向的真相源，模块是生产材料，GDJS 是最终执行目标。

正式链路分为离线供给和在线创作：

```text
获许可 GDevelop/GDJS 模板
  → TemplateIntake：发现、许可校验、hash、版本和来源登记
  → TemplateNormalizer：project.json、场景、事件、对象、行为、变量、资源依赖 → TemplateIR
  → ProductModuleFoundry：切分能力、绑定语义、生成候选模块和验证计划
  → ModuleRepository：通过运行时/试玩/审计证据后晋升 immutable revision

人工玩法设计
  → FunBlueprintLibrary：核心循环、压力、成长、节奏、必需能力、可替换槽位、禁配与试玩标准

自然请求
  → SemanticEngine：理解体验、角色、目标、压力、反馈和生命周期
  → FunBlueprintSelector：选择或组合好玩方向，但不选择内部实现指令
  → ProductModulePlanner：满足蓝图与语义覆盖，选模块、解依赖、解冲突、生成最小 delta
  → ProductModuleCompiler declaration phase：从批准 manifest 产生对象原型、尺寸和 ownership 声明
  → SpatialCompositionPlanner：选择宏观拓扑、区域、角色和节奏关系
  → PlacementResolver：解析最终坐标、避让和摆放证据
  → ProductModuleCompiler emission phase：展开批准 manifest 的内部模板
  → RuntimeValidator + SemanticPlaytestAgent：证明 artifact 与玩法语义
```

机器真相源是 [`shared/wp2-product-module-contract.json`](../shared/wp2-product-module-contract.json)。
本文解释它为什么这样划界，Terra 实现时不得用更方便的临时路径绕开机器合同。
模板、机制、蓝图与真相源 DAG 的完整地基见
[`docs/wp2-template-blueprint-foundation.md`](wp2-template-blueprint-foundation.md)。

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
8. 没有 GDJS 模板目录、许可清单、摄取接口、`TemplateIR` schema、结构 diff 或模板到模块的可追溯链。
9. Foundry 要求调用者直接提供 `referenceFixture`，等于把最关键的模板发现与标准化留在合同之外。
10. 没有 `FunBlueprint` 真相源；现有五类 archetype 同时承担样例、方向和完成门，错误地把初始回归集
    固化成产品边界。

还存在两个必须诚实记录的跨层缺口：

- 2481/2481 表示底层 GDJS capability 语义覆盖完整，不表示五类玩法所需的高层 play goal 已全部存在。
  当前高层词典偏向 platformer；puzzle 的 solve、idle 的 grow、shooter 的 aim/fire 等必须由
  SemanticEngine owner 写回现有 `semantic-feedback.json`。这是原词典的受控扩展，不是第二套 WP2 词典。
- BuildContract 的 `ModuleIntent.action` 已声明 `remove`，但当前 `module-compiler.js` 只处理 install 和
  configure；这是“定义但未实现”，Terra 必须用 ownership 与原子 rollback 补齐，不能沿用假能力。

因此，WP2 不是“补三个核心 JSON”或“继续手写第六个模板”，而是完成模板摄取、模块孵化、人工好玩方向、
确定组合、空间规划、编译、玩法验证和持续沉淀的闭环。

## 3. 覆盖范围的定义

产品模块系统不承诺“知道一个游戏类型名称就支持所有游戏”。只有满足以下条件才可以声明支持：

1. 用户意图中的每个 required semantic id 被批准模块覆盖，或产生明确 blocking debt。
2. 模块依赖、冲突、参数、槽和 revision 全部通过合同。
3. 所需空间角色能由至少一个受支持 topology 完整承载。
4. 编译结果通过 RuntimeValidator。
5. 玩法目标、压力、失败、恢复和进度通过 SemanticPlaytestAgent。
6. create 和 continue 都有可执行证据。

“GDJS 底层能够表达”只能说明 Foundry 有可能扩展，不能说明产品当前已经支持。

五类 archetype 只是历史回归样本：

| Archetype | 核心差异 | 最低空间差异 |
| --- | --- | --- |
| runner/platformer | 连续移动、跳跃、障碍、收集、失败重开 | linear + branching-route |
| top-down collector | 自由移动、收集目标、完成条件 | arena + rooms |
| lightweight shooter | 射击、命中、伤害、压力、波次或路线 | arena + lanes |
| interaction puzzle | 交互、状态变换、约束、成功与重置 | rooms + grid |
| idle/clicker | 资源、转换、升级、持续进度和反馈 | single-screen + staged-zones |

它们证明已实现链路没有退化，但不能单独满足 WP2 覆盖门。生成器核心不得出现 `if archetype === ...` 的
五分支。archetype id 只允许存在于 fixture 标签和产品展示层；真正规划必须依据语义需求、Fun Blueprint、
模块能力、空间合同和约束。

WP2 的扩展性完成门不是固定玩法数量，而是证明：新增一个获许可模板时，无需修改 Planner/Compiler 核心，
即可经过摄取、标准化、模块切分、验证和晋升进入 catalog；新增一个人工好玩方向时，无需复制完整 GDJS
项目，即可由已批准模块产生多个规则或布局显著不同的可玩游戏。

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

### 4.2 离线 Template Intake 与 Foundry

Foundry 是扩展模块库的工程流，不是用户运行时降级策略。它不能要求调用者凭空准备
`referenceFixture`。`TemplateIntake` 必须先从配置的模板源发现项目，验证许可和来源，固定内容 hash，
再由 `TemplateNormalizer` 将真实对象、场景、事件、行为、变量、资源和运行时依赖转换成稳定的
`TemplateIR`。Foundry 只消费 `TemplateIR`、明确的 ModuleDebt 和 before/after diff，不直接解析任意目录。

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

### 4.3 人工 Fun Blueprint

`FunBlueprintLibrary` 是人工提供“好玩的方向”的真相源。每个蓝图必须声明：

- 核心循环、玩家决策、压力来源、成长方式、奖励节奏、失败和恢复；
- required semantic refs 与 required module capabilities；
- 可替换槽位、可选增强、允许的 topology 和参数范围；
- 禁止组合与必须保持的不变量；
- 可机器测量的试玩断言和至少两个显著不同的组合证明。

蓝图不得包含 GDJS 指令、最终坐标、具体资源路径或整份项目结构。它可以引用模块能力和语义，但不能绕过
Planner 直接指定 target-plan。模板摄取扩大“能做什么”，Fun Blueprint 约束“怎样组合才值得玩”。

## 5. 核心 artifact

### 5.0 TemplateSourceRecord、TemplateIR 与 FunBlueprint

`TemplateSourceRecord` 由 TemplateIntake 拥有，记录 source id、license、content hash、upstream revision、
项目入口、允许用途和摄取状态。没有许可或来源 hash 的模板禁止进入 Foundry。

`TemplateIR` 由 TemplateNormalizer 拥有，是 GDevelop/GDJS 项目的稳定结构投影，至少包含 scenes、objects、
behaviors、variables、event graph、external events、resources、extension requirements、entry points 和
source spans。它保留对源模板的可追溯引用，但剥离编辑器缓存、用户私有数据和非确定生成物。

`FunBlueprint` 由 FunBlueprintLibrary 拥有，是人工审查的设计先验。它只声明好玩结构、语义需求、能力槽、
替换规则、禁配、节奏范围和试玩断言，不拥有模块实现或 GDJS artifact。

### 5.1 统一语义引用

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

### 5.2 GameplayRequirementGraph

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

### 5.3 ModuleCompositionPlan

Owner：ProductModulePlanner。

Planner 根据 approved catalog 求满足 requirements 与所选 Fun Blueprint constraints 的最小稳定组合。
计划必须记录 blueprint id/revision/hash、catalog fingerprint、module revision、coverage、slot binding、
constraint evidence、debt 和确定性 hash。

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

### 5.4 ModuleDeclarationPlan

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

### 5.5 SpatialCompositionPlan

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

### 5.6 CompiledModulePlan

Owner：ProductModuleCompiler。

它是唯一允许输出内部 target-plan 的 artifact。每条指令必须来自：

- approved manifest 的内部编译模板；或
- PlacementResolver 的确定性 placement emission。

它还必须输出 ownership receipt，列出本轮 created、updated、removed、retained artifacts。没有 ownership
receipt，就不能证明 continue 没有重复创建，也不能安全 remove/replace。

### 5.7 ModuleDebt

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

## 7. 好玩方向、布局与设计多样性

多样性来自五个相互独立的轴：

1. 好玩方向：不同 Fun Blueprint 定义不同核心循环、决策、压力、成长和奖励节奏。
2. 规则组合：相同 blueprint 与 topology，使用不同可替换模块满足同一能力槽。
3. 空间拓扑：相同规则，arena/rooms/lanes 等结构不同。
4. 参数与节奏：密度、速度、奖励风险比、阶段长度不同。
5. 表现与资产：由 Asset Engine 和模板主题负责，不改变玩法规则真相。

验收必须证明“规则变化”和“布局变化”是两件事：

- 同一个 composition plan，改变 variation seed，应产生不同布局但相同 semantic coverage。
- 同一个 topology，改变 gameplay requirements，应产生不同 module plan。
- 同一个 Fun Blueprint 至少由两组不同模块组合通过试玩断言，证明蓝图不是固定完整模板。
- 同一组底层模块至少能在两个兼容 Fun Blueprint 中承担不同设计角色，证明模块不是 archetype 私有分支。
- 改变美术 style，不应改变 module plan 或 spatial topology，除非资产约束产生明确 debt。

## 8. 云库边界

本地产品模块 catalog 是离线可执行真相。云库负责分发 approved immutable revision，不远程决定运行时
逻辑。在线计划必须固定 module id + revision + manifest hash，不能读取含义不稳定的 `latest`。

云晋升要求：

- TemplateSourceRecord、reference fixture hash 和许可；
- TemplateIR schema、source span 与标准化确定性证据；
- semantic binding evidence；
- manifest contract evidence；
- create/continue/remove/replace evidence；
- runtime 与 semantic playtest evidence；
- 无个人项目数据；
- revision immutable。

用户项目中的一次性参数配置属于 ProjectVersion，不自动进入公共云库。只有可复用、去项目化、经过验证
的模块候选才能晋升。

## 9. Terra 实现顺序与停止条件

Terra 必须按机器合同的 `terraImplementationOrder` 工作。旧的五类 fixture 只作为回归资产保留，不能据此
宣称 WP2 接近完成。新的实现从 TemplateSourceRecord、TemplateIR、FunBlueprint schema 和 owner 边界开始，
随后实现模板摄取/标准化、Foundry、蓝图约束编排以及唯一 CompiledModulePlan 在线入口。不能继续复制 fixture
或手写完整玩法项目来反推抽象。

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
- 模板来源没有许可、hash 或可追溯 upstream revision；
- TemplateIR 无法无损表达模板中的事件图或外部事件依赖；
- Fun Blueprint 开始携带 GDJS 指令、最终坐标或完整项目副本；
- 新增模板仍需修改 Planner/Compiler 核心分支；
- remove/replace 无法证明 artifact ownership；
- 为通过当前 fixture 需要在模块编译器之外写一次性项目补丁；
- archetype id 开始成为生成器核心 dispatch switch。
- 仍需执行 `intent.bridgePlan.targetPlanText` 才能让在线 fixture 通过。

## 10. 完成门

旧十个 create fixtures 与五个 continue fixtures 继续作为回归门，但不再构成覆盖完成门。WP2 还必须：

- 从至少两个独立、获许可的 GDevelop/GDJS 模板源完成端到端摄取与 TemplateIR 确定性重放；
- 从摄取模板中产生并晋升多个非 archetype 私有的可复用模块，保留 source span 和许可追踪；
- 建立人工 Fun Blueprint 库，并证明每个蓝图至少有两个显著不同的模块/布局组合通过浏览器试玩；
- 证明新增模板和新增蓝图均不需要修改 Planner/Compiler 核心 dispatch；
- 覆盖许可拒绝、损坏模板、未知 extension、不可切分事件耦合、蓝图禁配、冲突、缺槽、缺能力、
  不支持 topology、未批准 revision、不安全删除和 stale continue base。

单个模块 schema 通过、target-plan 生成或 HTML 能打开都不等于 playable。只有机器合同中全部
`completionEvidence` 存在，独立 Tester 和 Auditor 均通过，才能将 WP2 从 `designed` 改为
`implemented`。

## 11. 角色交接表

| Role | Responsibility | Owned area | Required evidence | Handoff format | Audit concern |
| --- | --- | --- | --- | --- | --- |
| Sol | 目标、合同、owner、硬门和停止条件 | 本设计与 WP2 机器合同 | 合同自检、现状证据、无所有权冲突 | 本文 + JSON contract | 过度抽象或遗漏真实执行入口 |
| Terra | 完整实现与集成 | Template Intake、Normalizer、Foundry、Blueprint Library、Planner、Compiler、gate | implementation diff + intake/composition/failure/recovery evidence | 按机器合同逐项 receipt | fixture 特判、手写完整模板、LLM 旁路、一次性补丁 |
| Tester | 独立运行合同、domain、project、browser 和 fixture matrix | 测试工作区和 evidence | 命令、日志、截图、fixture hashes | TesterReport | schema pass 冒充 playable |
| Auditor | 独立核对语义、模块、空间、placement、compiler、cloud owner | 全链只读审计 | 声明→schema→handler→evidence trace | AuditReport | 定义未实现、owner 穿透、静默 fallback |
