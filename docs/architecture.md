# GameCastle 架构设计

## 定性

GameCastle 是模块化游戏工厂，不是一次性小游戏模板生成器。

目标状态是：用户可以持续用自然语言创建、试玩、修改、发布游戏；系统把游戏能力拆成可组合模块，并把每次迭代编译成可运行项目。未来加入联机时，模块库还要覆盖帧同步、状态同步、输入同步、房间会话、断线恢复和权威状态边界。

## 整体数据流

```text
用户意图/迭代请求
  -> 创意层: LLM1 产出高层游戏设计意图和体验变化
  -> 编译上下文: 模块能力库、DSL schema、当前项目状态
  -> 翻译层: LLM2 把高层意图编译为确定性 DSL patch
  -> 执行层: DSL 解析器和执行器修改 project.json
  -> 状态层: ProjectWorld 翻译稳定世界摘要，ExecutionLedger 追加执行报告
  -> 修复层: 若执行失败，LLM2 读取失败报告并追加修复 DSL diff
  -> 运行层: GDJS Runtime 加载 project.json
  -> 平台层: React 前端承载试玩、迭代、发布和未来联机入口
```

## LLM 分工

### LLM1: 创意与体验设计

LLM1 面向用户意图，温度可以保持 0.7。它不应该记忆模板结构，也不应该被强 schema 约束成 patch 生成器。

它应该看到的是轻量上下文：

- 用户原始意图和当前迭代请求。
- 当前游戏的体验摘要，例如主题、核心循环、玩家目标、已有问题。
- 从 `ai/capabilities/` 派生的轻量能力提示，例如“支持平台跳跃/射击/收集/敌人/Boss/联机雏形”，但不是完整模板或 DSL schema。
- 少量设计边界，例如画布大小、目标是可玩、后续可迭代、未来会有同步约束。

LLM1 输出的是高层设计意图：想要什么体验、加入什么玩法、哪里变难、哪里要保留。它可以是自然语言加少量 JSON 摘要，但不承担精确 patch、对象 ID、DSL 行或 `project.json`。

### LLM2: 结构化编译与 patch

LLM2 面向工程落地，才是结构化模型。它应该看到：

- LLM1 的高层设计意图。
- 当前 `ProjectWorld` 摘要、稳定 ID 和上一轮执行报告。
- `ai/capabilities/` 中的模块能力库，包括对象、变量、事件、兼容关系、运行时限制和未来同步标记。
- 从能力卡派生的 DSL 能力表、参数约束和 patch 规则。

LLM2 输出应是 DSL patch 或更严格的 operation patch。初次生成也应视为“从空项目打 patch 到第一个可玩版本”。这样连续迭代不会退化为全量重生成。

LLM2 具备受限自循环：首轮输出作为 `apply` batch；如果 `ExecutionReport.summary.nextAction=repair`，则读取当前 `ProjectWorld`、上一轮失败报告和上一轮 DSL，只追加修复所需的 DSL diff。已完成命令不能重复输出。当前限制最多 2 轮修复，仍失败则保留产物并返回失败码。

项目模式必须先判定：

- 新项目：默认模式和 `--mock`，重置上一局 generated state，从空项目开始。
- 迭代项目：`--continue`，必须加载现有 `output/project.json`，并继承同一局游戏的 `ProjectWorld` 和 `ExecutionLedger`。

因此 repair loop 的“当前已应用项目”只在同一局游戏内延续；开新项目时不得继承上一局缓存。

自动化验证由 `npm run test:ai` 覆盖。它不调用 LLM，而是用 DSL fixture 验证 new/continue 状态边界、失败报告、repair batch、缓存命中和 15 秒子进程超时防护。

## 当前模块边界

### Product Module DSL

The AI-facing composition layer is `ai/product-modules/` plus
`ai/module-dsl.js` and `ai/module-compiler.js`.

LLM1 should select from product-level module cards and should not memorize
template internals. LLM2 may emit Module DSL patches such as:

```text
install module id=core.platformer preset=basic sync=lockstep authority=host tickRate=20 seed=auto
install module id=shell.start_screen preset=basic sync=local authority=client
install module id=shell.game_over_screen preset=basic sync=event authority=host
```

The compiler expands those modules into the existing internal line-style DSL,
then the current executor mutates `project.json`. Installed modules are recorded
in `ProjectWorld.modules`; future networking metadata is recorded in
`output/network-manifest.json`.

This keeps the product skeleton coarse: a platformer core plus shells is exposed
as product composition, while player objects, collision events, text objects,
and fail-scene wiring stay inside runtime/compiler ownership.

The online generation path follows the same boundary. LLM2 is the Module Patch
Commander and outputs Module DSL. The compiler is the only owner that expands
product modules into internal line-style DSL. Low-level DSL is still available
inside the runtime/compiler fallback repair loop, but it is no longer the normal
LLM2 product surface.

For iteration, `ProjectWorld.modules` is the base module truth. A patch such as
adding `shell.game_over_screen` to an existing `core.platformer` project compiles
to a narrow event replacement generated from `ProjectWorld`, not a full replay
of the platformer module.

`configure module` is closed for installed modules. Supported configuration keys
live in each product module manifest under `compiler.configurePatches`; sync
policy fields are metadata-only. This means LLM2 can request a title/button/sync
change at the module level while the compiler owns event lookup, replacement
ordering, module-state updates, and network-manifest updates.

Fixed player interactions are product-module truth, not free-form prompt
knowledge. A configurable label may describe the exposed runtime trigger, but it
must not claim another trigger. LLM2 sees this contract while translating
creative intent into Module DSL; the compiler enforces the same contract before
approval, so bad translations fail at the module boundary instead of becoming
misleading generated projects.

Module-link slots remain internal compiler ownership. If a shell module changes
how a core module fails, the shell module should expose the product capability
and its `compiler.links` entry should fill the core slot. LLM2 should select the
shell module, not hand-edit the core slot value.

Live testing should use `--approval-gate`. It creates a pending approval packet
with Module DSL, compiled internal DSL, module/network state, and a dry-run
preview. The preview is the reviewer contract: it reports whether the patch is
expected to execute, what semantic hash it predicts, and whether the patch is a
cache hit against the current `ProjectWorld`. Only `--approve-pending` mutates
the actual generated project.

### `ai/pipeline.js`

当前主路径，包含：

- DSL 解析
- 事件解析
- 操作执行器
- LLM1 设计稿生成
- LLM2 DSL 翻译
- 迭代状态读写
- CLI 与 `output/` 写入

这是当前可运行路径，但不是长期理想形态。后续应把能力库、DSL 编译器、项目状态和 LLM provider 拆开。

### `ai/project-world.js`

当前状态翻译层，负责：

- 从 GDevelop `project.json` 生成稳定的 `ProjectWorld`。
- 给场景、对象、实例、变量和事件分配稳定 ID。
- 输出语义 hash 和 worldVersion，避免运行时 UUID 造成缓存抖动。
- 追加 `ExecutionLedger`，记录每个 batch、每条 DSL 命令的完成/失败和下一步动作。

`ProjectWorld` 是给 LLM2 循环使用的世界摘要，不是完整 `project.json` 的替代存档。完整 `project.json` 仍然由 GDJS Runtime 消费。

### `ai/capabilities/`

模块能力真相源。能力卡是 LLM 可见能力的唯一来源：

- LLM1 只读取 `llm1Hint` 派生出的轻量摘要。
- LLM2 读取结构化能力卡、DSL 示例、约束和同步标记。
- prompt 不再维护另一份硬编码能力表。

当前已覆盖基础场景、几何对象/文本、平台移动、收集计分、敌人碰撞和简单生成。

### `ai/schema/`

TypeScript 类型和操作定义，适合作为后续工程化真理源。

### `engine/runtime/`

GDJS 浏览器运行时。它只负责执行 `project.json`，不应该理解用户意图或模块选择。

### `platform/`

React/Vite 前端。当前是产品壳和模拟生成流程，尚未真正接入 `ai/pipeline.js`。未来应承载：

- 创建与迭代输入
- 生成进度与 LLM 可见思考摘要
- iframe/运行时试玩
- 版本历史
- 发布与分享
- 联机房间入口

### `templates/`

当前是能力样例数据，不能继续被当作“完整小游戏模板库”对待。长期应演进为模块能力库：

```text
module capability
  -> required objects
  -> required variables
  -> events/actions
  -> compatible modules
  -> runtime constraints
  -> sync constraints
```

## 联机预留边界

联机功能会改变架构重心。需要尽早避免这些错误：

- 把对象移动直接写成不可同步的客户端副作用。
- 让 LLM 随意生成非确定性事件。
- 没有区分本地表现、输入、权威状态和同步状态。
- 把单机 `project.json` 当作唯一项目状态。

后续模块能力库应标注：

- 是否可同步。
- 同步粒度是输入、状态还是事件。
- 是否要求确定性执行。
- 哪些变量是权威状态。
- 哪些对象需要网络 ID。
