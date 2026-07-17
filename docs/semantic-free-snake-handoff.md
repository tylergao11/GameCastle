# Semantic free / snake 六任务交接

**日期：** 2026-07-17  
**分支：** `main`  
**离线门：** `npm run check:semantic-loop` → **11/11 绿**  
**成功模式分离：** freeze plan 绿 ≠ free plan 全过；runtimeOk ≠ oracleOk

---

## 1. 本轮目标

在约束下（改真正所有者，不 prompt-only 糊墙，DSL/parse/runtime/prompt 一合同）把 free 六任务做到 **runtimeOk + oracleOk 同批全过**，并压住 free repair「假死循环」。

## 2. 已落地（代码所有者）

| 区域 | 文件 | 要点 |
|------|------|------|
| TaskPlan | `packages/semantic/src/semantic-task-plan.js` | draft 隐式读；foundation plan-use 不必 retrieve；event+existing member update 不可行；shell 空进度；entity path / 大小写 id；伪 member 禁（kind/roles/behaviors/点号）；write slot 认 `Owner.field`/`Owner.slotId`；when/then 强制 condition/action；**expression plan-use 仅 Entity.member 读者**；new shell 无 event 禁 member（seed 用 `allowShellMembers`）；revision 有 scene-state 时禁「新实体只挂 field」 |
| Draft | `semantic-draft.js` | 无 `objectTypeRef` 的 kind 不得挂 behaviors |
| Algebra | `semantic-event-algebra.js` | `up`→`Up` 等键盘规范化 |
| Prompt | `semantic-prompt-bundle.js` | planner v18 / executor v17；SCOPE/MEMBER/PLAN_USE/TASKS 收紧；prose &lt; 2400 |
| Fuse | `semantic-run-state-machine.js` | failure 签名 **不含 subjectHash**；同类 code+message 连续 2 次 FUSED（避免 80 轮假死循环） |
| Oracle | `tests/benchmarks/snake-semantic-benchmark.js` | GDJS 参数 lift：key/collides/place.random-grid/bool True/数值 |
| Contract | `snake-semantic-contract.json` | growth 模式 `^(pending[-_. ]?)?growth$` |
| Live 脚本 | `scripts/semantic/debug-snake-real-llm.js` | **runtimeOk / oracleOk 分报** |
| Seed | `semantic-seed-loader.js` | `allowShellMembers: true` 装夹具 |

## 3. 验证命令

```text
npm run check:semantic-loop

# free 单任务（禁止六任务串跑长等）
# PowerShell 勿用 &&
$env:GAMECASTLE_RUNTIME_MODE='development'
node scripts/semantic/debug-snake-real-llm.js --benchmark-task=loss-restart --timeout-ms=90000
```

模式检查：`npm run model:config:check`（`GAMECASTLE_RUNTIME_MODE` + DeepSeek key）。

## 4. free 最新抽样（2026-07-17，development / DeepSeek）

| 任务 | runtimeOk | oracleOk | 备注 |
|------|-----------|----------|------|
| core-model | 常 true | 波动 | 偶缺 GameState 实体（shell 修计划过裁） |
| state-fields | true | true | 稳 |
| up-input | true | true | 稳（key + lift） |
| timed-right-movement | true | true | 稳 |
| food-score-growth | 多 true | 多 true | 曾 fuse 在 object.x 当 action（plan 层已禁） |
| loss-restart | 常 fuse / 偶 runtimeOk | 未稳 oracle | 结构 6 事件 / gameOver 挂 GameState / place.random-grid；曾 SLOT_MISSING `GameState.gameOverFlag`（**slot id 解析已修**） |

**勿再：** 六任务 foreach + 超长 wait。只单任务、短超时、读 artifact。

## 5. 未完成 / 下一刀（按优先级）

1. **loss-restart free 结构**  
   - oracle：`entities exact 1`（body）、`members exact 1`（GameState.gameOver）、`events exact 6`（四边界+自碰+restart）  
   - free 易：边界揉成 1 事件、发明第二 state、`object.show` 代替 `place.random-grid`  
   - 金标：`.gamecastle/output/semantic-plans/loss-restart.plan.dsl`  
   - 建议：继续 TaskPlan 通用可行性 + 紧凑 TASKS/SCOPE；**不要** snake 硬编码实体名  

2. **core-model free**  
   - 无 event 禁 member 后，repair 有时连 GameState 实体一起砍  
   - 反馈文案已写 “keep entities, drop fields only”；可再观抽样  

3. **fuse / 超时体验**  
   - 同类错误已 2 次熔断；仍可观测是否过早 fuse 合法不同 message  

## 6. 约束（Open OS / 项目）

- 探针 → 所有者 → 根因 → 复测；禁止 prompt-only 补丁  
- 能力通道：模型 `capability=alias|handle`；plan-use.use=字典 handle；resolve 后 use=handle  
- freeze vs free、runtimeOk vs oracleOk **分报**  
- Shell：PowerShell **无 `&&`**  
- 不提交密钥；`.env.local` 不入库  

## 7. 关键 artifact / 金标

| 路径 | 用途 |
|------|------|
| `.gamecastle/output/semantic-plans/*.plan.dsl` | freeze 金标 plan |
| `.gamecastle/output/semantic-live/snake-live-*.json` | free 全量 trace / evaluation |
| `tests/fixtures/semantic/semantic-snake-*-seed.dsl` | revision seed |
| `tests/benchmarks/snake-semantic-contract.json` | 六任务 oracle 合同 |

## 8. 协议版本（合同钉）

- Language：`semantic-dsl-v9`  
- Planner：`semantic-planner-prompt-v18`  
- Executor：`semantic-executor-prompt-v17`  
- LLM2 输出上限：8196；run hard timeout：300s  

## 9. 给下一会话的第一动作

```text
1. npm run check:semantic-loop
2. 读本文 §5 + 最新 loss-restart live JSON 的 lastFailure / taskPlan.slots
3. 只改 TaskPlan（或合同所有者），单任务 free loss-restart --timeout-ms=90000
4. 表报 runtimeOk/oracleOk，不串六任务
```
