# AI — 模块化生成管线

`ai/` 当前负责把用户意图编译为可运行游戏项目。它不是“模板拷贝器”，而是游戏工厂的生成管线雏形。

## 当前文件

| 文件 | 职责 |
|------|------|
| `pipeline.js` | 当前主路径：LLM1 设计稿、LLM2 DSL 翻译、DSL 解析、事件解析、操作执行、CLI、`output/` 写入 |
| `capabilities.js` | 加载并校验能力卡，派生 LLM1 摘要和 LLM2 编译上下文 |
| `check-capabilities.js` | 能力卡校验脚本，已接入 `npm run check:ai` |
| `check-product-modules.js` | 产品模块校验脚本，已接入 `npm run check:ai` |
| `module-dsl.js` | LLM2/Commander 级 Module DSL parser |
| `module-compiler.js` | 产品模块编译器，把 Module DSL 展开为内部低层 DSL，并产出 network manifest |
| `project-world.js` | 把 GDevelop `project.json` 翻译为稳定的 `ProjectWorld`，并追加 `ExecutionLedger` |
| `schema/operations.ts` | GDevelop 操作定义，后续应成为能力到 JSON 操作的真理源 |
| `schema/json-engine.ts` | TypeScript 版 JSON 操作执行器，待与 `pipeline.js` 统一 |
| `schema/gdevelop-types.ts` | GDevelop `project.json` 类型定义 |

历史拼装脚本和硬编码旧路径已经移除。后续新增脚本必须使用仓库相对路径，并且明确属于测试、构建还是迁移。

## 能力真相源

`ai/capabilities/` 是当前模块能力真相源。每张能力卡描述：

- `llm1Hint`：给 LLM1 的轻量能力提示，不包含完整 DSL 示例或模板结构。
- `provides/requires`：能力提供什么、需要什么对象/变量/事件/行为。
- `dsl.commands/examples`：LLM2 可以编译的行式 DSL。
- `constraints`：编译和运行时约束。
- `sync`：未来联机同步模式、确定性和权威状态边界。

`pipeline.js` 不再把能力表手写在 prompt 里，而是通过 `capabilities.js` 派生：

- LLM1：只拿 `buildCreativeCapabilitySummary()`。
- LLM2：拿 `buildCompilerPromptSection()`，包括结构化能力卡和 DSL 命令表。

## 当前管线

```text
prompt
  -> LLM1 generateDesignBrief
  -> module/design brief
  -> LLM2 translate to DSL
  -> parseDSL
  -> execute operations
  -> output/project.json + output/game.html
  -> output/project-world.json + output/execution-ledger.json
```

## Product Modules

`ai/product-modules/` is the higher-level product module truth source. These
modules are intentionally coarse and AI-friendly:

- `core.platformer`: a complete playable platformer core.
- `shell.start_screen`: a start scene shell.
- `shell.game_over_screen`: a fail-state shell that links into core fail slots.
- `meta.score`: score state/display support for cores that need it.

Module DSL is line-style and patch-like:

```text
install module id=core.platformer preset=basic sync=lockstep authority=host tickRate=20 seed=auto
install module id=shell.start_screen preset=basic sync=local authority=client title="Sky Runner"
```

The compiler resolves module links before producing low-level DSL. For example,
installing `shell.game_over_screen` fills the `core.platformer` fail slot with
`scene GameOver`, so composition belongs to runtime/compiler ownership instead
of LLM1 memory.

The live LLM2 path is also Module DSL first:

```text
LLM1 design brief
  -> LLM2 Module Patch Commander
  -> Module DSL
  -> module compiler
  -> internal low-level DSL
  -> executor / ProjectWorld / ExecutionLedger
```

On `--continue`, existing `ProjectWorld.modules` are treated as the base module
set. The compiler rejects duplicate module installs, merges new modules into
the module state, rewrites the full network manifest, and can generate narrow
slot patches against the existing `ProjectWorld` instead of replaying a whole
template.

Configured installed modules use the same closed loop:

```text
configure module id=shell.start_screen title="Moon Runner" button="Play Now"
configure module id=shell.start_screen sync=event authority=host
```

The compiler only accepts keys declared by `compiler.configurePatches` or sync
policy fields. Text and navigation changes become targeted event replacement
diffs. Sync-only changes are metadata-only batches with zero internal DSL
commands, but still update `ProjectWorld.modules`, `ExecutionLedger`, and
`output/network-manifest.json`.

Module manifests also own fixed interaction contracts. Display parameters such
as `button` and `hint` may be configurable, but they cannot invent triggers that
the module runtime does not implement. LLM2 receives those interaction contracts
as part of the Module DSL reference, and the compiler validates configured copy
against them before producing any approval packet.

Module-link slots are internal compiler ownership. For example,
`core.platformer.failAction` is filled by installing `shell.game_over_screen`;
LLM2 should not configure that slot directly. This keeps composition as a
runtime/module capability instead of another low-level detail the model must
remember.

## HTML Export

`ai/html-exporter.js` owns the browser export boundary. It uses the official
GDJS runtime cache from `engine/gdevelop-runtime/` and writes a GDevelop-style
HTML output folder instead of copying platform packages wholesale.

Generated HTML output includes:

- `output/project.json`
- `output/data.js`
- `output/code*.js`
- `output/html-export-manifest.json`
- `output/index.html`
- `output/game.html`

The manifest keeps the 2D Pixi runtime available for playable browser games,
adds 3D runtime files when the project uses 3D capabilities, and excludes
non-HTML packages such as Cordova, Electron, debugger clients, and TypeScript
declaration bundles.

## Approval Gate

For live LLM tests, prefer:

```bash
node ai/pipeline.js --approval-gate "make a platformer with start and game over screens"
node ai/pipeline.js --approve-pending
```

`--approval-gate` stops after Module DSL compilation and writes
`output/pending-approval.json`. The approval packet contains:

- LLM2 Module DSL.
- Compiled internal low-level DSL.
- Installed module state and network manifest.
- Dry-run preview: `nextAction`, predicted semantic hash, cache-hit status, and
  failed command summaries.

Nothing is written to `project.json` until `--approve-pending` is run.

## 项目模式

pipeline 先判断项目模式，再决定状态来源：

- 默认模式和 `--mock`：新项目。会重置 `output/project.json`、`output/game.html`、`project-world.json`、`execution-ledger.json`，从空项目执行第一轮 DSL。
- `--continue`：迭代现有项目。必须存在 `output/project.json`，并读取现有 `ProjectWorld` 和 `ExecutionLedger` 作为 LLM2 循环上下文。

这条边界很重要：repair loop 可以基于“当前已应用的项目”追加 DSL diff，但新项目绝不能继承上一局的 world/ledger。

## 目标管线

```text
prompt / iteration request
  -> project state summary
  -> lightweight creative context
  -> LLM1 creative design intent
  -> module capability catalog for compiler
  -> LLM2 deterministic DSL patch
  -> typed operation executor
  -> versioned project state
  -> runnable build
```

## LLM 可见信息边界

LLM1 不记忆模板结构，也不负责输出 patch。它看到用户意图、当前游戏体验摘要和少量能力提示，负责提出高层玩法和体验变化。

LLM2 才看到模块能力库、DSL 能力、参数规则、当前项目状态和 LLM1 的创意输出。它负责把意图编译成确定性 patch。

完整模板不应该作为主要上下文展示给任一阶段。LLM1 只需要能力提示；LLM2 需要的是可编译的模块能力和 DSL 规则，而不是整套游戏模板。

`project.json` 是 GDevelop/GDJS 的运行产物，不是 LLM2 的主要上下文。LLM2 的循环上下文应该是翻译后的 `ProjectWorld`、模块能力卡、上一轮 DSL diff 和 `ExecutionLedger`，用来判断当前世界、已完成命令和需要修复的命令。

## LLM2 修复循环

首轮 LLM2 输出作为 `apply` batch 执行。每个 batch 都会追加一条 `ExecutionReport`，记录 `batchLabel`、完成命令、失败命令和 `nextAction`。

当 `nextAction=repair` 时，pipeline 最多让 LLM2 追加 2 轮修复 DSL：

- 输入当前 `ProjectWorld`。
- 输入上一轮 `ExecutionReport`。
- 输入上一轮 DSL。
- 只允许输出失败命令所需的新增 DSL diff。

如果修复轮后仍然失败，pipeline 设置失败退出码，并保留当前 `output/project.json`、`project-world.json` 和 `execution-ledger.json` 供下一次诊断。

## Fixture 测试

`npm run test:ai` 使用 `ai/fixtures/` 中的 DSL 文件测试状态机，不调用 LLM：

- `valid-platformer.dsl`：完整可玩平台跳跃 fixture。
- `repair-missing-scene.initial.dsl`：构造缺失场景失败。
- `repair-missing-scene.patch.dsl`：模拟 LLM2 修复 batch。

测试器 [test-dsl-fixtures.js](D:/GameCastle/ai/test-dsl-fixtures.js) 会验证：

- 新项目会重置 `ProjectWorld` 和 `ExecutionLedger`。
- 等价新项目重复生成时 `semanticHash` 命中，`project.json` 字节稳定。
- 失败命令进入 `ExecutionReport.failed`。
- 修复 DSL 以 `repair_01` batch 追加执行。
- 每个 pipeline 子进程有 15 秒 timeout guard，ledger run 数有上限，防止内部循环悄悄卡住。

## 命令

```bash
# 离线 mock 生成
node ai/pipeline.js --mock platformer

# 真实 LLM 生成
node ai/pipeline.js "做一个平台跳跃收集金币的游戏"

# 继续迭代
node ai/pipeline.js --continue "加入一个 Boss，并让金币更密集"

# 语法检查
npm run check:ai
```

## 环境变量

```bash
LLM_ENDPOINT=http://127.0.0.1:18081/v1
DEEPSEEK_API_KEY=your_key
LLM_MODEL=deepseek-v4-flash
```
