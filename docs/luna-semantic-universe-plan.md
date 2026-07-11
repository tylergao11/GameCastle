# Luna 语义宇宙对齐任务书

## 目标槽位

- `[目标]`：让语义词典的实现绑定可追溯到 GDJS 能力宇宙，同时保持 LLM2 只读取玩法语义与可写槽位。
- `[事实源]`：`ai/gdevelop-truth/capability-universe.json`
- `[语义源]`：`ai/semantic-mapping/semantic-feedback.json`
- `[全宇宙策略]`：`capability_semantic_policy`
- `[全宇宙索引]`：`ai/semantic-mapping/capability-semantic-index.json`
- `[实现源]`：`ai/components/*.json`、`ai/product-modules/*.json`、编译器 owner
- `[基础验收]`：`npm run capabilities:check`
- `[产品投影验收]`：`npm run capabilities:product-projection-check`
- `[全宇宙验收]`：`npm run semantic-universe:check`

## 继承模型

`families` 是组合声明的抽象父节点，统一持有参数、参数宏、标志和来源。`capabilities` 是 action、condition、number-expression、string-expression 成员，通过 `inherits` 获取共享契约。`variants` 表示同一稳定能力 ID 的多处声明，保持一个语义身份。`runtimeOverrides.capabilityIds` 是运行时函数到声明能力的证明边。

Luna 按父节点理解共享语义，按成员表达可执行差异，按 variant 核对实现来源。全宇宙索引为每条 capability 生成抽象父类、唯一具体语义、参数契约、实现路由、暴露状态和双向索引。词典使用稳定 capability ID，运行时函数名与源码行只作为证据。

## 执行阶段

1. 读取 `[事实源]` 的 `model`、`families`、`capabilities`、`runtimeOverrides` 与 `summary`。
2. 为现有 `implementation_bindings` 填写 `gdjs_capability_ids`，每个 ID 与真实组件、模块或编译器 owner 的执行路径一致。
3. 使用 `semantic_concepts` 的抽象父节点承载共性；具体概念通过 `extends` 继承，并由 `semantic_routes` 指向实现 owner。
4. 复核 `command_shapes`、`canonical_write_values`、`display_terms` 与实现绑定的闭环关系。
5. 复核 `capability_semantic_policy.reviewed_universe` 与抽取宇宙指纹一致；能力变化后先审阅策略，再更新指纹和索引。
6. 运行 `[基础验收]`、`[产品投影验收]`、`[全宇宙验收]`、`npm run check:semantic-dictionary`。

## 写入边界

- LLM1 保持创意、模板与氛围选择权。
- LLM2 接收玩法意图、槽位定义、允许值与简洁契约。
- GDJS capability ID、组件 ID、模块 ID 和运行时函数保留在编译器侧。
- 语义共性写入抽象父节点，成员只保存差异字段。
- 每个 implemented route 具有可解析 owner 与能力证明；candidate route 具有明确建设 owner。

## 角色与交接

| 角色 | 责任 | 所有区域 | 必需证据 | 交接格式 | 审计关注 |
|---|---|---|---|---|---|
| Luna / Writer | 补齐语义投影与继承 | 语义词典及必要的 owner manifest | 完成验收输出、变更绑定清单 | 文件差异与命令输出 | 语义层是否泄漏编译器事实 |
| Tester | 独立运行三道验收 | 只读测试 | 两次确定性结果、严格门结果 | 命令、耗时、退出状态 | 快照漂移与空投影 |
| Auditor | 审核抽象、继承、覆盖 | 只读审计 | 未解析数、未链接数、待投影数 | ACCEPT / REJECT 与证据 | 重复定义、错误 owner、假绿 |

## 停止条件

以下计数全部为零后完成交接：`unresolvedDeclarations`、`unresolvedRuntimeBindings`、`unlinkedRuntimeOverrides`、`pendingGdjsBindings`。任何能力 ID 均可从语义绑定追溯到 family/声明来源和运行时覆盖证明。

全宇宙完成条件为 `covered_count / capability_count = 2481 / 2481`；新能力或参数、family、runtime 路由变化会改变审阅指纹，语义门要求更新策略审阅与索引。
