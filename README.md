# GameCastle

AI 游戏工厂：把能力模块组合成可玩游戏，并支持持续迭代、发布和未来联机。

GameCastle 的目标不是“一句话生成一个一次性小游戏”，而是让用户用自然语言持续塑造一个游戏项目。系统需要把玩法、对象、规则、关卡、资源、运行时能力和未来的联机能力拆成可组合模块，再由生成管线把这些模块装配成可运行的 GDevelop/GDJS 项目。

## 当前数据流

```text
用户意图/迭代请求
  -> LLM1: 创意设计和体验变化
  -> LLM2: 读取 IntentWorldView 和安全上下文，生成自然 Intent DSL
  -> Intent Graph / Resolver / Bridge 编译为内部执行计划
  -> Runtime 执行并生成 ProjectWorld / ExecutionReport
  -> Semantic Playtest / Repair Intent / Decision Loop 复测
  -> project.json
  -> GDJS Runtime
  -> 浏览器/平台试玩
```

## 目录

| 目录 | 职责 |
|------|------|
| `ai/` | 生成管线主路径，当前由 `pipeline.js` 承担设计稿、Intent 编译、执行、语义试玩闭环和 CLI |
| `ai/product-modules/` | 编译器模块能力真相源，描述可组合模块、内嵌 capability 卡片、内部映射、约束和同步属性 |
| `ai/assets/` | Seed local/cloud asset repository manifests used by RuntimeAssetResolver |
| `ai/gdevelop-truth/` | Extracted GDevelop/GDJS runtime truth snapshot generated from `D:\GDevelop-master` |
| `dsl/` | 内部低层执行协议文档，仅用于 Bridge/Runtime target facts，不是 live LLM2 产品面 |
| `engine/` | GDJS 浏览器运行时，负责加载 `project.json` 并运行游戏 |
| `templates/` | 网络同步模型参考模板（游戏原型已迁移至 product-modules） |
| `platform/` | React/Vite 平台前端，承载发现、创建、迭代、试玩和未来发布/联机入口 |
| `output/` | 生成产物：`project.json`、`game.html`、`project-world.json`、`execution-ledger.json` |
| `docs/` | 架构、路线图和产品边界说明 |

## 核心原则

- AI-first：用户和 LLM2 只表达自然游戏意图；坐标、组件 id、GDJS、runtime adapter 和低层执行 DSL 由编译器/bridge/runtime 拥有。
- 可迭代：一次生成只是项目状态的一个版本，后续请求应由 LLM2 以自然 Intent DSL 的方式修改项目。
- 状态稳定：LLM2 不直接读取完整 `project.json`，而是读取翻译后的 `ProjectWorld` 和追加式执行账本。
- 自修复：LLM2 只修 parser/surface 层的自然 Intent；编译、placement、bridge、runtime、playtest 问题按 owner 路由，不回退让 LLM2 写低层 DSL。
- 真相源统一：能力写在 `ai/product-modules/`，`capabilities.js` 只派生安全摘要，不导出低层 DSL prompt 面。
- 可运行：每次生成都必须落到 `project.json` + `game.html`，能被 GDJS Runtime 打开。
- 可扩展：未来联机功能会引入帧同步、状态同步、房间/会话和权威状态边界，不能把架构锁死在单机模板思路里。

## 命令

```bash
# 前端开发
npm run dev

# 前端构建
npm run build

# 离线 Intent fixture 生成，写入 output/
npm run gen

# 继续迭代当前 Intent iteration state
node ai/pipeline.js --continue "加入一个 Boss，并让金币更密集"

# 生成器语法检查
npm run check:ai

# AI 管线 fixture 测试：状态机、repair batch、缓存命中和超时防护
npm run test:ai

# Refresh/check the extracted GDevelop runtime truth snapshot
npm run truth:extract
npm run truth:check

# AI-first Intent DSL: compile natural intent through bridge plan to internal DSL
node ai/pipeline.js --intent-fixture-file ai/fixtures/intent-mobile-platformer.dsl
```

`--intent-fixture-file` is an Intent artifact entry only: offline fixtures must live under `ai/fixtures/intent-*.dsl`; generated repair artifacts must live under `output/*.intent.dsl`.

前端依赖位于 `platform/`。首次运行前需要执行：

```bash
npm --prefix platform install
```

## Product Module Skeleton

Current AI-first boundary: LLM2 writes natural Intent DSL only. Product modules,
low-level DSL, runtime adapters, coordinates, and GDJS details are
compiler/runtime target facts, not the live LLM2 product language.

The module truth layer lives in `ai/product-modules/`. LLM1 may see product
capability summaries, while LLM2 selects gameplay through Intent DSL instead of
writing module ids or engine edits.

`ai/module-compiler.js` compiles product modules into the existing internal
line-style DSL, records installed modules in `ProjectWorld.modules`, and writes
future networking metadata to `output/tick-runtime-manifest.json`.

Low-level DSL is a machine/compiler shape only; LLM2 should speak natural game
intent, and the compiler/runtime bridge should choose ids, modules, components,
adapters, and coordinates. Low-level DSL stays an internal compiler/runtime
protocol.
On `--continue`, the compiler reads existing `ProjectWorld.modules` as the base
module set, rejects duplicate reinstalls, and emits only the low-level diff
needed for newly installed modules or module link updates.

Only parameters declared in the product module manifest are configurable. The
compiler updates existing generated events through `ProjectWorld`, updates
`ProjectWorld.modules`, and rewrites the tick runtime manifest for sync-only changes.
Fixed runtime interactions are also part of the product module truth source.
For example, a start-screen label can describe the button, but it cannot claim
an Enter-key trigger unless the module exposes that trigger. LLM2 sees only the
natural capability/interaction summary while writing Intent DSL; the compiler
maps that intent to internal Module/Bridge facts and rejects misleading copy
before approval.
Module-link slots stay internal: installing `shell.game_over_screen` wires the
platformer fail action through the compiler, so LLM2 does not need to configure
that low-level slot directly.

## AI-first Intent Refactor

The live LLM2 surface is Intent DSL, not GDJS events and not a parallel
compatibility wrapper around older command formats. The live LLM2 product path
uses Intent DSL as the single canonical surface.

Intent DSL describes human game-world concepts:

```text
make a mobile platformer
give Player platformer movement
add joystick controls Player near screen bottom-left
add jump button controls Player near screen bottom-right
add inventory owned by Player with 24 slots near screen right
place coins near Player front as trail count 8
```

The runtime/compiler bridge owns id selection, component expansion,
`near/direction` placement resolution, internal low-level DSL, GDevelop project
data, generated scene code, and GDJS runtime adapters. In other words: no
machine-shaped commands are part of the intended LLM2 product language.
The first component catalog lives in `ai/components/`: its AI Manifest side is
natural-language component cards, while its Compiler Manifest side owns
component ids, inherited defaults, requirements, bindings, placement policy, and
GDJS adapter requirements.
The first bridge owner is `ai/gdjs-bridge.js`: it emits internal low-level DSL
for product modules, component UI objects, resolved placements, semantic group
placements, and records touch/joystick/inventory runtime adapter requirements.
`ai/intent-runtime-codegen.js` turns those requirements into `intent-runtime.js`,
which the HTML export attaches to the GDJS game as `GameCastleIntentRuntime`.

See [AI-first Intent Runtime Bridge](docs/ai-first-intent-runtime-bridge.md).

## Approval Gate

During real LLM testing, use an approval gate instead of pure self-loop:

```bash
node ai/pipeline.js --approval-gate "make a platformer with start and game over screens"
node ai/pipeline.js --approve-pending
```

`--approval-gate` writes `output/pending-approval.json` and stops before
mutating `project.json`. For Intent artifacts, the pending file includes Intent
DSL, typed Intent Graph, Placement Plan, Bridge Plan, Compile ResultCard,
compiled internal DSL, runtime adapter requirements, module/network metadata,
and a dry-run preview with every command result, predicted semantic hash, and
cache-hit status. Approval should be based on reading that file first. If an
LLM or agent needs to inspect a pending approval, pass only
`aiVisibleForLlm2`; the full packet is a human/runtime audit artifact and
contains target-code details.

## GDevelop Runtime Truth

GameCastle does not hand-maintain GDevelop object types, behavior types, object
data fields, or extension include files. `scripts/extract-gdevelop-truth.js`
extracts the supported runtime surface from `D:\GDevelop-master` into
`ai/gdevelop-truth/runtime-truth.json`.

`ai/gdevelop-truth.js` is the only in-repo entry point for these facts. The
pipeline may keep AI-friendly internal DSL names such as `ShapePainter`, but
the emitted `project.json` must validate against official GDevelop types and
fields from the snapshot. HTML export also reads object/behavior include files
from the same snapshot and fails fast on unsupported runtime types.

## HTML Runtime Cache

GameCastle uses the official GDJS browser runtime built from GDevelop source.
The local cache lives at `engine/gdevelop-runtime/` and is intentionally ignored
by git.

Prepare it before running pipeline commands on a fresh checkout:

```bash
npm run runtime:prepare
```

By default the prepare script reads `D:\GDevelop-master`. Override that with
`GDEVELOP_SOURCE_DIR` or:

```bash
node scripts/prepare-gdjs-runtime.js --source <GDevelop checkout>
```

The generated game output is HTML-only. Cordova, Electron, debugger clients,
TypeScript declaration bundles, and other non-browser platform packages are not
part of the GameCastle export path.


