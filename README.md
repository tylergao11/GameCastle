# GameCastle

AI 游戏工厂：把能力模块组合成可玩游戏，并支持持续迭代、发布和未来联机。

GameCastle 的目标不是“一句话生成一个一次性小游戏”，而是让用户用自然语言持续塑造一个游戏项目。系统需要把玩法、对象、规则、关卡、资源、运行时能力和未来的联机能力拆成可组合模块，再由生成管线把这些模块装配成可运行的 GDevelop/GDJS 项目。

## 当前数据流

```text
用户意图/迭代请求
  -> LLM1: 创意设计和体验变化
  -> LLM2: 读取模块能力库并生成确定性 DSL patch
  -> DSL 解析与执行
  -> project.json
  -> GDJS Runtime
  -> 浏览器/平台试玩
```

## 目录

| 目录 | 职责 |
|------|------|
| `ai/` | 生成管线主路径，当前由 `pipeline.js` 承担设计稿、DSL 翻译、执行和 CLI |
| `ai/product-modules/` | 模块能力唯一真相源，描述可组合模块、内嵌 capability 卡片、DSL 映射、约束和同步属性 |
| `ai/assets/` | Seed local/cloud asset repository manifests used by RuntimeAssetResolver |
| `ai/gdevelop-truth/` | Extracted GDevelop/GDJS runtime truth snapshot generated from `D:\GDevelop-master` |
| `dsl/` | DSL 操作语言文档，连接 product-modules 能力和 GDevelop JSON |
| `engine/` | GDJS 浏览器运行时，负责加载 `project.json` 并运行游戏 |
| `templates/` | 网络同步模型参考模板（游戏原型已迁移至 product-modules） |
| `platform/` | React/Vite 平台前端，承载发现、创建、迭代、试玩和未来发布/联机入口 |
| `output/` | 生成产物：`project.json`、`game.html`、`project-world.json`、`execution-ledger.json` |
| `docs/` | 架构、路线图和产品边界说明 |

## 核心原则

- 模块优先：向 LLM1 暴露轻量能力提示，向 LLM2 暴露可编译模块能力，而不是整套可照抄的游戏模板。
- 可迭代：一次生成只是项目状态的一个版本，后续请求应由 LLM2 以 patch 的方式修改项目。
- 状态稳定：LLM2 不直接读取完整 `project.json`，而是读取翻译后的 `ProjectWorld` 和追加式执行账本。
- 自修复：LLM2 执行失败时读取上一轮 `ExecutionReport`，只追加修复 DSL diff。
- 真相源统一：能力写在 `ai/capabilities/`，prompt 只消费派生上下文，不手写另一套能力表。
- 可运行：每次生成都必须落到 `project.json` + `game.html`，能被 GDJS Runtime 打开。
- 可扩展：未来联机功能会引入帧同步、状态同步、房间/会话和权威状态边界，不能把架构锁死在单机模板思路里。

## 命令

```bash
# 前端开发
npm run dev

# 前端构建
npm run build

# 离线 mock 生成，写入 output/
npm run gen

# 继续迭代当前 output/project.json
node ai/pipeline.js --continue "加入一个 Boss，并让金币更密集"

# 生成器语法检查
npm run check:ai

# AI 管线 fixture 测试：状态机、repair batch、缓存命中和超时防护
npm run test:ai

# Refresh/check the extracted GDevelop runtime truth snapshot
npm run truth:extract
npm run truth:check

# Legacy/internal Module DSL: compile product modules to internal low-level DSL
node ai/pipeline.js --module-dsl-file ai/fixtures/module-platformer-shells.dsl "module composition"

# AI-first Intent DSL: compile natural intent through bridge plan to internal DSL
node ai/pipeline.js --intent-dsl-file ai/fixtures/intent-mobile-platformer.dsl
```

前端依赖位于 `platform/`。首次运行前需要执行：

```bash
npm --prefix platform install
```

## Product Module Skeleton

This is the current pre-refactor module baseline. The AI-facing module layer
lives in `ai/product-modules/`. LLM1 should see
product module cards, such as `core.platformer`, `shell.start_screen`, and
`shell.game_over_screen`, not low-level object/event templates.

Historically, before the AI-first Intent refactor, LLM2 emitted Module DSL.
Treat this as a migration baseline and internal compiler target shape, not the
new LLM2 product surface:

```text
install module id=core.platformer preset=basic sync=lockstep authority=host tickRate=20 seed=auto
install module id=shell.start_screen preset=basic sync=local authority=client title="Sky Runner"
install module id=shell.game_over_screen preset=basic sync=event authority=host
```

`ai/module-compiler.js` compiles product modules into the existing internal
line-style DSL, records installed modules in `ProjectWorld.modules`, and writes
future networking metadata to `output/network-manifest.json`.

The AI-first Intent refactor replaces this as the live product surface instead
of keeping it as a parallel compatibility path. Low-level DSL and Module DSL are
machine/compiler shapes only; LLM2 should speak natural game intent, and the
compiler/runtime bridge should choose ids, modules, components, adapters, and
coordinates. Low-level DSL stays an internal compiler/runtime protocol and is
only used by the execution repair fallback after a compiled batch reaches
`ExecutionReport.summary.nextAction=repair`.
On `--continue`, the compiler reads existing `ProjectWorld.modules` as the base
module set, rejects duplicate reinstalls, and emits only the low-level diff
needed for newly installed modules or module link patches.

Installed modules can also be configured through closed Module DSL:

```text
configure module id=shell.start_screen title="Moon Runner" button="Play Now"
configure module id=shell.start_screen sync=event authority=host
```

Only parameters declared in the product module manifest are configurable. The
compiler patches existing generated events through `ProjectWorld`, updates
`ProjectWorld.modules`, and rewrites the network manifest for sync-only changes.
Fixed runtime interactions are also part of the product module truth source.
For example, a start-screen label can describe the button, but it cannot claim
an Enter-key trigger unless the module exposes that trigger. LLM2 sees this
interaction contract when translating creative intent into Module DSL, and the
compiler rejects misleading copy before approval.
Module-link slots stay internal: installing `shell.game_over_screen` wires the
platformer fail action through the compiler, so LLM2 does not need to configure
that low-level slot directly.

## AI-first Intent Refactor

The live LLM2 surface is Intent DSL, not GDJS events and not a parallel
compatibility wrapper around Module DSL. This is a breaking refactor: the live
LLM2 product path uses Intent DSL as the single canonical surface. Module DSL is
kept for explicit fixture/internal migration input only.

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
mutating `project.json`. For Intent patches, the pending file includes Intent
DSL, typed Intent Graph, Placement Plan, Bridge Plan, Compile ResultCard,
compiled internal DSL, runtime adapter requirements, module/network metadata,
and a dry-run preview with every command result, predicted semantic hash, and
cache-hit status. Approval should be based on reading that file first.

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


