# WP2 模板、机制与好玩方向地基

## 1. 核心结论

WP2 不以固定玩法数量、完整项目模板数量或 GDJS tests 数量衡量覆盖。它建立四层开放系统：

1. 创意语义说明用户为什么想玩、目标和体验是什么。
2. 机制原语声明产品可组合能力的稳定接口。
3. 获许可模板提供结构与运行证据，Foundry 将其沉淀为可复用模块。
4. 人工 Fun Blueprint 声明什么组合方向值得玩。

在线链路只读取已批准、不可变、固定 revision 的蓝图与模块。离线链路持续扩大供给，但不得进入用户
create/continue 的同步执行路径。

## 2. 真相源 DAG

机器总表是 `shared/wp2-truth-source-registry.json`。所有权顺序如下：

```text
GDevelop upstream source
  → runtime-truth / capability-universe（可重建投影）
SemanticEngine semantic dictionary + capability-universe
  → capability-semantic-index（可重建路由索引）

TemplateSourceCatalog + runtime-truth
  → TemplateIR instance（逐节点溯源、零静默损失）
TemplateIR + MechanicRegistry
  → ModuleCandidate → approved module revision

SemanticEngine + FunBlueprintDictionary + MechanicRegistry + module catalog
  → deterministic ModuleCompositionPlan
```

边界规则：

- `semantic-feedback.json` 唯一拥有语义 ID 和含义。
- `capability-universe.json` 唯一列举抽取到的 GDJS 条件、动作、表达式、对象与行为事实。
- `capability-semantic-index.json` 是派生索引，只负责语义到 GDJS 能力的路由，不定义新含义。
- `wp2-mechanic-registry.json` 拥有产品机制接口，不复制语义含义或 GDJS 签名。
- `wp2-template-source-catalog.json` 唯一拥有来源、许可、hash、允许用途和状态。
- `wp2-template-ir-contract.json` 唯一拥有标准化结构、lineage 和 loss accounting。
- `ai/product-modules/*.json` 是已批准模块实现的唯一真相；目录索引只能由 manifest hash 生成。
- `wp2-fun-blueprint-dictionary.json` 唯一拥有人工好玩方向、禁配和试玩断言。
- ProjectWorld 只拥有某个项目已安装什么，不能反写任何词典或 catalog 定义。

任何 generated projection 都必须有 `generatedFrom`、fingerprint、重建命令和 drift check。机器绝对路径不是
来源身份；上游 revision 与内容 hash 才是。

## 3. 机制原语

机制原语位于语义和 GDJS 之间：

```text
semanticRef：为什么需要这个能力
mechanicRef：模块之间按什么产品接口拼装
capabilityRef：GDJS 用哪些真实动作/条件/表达式执行
moduleRef：哪个已验证实现提供 mechanicRef
```

Blueprint 的槽和模块的 provides/requires 只能引用固定 `mechanicId + revision + contentHash` 的 approved
mechanic revision。`mechanics/<id>` 仅是发现投影，禁止进入 Build artifact。裸字符串、`current/latest`、
另建同义语义 ID、将 GDJS 指令名暴露给 Blueprint 都是硬失败。

机制 registry 是开放的。新增机制走 append-only immutable revision、语义引用闭合、GDJS 能力证据和跨模块验收；不在
Planner 或 Compiler 中增加玩法分支。

TemplateIR 生成时只记录 source→IR 与 source node disposition，不能预测未来 Candidate/Module。Candidate receipt
追加 IR→candidate，Promotion receipt 追加 candidate→module；独立 append-only LineageProjection 聚合双向查询，
不得回写任何既有 artifact。

## 4. Fun Blueprint 开放分类

当前 12 个 family 是发现地图，不是封闭枚举：移动挑战、生存压力、战斗掌握、时机精度、导航竞速、
物理玩法、推理解谜、战术规划、经济生产、收集成长、社交竞合、叙事探索与角色扮演。

一个 Blueprint 可以属于多个 family；未来可新增、合并、deprecated 或迁移 family。2D/3D、视角、实时/回合、
单人/多人、固定/程序世界、平台和输入方式属于横切 facet，不是玩法 family。

真正可执行的不是 family，而是某个 approved FunBlueprint revision。它必须包含核心循环、决策、压力、成长、
奖励节奏、失败恢复、机制槽、替换规则、禁配、参数边界、正反例与机器试玩断言。

“两个显著不同组合”不能靠换美术、seed、摄像机、纯布局或数字换皮满足；至少要改变机制 provider 集、
玩家决策结构、压力模型或成长路径之一。

## 5. GDJS tests 的定位

`GDJS/tests/games` 是 Runtime/TemplateNormalizer 的结构证据库，不是玩法品类库或可发布素材库。当前盘点中
绝大多数是序列化、行为、资源、动画、网络、性能或运行时夹具；少数 platformer 与 SaveLoad 工程接近完整
玩法结构，但仍只作证据。

允许抽取：

- 场景、对象、行为、变量、事件控制流、条件/动作顺序；
- 动画状态名、帧数、时序、循环、切换与资源角色；
- 事件函数、外部事件、行为依赖、保存读取、网络状态和性能边界。

禁止默认抽取为可发布资产：PNG、音频、字体、模型等二进制。代码 MIT 不代表所有测试素材同样许可。
测试二进制 path/hash 出现在 approved module 或 release 即失败；后续视觉与音频由 Asset Engine 自生成或按
独立资产许可证摄取。

## 6. Blind ingestion 完成证明

“新增模板无需修改核心”必须由审计前未知模板证明：

1. 记录 TemplateIntake adapter interface、TemplateNormalizer core/handler registry、Foundry splitter/binder、
   Promotion validator、Planner、Compiler、Project Weave、TemplateIR schema、MechanicRegistry 的 protected core hash。
2. 摄取一个此前未进入测试矩阵、许可明确的模板。
3. 完成 source record → TemplateIR → candidate → promotion → blueprint composition → browser playtest。
4. protected core hash 保持不变；只允许新增 source record、IR、candidate/manifest、fixture、evidence，或在真正
   新 upstream schema/extension 出现时新增通用 adapter/handler plugin；模板 ID 专用分支永远禁止。
5. 遇到未知结构必须 fail closed，不能为样本增加 archetype switch。

## 7. 完成门

WP2 设计完成要求：真相源全部存在、引用闭合、旧路径清理、机器合同与文档同步、UTF-8 正确、独立测试与
独立审计通过。

WP2 实现完成还要求：至少两个独立获许可来源、确定性 TemplateIR 重放、逐节点 lineage 与零静默损失、
跨源模块复用、approved Blueprint 正反例和每蓝图双显著组合、blind ingestion 零核心改动、浏览器试玩、
独立 Tester 与 Auditor 报告。

旧五类 10 create + 5 continue 单独存于 `shared/wp2-legacy-regression-suite.json`，仅保证不退化，永远不参与
WP2 覆盖率、family 数量或完成度计算。
