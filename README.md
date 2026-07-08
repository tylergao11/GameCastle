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
| `ai/capabilities/` | 模块能力真相源，描述可组合能力、DSL 映射、约束和未来同步属性 |
| `ai/schema/` | GDevelop JSON 类型和操作定义，未来 TypeScript 化的候选真理源 |
| `dsl/` | DSL 操作语言文档，连接模块能力和 GDevelop JSON |
| `engine/` | GDJS 浏览器运行时，负责加载 `project.json` 并运行游戏 |
| `templates/` | 当前的能力样例/原型数据；后续应演进为模块能力库，而不是完整游戏模板库 |
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

# Product Module DSL: compile product modules to internal low-level DSL
node ai/pipeline.js --module-dsl-file ai/fixtures/module-platformer-shells.dsl "module composition"
```

前端依赖位于 `platform/`。首次运行前需要执行：

```bash
npm --prefix platform install
```

## Product Module Skeleton

The AI-facing module layer lives in `ai/product-modules/`. LLM1 should see
product module cards, such as `core.platformer`, `shell.start_screen`, and
`shell.game_over_screen`, not low-level object/event templates.

LLM2 can emit Module DSL:

```text
install module id=core.platformer preset=basic sync=lockstep authority=host tickRate=20 seed=auto
install module id=shell.start_screen preset=basic sync=local authority=client title="Sky Runner"
install module id=shell.game_over_screen preset=basic sync=event authority=host
```

`ai/module-compiler.js` compiles product modules into the existing internal
line-style DSL, records installed modules in `ProjectWorld.modules`, and writes
future networking metadata to `output/network-manifest.json`.

The online LLM2 path now uses this same Module DSL surface. Low-level DSL stays
an internal compiler/runtime protocol and is only used by the execution repair
fallback after a compiled batch reaches `ExecutionReport.summary.nextAction=repair`.
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

## Approval Gate

During real LLM testing, use an approval gate instead of pure self-loop:

```bash
node ai/pipeline.js --approval-gate "make a platformer with start and game over screens"
node ai/pipeline.js --approve-pending
```

`--approval-gate` writes `output/pending-approval.json` and stops before
mutating `project.json`. The pending file includes Module DSL, compiled internal
DSL, module/network metadata, and a dry-run preview with predicted semantic
hash, cache-hit status, and command success/failure summary. Approval should be
based on reading that file first.
