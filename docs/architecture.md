# GameCastle 架构设计

## 定性

GameCastle 是模块化游戏工厂，不是一次性小游戏模板生成器。

目标状态是：用户可以持续用自然语言创建、试玩、修改、发布游戏；系统把游戏能力拆成可组合模块，并把每次迭代编译成可运行项目。未来加入联机时，模块库还要覆盖帧同步、状态同步、输入同步、房间会话、断线恢复和权威状态边界。

## 整体数据流

```text
用户意图/迭代请求
  -> 创意层: LLM1 产出高层游戏设计意图和体验变化
  -> 决策上下文: IntentWorldView、语义试玩证据、安全 ProjectWorld 摘要
  -> 意图层: LLM2 生成自然 Intent DSL
  -> 编译层: Intent Graph / Resolver / Bridge 生成内部执行计划
  -> 执行层: Runtime executor 修改 project.json 并记录 ExecutionReport
  -> 状态层: ProjectWorld 翻译稳定世界摘要，ExecutionLedger 追加执行报告
  -> 语义闭环: Semantic Playtest 复测体验指标，失败时生成 Repair Intent 和 Semantic Iteration Memory
  -> 运行层: GDJS Runtime 加载 project.json
  -> 平台层: React 前端承载试玩、迭代、发布和未来联机入口
```

## LLM 分工

### LLM1: 创意与体验设计

LLM1 面向用户意图，温度可以保持 0.7，并保持自由创意表达。

它应该看到的是轻量上下文：

- 用户原始意图或当前迭代请求。
- 当前 CreativeVision。
- 当前创意对话历史。

LLM1 输出自由自然语言 CreativeVision，完整发展体验、玩法、世界、角色、节奏、惊喜、情绪与感官身份。语义契约从 LLM2 开始。

### LLM2: AI-first Intent 决策闭环

LLM2 面向可执行意图落地，但仍停留在自然游戏世界模型。它应该看到：

- LLM1 的高层设计意图。
- 当前 `IntentWorldView`、安全 `ProjectWorld` 摘要、语义试玩证据和上一轮语义迭代记忆。
- 从组件、模块和语义映射派生的自然能力摘要，包括对象、角色、关系、动作、布局意图和体验问题。
- owner-routed diagnostics 暴露的自然修复建议，而不是桥接层、runtime adapter、GDJS、坐标或组件 id。

LLM2 输出闭合的 Intent 槽位包。确定性 renderer 将槽位包转换为自然 Intent DSL。初次生成也视为“从空项目表达自然意图到第一个可玩版本”，连续迭代只映射本轮语义变化。

LLM2 具备受限自循环：首轮输出作为 `apply_intent`；槽位验证失败时，LLM2 根据槽位名称、内容含义和允许值修正槽位包。Intent 编译进入 Resolver/Bridge/Runtime 后，诊断回到对应 owner 层。当前限制最多 2 轮槽位修复，完整保留失败产物与退出状态。

项目模式必须先判定：

- 新项目：默认 live prompt 模式，或显式 `--intent-fixture-file` fixture，重置上一局 generated state，从空项目开始。
- 迭代项目：`--continue`，必须加载完整 Intent iteration state：`output/project.json`、`output/project-world.json` 和含至少一条运行记录的 `output/execution-ledger.json`。`project.json` 是 GDJS 运行产物，不能单独作为 AI 继续迭代入口。

因此 repair loop 的“当前已应用项目”只在同一局游戏内延续；开新项目时不得继承上一局缓存。

Current AI-first override: LLM1 owns unrestricted CreativeVision and LLM2 fills the closed Intent slot packet.
The deterministic renderer owns natural Intent DSL. Slot validation returns declared slot meanings to LLM2; compiled failures route to the owning compiler, placement resolver, bridge, runtime adapter, or executor layer.

### Agent Model Registry

`ai/agent-workflow.js` owns model routing. Pipeline code should call roles, not
hard-code model names:

- `creative`: LLM1 unrestricted creative imagination model, default `deepseek-v4-flash`.
- `intent`: LLM2 semantic recognition and closed slot mapping model, default
  `deepseek-v4-flash`.
- `intentRepair`: LLM2 repair role for AI-first Intent DSL compiler
  diagnostics. It repairs declared Intent slots only and does not see engine
  target code.
- `imageGeneration`: reserved asset generation role, configured by `GAMECASTLE_IMAGE_MODEL`.
- `vision`: reserved visual inspection role, configured by `GAMECASTLE_VISION_MODEL`.

Image and vision roles are intentionally registered before they are wired into
game generation. They should enter through asset/runtime ownership, not by
adding more prompt branches inside `pipeline.js`.

### Multi-Agent Contract

`ai/contracts/schema.json` owns the handoff contract between agents and runtime.
The flow is contract-first:

```text
CreativeImagination
  -> unrestricted CreativeVision
  -> IntentSlotDirector fills declared slots
  -> deterministic renderer writes Intent DSL
  -> IntentCompiler owns BuildContract and compiler facts
  -> ImageAgent only fills repo/cache/variant misses when allowed
  -> ModuleCompiler/Bridge lower Intent into target facts and structured runtime plans
  -> RuntimeLinker binds compiler output + AssetManifest + optional AssetReview
  -> RuntimeValidator checks project truth, cache, assets, HTML export, smoke status
  -> owner-routed diagnostics / repair artifact
```

This boundary keeps AI context small and stable. CreativeImagination receives the user request, prior CreativeVision, and creative conversation, and returns unrestricted natural text.
IntentAgent should see AI-first Intent capability plus sanitized planning context,
not raw `project.json`, bridge/runtime audit internals, or coordinate-shaped
engine fields. Compiler-owned module expansion uses structured runtime
facts behind the Intent path.
RuntimeAssetResolver resolves asset slots declared by the BuildContract by
checking exact cache, cloud repository, semantic/style repository matches,
project reuse, variants/edits, generation, and only then runtime placeholders.
ImageAgent is one supplier behind the resolver, not the owner of asset truth.
RuntimeLinker and RuntimeValidator are deterministic code, not LLM roles, because
they own merge truth, cache truth, GDevelop truth, publishability truth, and
repair routing.

The contract types are complete runtime-facing shapes, not placeholders:

- `BuildContract`: request, world summary, style guide, module intents, asset slots, parallel plan, acceptance, cache policy, repair policy.
- `AssetManifest`: RuntimeAssetResolver output with selected source, asset ids, paths, hashes, dimensions, confidence, publishability, and placeholder debt.
- `AssetReview`: VisionAgent semantic/visual checks over generated assets.
- `AssemblyReport`: RuntimeLinker bindings, outputs, conflicts, and next action.
- `ValidationReport`: RuntimeValidator checks, cache hit, owner-on-failure, and next action.

`npm run check:ai` runs `ai/check-contracts.js`, which verifies the schema,
local `$ref`s, required fields, owner enums, repair/cache fields, and
`agent-workflow.js` contract owner mappings.

`ai/asset-weave-graph.js` is the sole asset runtime entry. It owns the
conditional local/cloud/variant/model path and emits `AssetManifest` only after
Validation and Acceptance; old manifest repository resolvers were removed.

`ai/asset-world.js` is the stable asset-side context. It turns `AssetManifest`
into `AssetWorld`, preserving slot state, placeholder debt, cache hit state, and
cloud promotion candidates. Expensive generated or edited assets that pass
validation should not be wasted as one-off files: if they are repo eligible,
AssetWorld places them into `cloudPromotionQueue` for cloud repository review,
indexing, and future reuse.

视觉资产的产品优先级、条件 LangGraph、模型循环和 owner 边界以
[`visual-asset-loop.md`](visual-asset-loop.md) 与
[`visual-asset-boundaries.md`](visual-asset-boundaries.md) 为准。它规定本地优先、
云端复用第二、确定性变体第三、受控模型编辑第四、全新绘制最后；模型生成和编辑
必须经过 Vision 审查与有界 repair loop。

自动化验证由 `npm run test:ai` 覆盖。它不调用 LLM，而是用 Intent fixture 和结构化 runtime tests 验证 new/continue 状态边界、失败报告、repair batch、缓存命中和 15 秒子进程超时防护。

## 当前模块边界

### Product Module Compiler

The product composition layer is `ai/product-modules/` plus
`ai/module-compiler.js`.

LLM1 should select from product-level module cards and should not memorize
template internals. LLM2 selects gameplay through Intent DSL; compiler owners
choose module ids and expand them into runtime facts.

The compiler expands those modules into an internal target execution plan,
then the runtime executor applies it to `project.json`. Installed modules are recorded
in `ProjectWorld.modules`; future networking metadata is recorded in
`output/tick-runtime-manifest.json`.

Product modules also declare `repositoryPolicy`. The module repository is the
gameplay-side equivalent of the asset repository: prefer reuse, and if an
expensive generated module variant becomes useful, promote it back as a
`cloudModuleRepo` candidate rather than leaving it as a one-off template.

This keeps the product skeleton coarse: a platformer core plus shells is exposed
as product composition, while player objects, collision events, text objects,
and fail-scene wiring stay inside runtime/compiler ownership.

The compiler remains the only owner that expands product modules into the internal
target execution plan. Target instructions are code for compiler/bridge/runtime owners,
not an Intent-path LLM2 repair language.

For iteration, `ProjectWorld.modules` is the base module truth. A configuration change such as
adding `shell.game_over_screen` to an existing `core.platformer` project compiles
to a narrow event replacement generated from `ProjectWorld`, not a full replay
of the platformer module.

`configure module` is closed for installed modules. Supported configuration keys
live in each product module manifest under `compiler.configureUpdateTemplates`; sync
policy fields are metadata-only. In the live Intent path, LLM2 asks for natural
product changes such as changing a start button label or making the session
host-authoritative; the compiler decides whether that maps to a module
configuration update and owns event lookup, replacement ordering, module-state
updates, and network-manifest updates.

Fixed player interactions are product-module truth, not free-form prompt
knowledge. A configurable label may describe the exposed runtime trigger, but it
must not claim another trigger. LLM2 should see this contract while translating
creative intent into declared slots; the compiler enforces the same contract before
approval, so bad translations fail at the module/component boundary instead of
becoming misleading generated projects.

Module-link slots remain internal compiler ownership. If a shell module changes
how a core module fails, the shell module should expose the product capability
and its `compiler.links` entry should fill the core slot. LLM2 should select the
shell module, not hand-edit the core slot value.

Live testing should use `--approval-gate`. It creates a pending approval packet
with Intent DSL, typed Intent Graph, Placement Plan, Bridge Plan, Compile
ResultCard, aggregate Intent compile contract summary, compiled internal target
plan, runtime adapter requirements, module/network state, and a dry-run preview. The
preview is the reviewer contract: it reports every command result, whether the
Intent artifact is expected to execute, what semantic hash it predicts, and
whether the artifact is a cache hit against the current `ProjectWorld`. Only
`--approve-pending` mutates the actual generated project. The full packet is a
human/runtime audit artifact and may contain Bridge Plan, internal target plan, runtime
adapter requirements, and command results. Any LLM or agent review must use
`aiVisibleForLlm2`, which is derived from the PipelineState LLM2 node input plus
safe counts/status only.

### AI-first Intent Layer

The live LLM2 product surface is the AI-first Intent DSL. The goal is to lower
AI and user cognition by making LLM2 describe game-world intent instead of
engine details.

The new canonical chain is:

```text
LLM2 Intent DSL
  -> typed Intent Graph
  -> Edit Constraint Graph
  -> Module + Component graph
  -> Semantic Placement plan
  -> GDJS Bridge plan
  -> internal target execution plan
  -> project.json + code*.js + runtime adapters
  -> GDJS Runtime
```

CreativeImagination executes as a pre-graph stage in `ai/creative-agent.js`; its real reads are user request, creative history, and previous CreativeVision. The canonical graph begins at the closed LLM2 handoff. The downstream chain is represented by a graph-ready state contract in
`ai/pipeline-state.js` and an official LangGraph runtime adapter in
`ai/langgraph-runtime.js`. The contract names the orchestration slots:
`userRequest`, `creative`, `llm2`, `intentGraph`, `resolver`, `compiler`,
`bridge`, `runtime`, `projectWorld`, `diagnostics`, and `ownerRoute`.
Internal slots may keep Bridge Plan, runtime adapter requirements, and execution
reports for audit. The LLM2 slot only receives the ProjectWorld-owned sanitized
node input: sanitized user request, sanitized CreativeVision, sanitized creative change, and
the sanitized world context. Future LangGraph nodes should read
`pipelineState.llm2.nodeInput`, not raw creative history or
`projectWorld.world`. This prevents coordinates, component ids, adapter ids,
Bridge Plan details, and target-plan instructions from flowing back into Intent generation.
`ai/pipeline-state.js` also exports machine-checkable node contracts. The
`llm2-intent` contract only allows reads from `llm2.nodeInput` and writes to the
Intent slot packet fields; tests fail if it tries to read raw creative history, raw
ProjectWorld, Bridge Plan, runtime report, or internal target-plan fields.
Each saved `PipelineState` also carries a `nodeContracts` snapshot so external
or LangGraph runners can audit the same read/write boundary from the
state file itself instead of relying on prose. Runners should build node inputs
through `makeNodeStateView(state, nodeName)`, which validates the state and
returns only the paths allowed by the node contract; the `llm2-intent` view
contains `llm2.nodeInput` and excludes raw creative history, raw ProjectWorld,
Bridge, Runtime, and target-plan state. Node outputs should be merged through
`applyNodeStateUpdate(state, nodeName, update)`, which accepts only contract-owned
write paths and rejects LLM2 attempts to write raw creative state, bridge, runtime,
or ProjectWorld fields. The same view/update mechanism is used for the compiler,
resolver, bridge, and runtime contracts.
`PipelineState` is Intent-only: it rejects untyped, internal, or operation-artifact
state before graph execution or approval can persist it.

`ai/intent-pipeline-graph.js` is the canonical graph entry for the AI-first
pipeline. It defines the single owner order:
`llm2-intent -> intent-compiler -> resolver -> bridge -> runtime`. It turns a
handler map into contract-bound local steps or contract-bound LangGraph nodes,
rejects missing or undeclared nodes, and runs graph nodes in `allowPartial` mode
while requiring strict `PipelineState` validation at the completed boundary. It
also owns artifact replay assembly through `makePipelineStateFromArtifacts`:
when the CLI path has already produced Intent DSL, Intent Graph, Placement Plan,
Bridge Plan, ExecutionReport, and ProjectWorld, the graph entry replays those
owner artifacts through the same five contract-bound nodes. By default this
replay now invokes the official `@langchain/langgraph` `StateGraph`; the local
runner remains available through an explicit fallback option. The resulting
state attaches `graphTrace`.
`ai/pipeline-graph-runner.js` remains the dependency-free local runner for fast
contract tests: it gives each node only `makeNodeStateView` output, applies only
`applyNodeStateUpdate` output, supports async handlers, and records read/write
trace evidence. `ai/langgraph-adapter.js` is the node boundary used by both the
local runner shape tests and official LangGraph: it wraps a PipelineState in a
`pipelineState` channel, gives each node only the contracted view, requires a
path-object state update from the node, merges it through `applyNodeStateUpdate`, and
returns an updated `pipelineState` plus trace evidence. `ai/langgraph-runtime.js`
loads `@langchain/langgraph`, defines the `PipelineState` and `graphTrace`
channels, compiles the canonical owner sequence into a `StateGraph`, and invokes
it without giving any node extra state access. A LangGraph node should therefore
implement only the node's domain work; it must not receive the full PipelineState,
raw ProjectWorld, Bridge Plan, runtime report, or internal target plan unless its node
contract explicitly allows that read.
Approval preview packets include this state, and real Intent execution now asks
the canonical graph entry to assemble the persisted post-runtime state. The
saved `output/pipeline-state.json` carries `graphTrace` evidence for the five
owner nodes after `ProjectWorld` and `ExecutionReport` are written.

### Project Weave Graph

The whole-project orchestration name is **Project Weave Graph** (`项目联排图`).
It is the graph above the World Intent Layer. The current official LangGraph
runtime already executes the embedded World Intent Layer; the remaining project
owners are declared as contract-ready nodes without inventing new prompt surfaces
or widening LLM2 access.

`ai/project-pipeline-graph.js` owns the total graph specification:

```text
CreativeImagination pre-graph: user request + creative history + previous CreativeVision -> CreativeVision

Project Weave Graph:
llm2-intent
  -> intent-compiler
  -> resolver
  -> asset-library
  -> image-generation
  -> asset-review
  -> asset-resolver
  -> asset-world
  -> bridge
  -> runtime-linker
  -> tick-runtime
  -> server-runtime
  -> html-export
  -> runtime
  -> runtime-validator
  -> project-world
  -> tick-playtest
  -> semantic-feedback
```

Layer names:

- `World Intent Layer`: closed Intent slot packet, deterministic Intent DSL, Intent Graph, resolver, bridge plan.
- `Asset Weave Layer`: asset library lookup, image generation, asset review, slot resolution, reuse/generation debt, AssetWorld.
- `Runtime Assembly Layer`: asset/bridge binding, tick runtime codegen, runtime files, HTML export, execution.
- `Server Weave Layer`: signaling server, rooms, ordered input, game loop, and state store.
- `Validation Layer`: fulfillment, asset debt, export health, owner routing.
- `World Summary Layer`: ProjectWorld, ledger feedback, Tick playtest evidence, semantic probe feedback, and repair Intent for the next turn.

`llm2-intent` remains intentionally narrow in the total graph: it reads only
`llm2.nodeInput`. It must not read raw `AssetManifest`, raw `AssetWorld`, Bridge
Plan, runtime report, or internal target plan. Resource and assembly details flow
downstream through owned runtime nodes and only return to models through
sanitized world summaries.

Official LangGraph smoke coverage now exists for the following currently wired or smoke-wired paths:

资产路径是条件子图，不是固定的 `asset-library -> image-generation -> asset-review`
线性链。其完整状态、循环上限和读写边界见
[`visual-asset-loop.md`](visual-asset-loop.md)。`project-pipeline-graph.js` 以单一
`asset-weave` 节点表示该子图，并由图契约测试验证其边界。

目标覆盖为：

- `asset-intake -> asset-resolver -> conditional local/cloud/variant/model path -> asset-manifest -> asset-world`

该条件图由 `check:visual-assets` 覆盖；旧的两份局部 asset smoke 已删除，不能恢复为
独立执行路径。
- `tick-runtime -> server-runtime`
- `runtime-linker -> html-export -> runtime-validator -> project-world -> tick-playtest -> semantic-feedback`

Every Project Weave Graph owner outside the live World Intent path has at least
one official `StateGraph` smoke. Live nodes are listed under `wired-langgraph`;
covered non-live owners are listed under `wired-langgraph-smoke`.

The Intent surface owns low-cognition concepts:

- `thing`: Player, JumpButton, Inventory, CoinTrail.
- `component`: virtual joystick, jump button, attack button, inventory,
  health bar.
- `relation`: controls, owns, opens, damages, collects, near.
- `placement`: near, direction, distance, pattern, count.
- `edit`: semantic changes to existing world facts, such as "placement above slightly".
- `action`: move, jump, attack, shoot, open inventory.

Intent DSL is only the input layer. The system model is a typed Intent Graph
containing things, components, relations, placements, edit constraints, semantic
values, bindings, requirements, and diagnostics.

LLM2 should write lines such as:

```text
make a mobile platformer
give Player platformer movement
add joystick controls Player near screen bottom-left
add jump button controls Player near screen bottom-right
add inventory owned by Player with 24 slots near screen right
adjust Fox placement above slightly
place coins near Player front as trail count 8
```

LLM2 must not write coordinates, event indexes, GDJS instruction names, or raw
`project.json` edits as the normal product path. It also must not write
module ids, component ids, runtime adapter names, or `key=value` machine fields
as the normal product path; the compiler owns those selections.

Product modules remain as compiler truth and reusable skeletons, and LLM2 selects
them through Intent DSL.
Internal target plan remains target code for the bridge and runtime executor, not
an Intent-path LLM2 repair surface.

Reusable controls and systems live in `ai/components/`. Each component has an
AI Manifest for natural LLM2-facing concepts and a Compiler Manifest for
internal component ids, defaults, inherited requirements, input bindings,
placement policy, and GDJS adapter requirements. The compiler resolves natural
phrases such as joystick, jump button, attack button, backpack, and platformer
movement through `ai/component-catalog.js`.
Compiler manifests may inherit from abstract compiler-only parents with
`extends`; the value may be one parent id or an ordered array of parents. For
example, `input.jump_button` and `input.attack_button` inherit touch-button
defaults, binding, and runtime adapter ownership from `input.touch_button`.
`system.inventory` composes `system.storage` and `ui.panel`, so slots,
persistence, panel shape, panel size, and inventory runtime adapters stay below
the Intent surface. Abstract parents are filtered out of LLM2 component cards.
This keeps the AI-facing surface at "jump button", "attack button", or
"inventory with 24 slots" while common mechanics stay in component family
contracts.
Runtime-facing details such as fallback keyboard keys, button labels, panel
titles, runtime control sizes, and bridge config expansions are sealed component
defaults. Runtime adapters consume the inherited config emitted by the bridge;
they must not infer behavior from component ids.
Runtime adapter route metadata is also component-manifest truth: each
`gdjsBridge.runtimeAdapters` entry must have an `adapterRoutes` entry carrying
owner, mechanism, route id, route owner, and route mechanism. The GDJS bridge
copies this metadata into runtime adapter requirements instead of branching on
adapter ids.
`ai/runtime-adapter-requirement-contract.js` then enforces adapter-specific
config completeness: touch buttons must carry keys and labels, joystick
adapters must carry input names, and inventory adapters must carry slots,
persistence, panel title, and panel dimensions. Missing runtime config is a
component/manifest error, not something the runtime code generator may infer
from actions or adapter ids.
GDJS object emission is manifest-owned as well. `gdjsBridge.objectSpec` declares
the target object type plus object, layer, and placement emission route
evidence, while inherited `defaultConfig` supplies shape, color, size, and
layer. The bridge may assemble target instructions from those facts, but it must not
invent `ShapePainter`, colors, layers, or component placement route evidence on
its own.
When `defaultConfig` exists, the Compiler Manifest must also declare an
`inheritance` contract. `exposedOverrides` names the small set of natural values
that Intent AST may override, such as inventory slot count or an explicit
control action. `sealedDefaults` names internal defaults such as dead zones,
cooldowns, persistence mode, and UI mode. The ResultCard records inherited
defaults as `autoAdded` evidence and natural overrides as `overrides`, keeping
the Intent DSL coarse while still making the lowering trace auditable.

Rewrites are also contracted. `ai/intent-rewrite-contract.js` validates that
each `ResultCard.rewrites` entry carries `from`, `to`, `owner`, `mechanism`,
and `stage`. Module inference, component aliases, natural anchor normalization,
and semantic group creation are internal lowering steps, not new LLM2-facing
syntax.
The Intent compiler runs this contract before returning a compiled artifact, so
malformed rewrite evidence fails at the owner boundary instead of becoming a
quiet ResultCard drift.

The full compiled artifact is checked by `ai/intent-compile-contract.js` before
`ai/intent-compiler.js` returns. This aggregate contract verifies the Intent
Graph, edit constraints, ResultCard fields, routed diagnostics, rewrite
evidence, Placement Plan, Bridge Plan emission evidence, and runtime adapter
requirements together. A compiled Intent artifact is therefore not considered valid
unless the whole Intent -> Edit/Placement -> Bridge -> Runtime chain is
contract-complete.
The compiler attaches this aggregate contract summary to the compiled artifact;
the approval packet, `ProjectWorld`, and `ExecutionReport` persist it as
`intentContracts`/`intent.contracts`, so reviewers can audit the whole lowering
chain without reading GDJS target details.

The first GDJS bridge owner is `ai/gdjs-bridge.js`. It turns the Intent Graph,
component compiler manifests, and Placement Plan into a Bridge Plan containing
internal target plan plus runtime adapter requirements. If a target detail is
not expressible by the current GDJS target plan, the bridge routes it as an
owned adapter requirement or diagnostic instead of expanding the LLM2 surface.
`ai/intent-runtime-codegen.js` then generates `intent-runtime.js` for the HTML
export, attaching mobile controls and inventory UI through
`GameCastleIntentRuntime` after the GDJS `RuntimeGame` is created.
Bridge target emission is contracted by `ai/gdjs-bridge-emission-contract.js`:
each internal target line carries `owner`, `source`, and `mechanism`, with optional
`routeId` and `routeMechanism` evidence. This makes component object expansion,
component placement rewrites, inventory config expansion, semantic group
placement, and product module expansion auditable without exposing GDJS target
syntax to LLM2.
Runtime adapter requirements are contracted separately by
`ai/runtime-adapter-requirement-contract.js`. Each adapter requirement carries
the runtime owner, source component, mechanism, route id, and route mechanism.
Touch multi-pointer state, button input, inventory storage, and inventory panel
behavior stay in the runtime adapter layer; LLM2 must not name adapter ids or
runtime config fields.
`ai/gdjs-bridge.js` runs the bridge emission and runtime adapter contracts before
returning a Bridge Plan, and records `contracts.emission` and
`contracts.runtimeAdapters` in the plan for ProjectWorld auditing.

Full details live in
[AI-first Intent Runtime Bridge](./ai-first-intent-runtime-bridge.md).

The compiler is multi-stage: parse, normalize, resolve symbols, build Intent
Graph, validate requirements, fill defaults, resolve placement, expand
components, emit the target plan, and apply through the GDJS bridge. Each compile
must produce a ResultCard showing input, resolved symbols, auto-added defaults,
placement decisions, emitted target code, warnings, and owner trace.

Placement resolution is owned by `ai/placement-resolver.js` and contracted by
`ai/placement-resolution-contract.js`. Each resolved placement keeps the
human-facing `near/direction/pattern` source, the concrete resolved point for
the target runtime, and `routeEvidence` showing whether it came from safe-area
placement, UI overlap avoidance, object-relative placement, contextual
direction rewrite, or semantic pattern placement. The placement resolver runs
this contract before returning a Placement Plan. Pattern placements also carry
`emission` metadata, so bridge lines for trails, lines, stairs, and guards
inherit semantic placement evidence instead of receiving bridge-invented route
labels.

Small relative edits are owned by the same resolver through
`ai/edit-constraint-contract.js`. LLM2 may say `adjust Fox placement above
slightly`; the Intent Graph stores an `editConstraint` with semantic direction
and amount, while the resolver reads current bounds from placement context or
`ProjectWorld` and plans the concrete target point. The bridge emits the final
internal target plan with `semantic-placement-edit-rewrite` evidence. LLM2 never
chooses `dy`, exact coordinates, or GDJS move parameters.

Intent DSL must not grow without a gate. When GDJS integration exposes a hard
case, the first answer is owner classification: symbol rewrite, inherited
default, component manifest, placement contract, bridge target rewrite, or
owner-routed diagnostic. A new LLM2-facing concept is allowed only when it names
a reusable game-world concept that cannot be expressed by existing
thing/component/relation/placement/edit/value/role/action concepts.

The machine-checkable routing gate is `ai/intent-routing-rules.json`, validated
by `ai/check-intent-routing-rules.js` in `npm run check:ai`. Parser and bridge
implementations should reuse `ai/intent-surface-guard.js` for prohibited
surface detection and bridge issue route lookup. `ai/intent-growth-control.js`
adds the evidence gate: current bridge issue fixtures must prove the owner and
mechanism through the compiled Intent Graph, Placement Plan, Bridge Plan, and
ResultCard instead of admitting new LLM2-facing machine syntax.
Diagnostics use the same contract through `ai/intent-diagnostic-router.js`:
when a compiler, placement, or bridge failure is emitted, it carries `routeId`,
`routeOwner`, `routeMechanism`, and `nextAction`. Only diagnostics owned by
`llm2-intent` may ask LLM2 to change Intent DSL; system-owner diagnostics route
back to the component catalog, placement resolver, bridge, runtime adapter, or
other owning layer.
`ai/intent-agent.js` enforces this at the Intent compile repair boundary: parser or
surface-form errors may be repaired by LLM2, but compiled diagnostics with
`nextAction=route-to-owner` fail fast and preserve the owner-routed diagnostic
instead of entering the LLM2 repair loop.
`ai/pipeline.js` enforces the same boundary after execution: if an Intent artifact
has already compiled to bridge/internal target instructions and runtime execution fails, the
pipeline records the `ExecutionReport`, returns a failure status, and does not
ask LLM2 to write internal target repair lines.
Runtime validation also records minimum Intent fulfillment evidence in
`ExecutionReport`. Command success is not the only done signal: the report checks
that Intent Graph things, component subjects, placements, and semantic edits are
represented by the resulting `ProjectWorld` or by the resolved placement/edit
plan for semantic groups. The detailed audit lives in
`ExecutionReport.intentFulfillment`; the LLM2-safe summary carries only
status/counts/nextAction. Missing fulfillment routes to `runtime-validator`
through PipelineState owner routing instead of asking LLM2 to write target code.
`ai/check-ai-visible-boundary.js` is the unified boundary gate for LLM2-visible
surfaces. It exercises system prompts, user prompts, Intent repair prompts,
ProjectWorld/ExecutionReport sanitizers, PipelineState `llm2.nodeInput`,
contract-bound graph views, and approval `aiVisibleForLlm2` projections with
dangerous coordinate/GDJS/adapter/component-id/Bridge/internal-target payloads.

`ai/semantic-mapping/semantic-feedback.json` is the truth source for semantic
feedback mapping: subject aliases, issue profiles, repair verbs, internal
Intent-line strategies, and subject defaults live there instead of inside case
code.
`ai/semantic-feedback.js` owns probe-feedback-to-repair translation after
`ProjectWorld`. It consumes sanitized world context, the last execution report,
structured probe issues, and the semantic mapping dictionary. The generic form
is a probe issue with `repairVerb` plus semantic repair parameters such as
subject, anchor, direction, pattern, count delta, or amount; game cases such as
a parkour fixture are tests of that form, not code branches. The output is only
safe Intent DSL repair text, for example `place coins near Player front as
trail count 5` or `adjust JumpButton placement above slightly`. Internal target
DSL, coordinates, component ids, adapter ids, bridge plans, and GDJS names stay
inside their owner layers.
The same dictionary also produces an LLM-safe view through
`buildSemanticMappingLlmView()`. Intent Commander prompts, PipelineState
`llm2.nodeInput.worldContext`, and semantic feedback reports read this view, so
Probe repair, LLM iteration, and ProjectWorld回译 share one semantic
explanation source without exposing internal templates.

`ai/semantic-playtest-agent.js` is the product-facing playtest owner after
`ProjectWorld`. It builds a generic `PlayPolicy` from the sanitized
`ProjectWorld` and the LLM-safe semantic mapping view, runs the local Tick
pseudo-runner, writes user/LLM feedback layers, and emits executable repair
Intent DSL. `ai/tick-playtest-runtime.js` stays underneath it as the deterministic
Tick execution owner. Its input is a `PlayPolicy` built from semantic roles such
as player, collectible, threat, and control. Every sampled gameplay change happens
on a tick:

```text
PlayPolicy
  -> Tick intents
  -> EventLog
  -> Snapshot
  -> tick evidence issue
  -> SemanticFeedback repair Intent
```

The runtime records events such as `ActorIntent`, `RewardReached`,
`RewardMissed`, and `PressureDetected`, plus snapshots with aggregate
metrics. Semantic Playtest Agent turns those facts into:

- `semantic-playtest-llm-report.json`: structured tick summary, tick issues,
  evidence, and repair Intent lines for the next LLM turn.
- `semantic-playtest-user-report.json`: short human-facing playtest summary and
  suggested intent lines.
- `intent-world-view.json`: gameplay-first LLM2 decision context. It maps the
  single scene into gameplay roles, tick evidence, current judgement, context
  cache/diff state, semantic repair candidates, and allowed context requests.
- `semantic-playtest-repair.intent.dsl`: executable repair Intent, generated but
  not automatically applied.

Semantic feedback consumes tick issues exactly like external probe issues,
preserving evidence such as the failing tick and metric before it renders safe
repair Intent DSL. This makes single-player preview, replay, automated play
analysis, and future ordered-input multiplayer share the same runtime worldview:
Intent drives ticks, ticks drive state, state produces events, and events
summarize back into the world.

IntentWorldView is deliberately not an oracle. Its semantic repair recommendations are
candidate hypotheses from semantic evidence; LLM2 remains the final decision
owner. When the semantic hash matches the previous world, the view asks LLM2 to
use `diff-only` context. When it misses, it uses `summary-plus-diff`. LLM2 may
request focused tick event windows, snapshot summaries, ProjectWorld diffs,
semantic mapping, or UI template policy before choosing, revising, or ignoring a
semantic repair candidate. UI and icon choices are treated as selectable style/layout
templates unless input access or feedback visibility is the actual gameplay
problem.

`ai/llm2-context-cache-router.js` sits between IntentWorldView and real LLM2
calls. Its owner boundary is context cost and cache shape, not gameplay truth.
For DeepSeek it assumes a text KV prefix cache: stable prompt prefix order and
content matter, while asset cache, image cache, and multimodal cache hits are
not interchangeable with this route. The router chooses:

- `diff_hit`: semantic hash unchanged or same-scene gameplay iteration.
- `full_hit`: stable prefix exists and the model needs broader context, such as
  after two wrong turns.
- `recommended_pack`: narrow candidate pack plus context request capability for
  focused issues such as enemy density.
- `full_miss`: new project, no base semantic hash, or repeated failures without
  a trusted stable prefix.

This makes "smallest context" a fallback, not the default. If the stable prefix
can hit, a larger cached prefix plus small dynamic diff can be cheaper and safer
than a tiny but constantly missing prompt.

`ai/llm2-decision-runtime.js` is the decision owner after routing. It separates
"what context should the model see" from "what decision may the model make". The
only valid decisions are:

- `apply_intent`: produce safe Intent DSL.
- `request_context`: ask for focused context before editing.
- `no_op`: leave the current gameplay unchanged.
- `reject`: reject unsafe or out-of-scope requests.

The runtime currently uses a deterministic Mock decision engine so the skeleton
can be verified before real DeepSeek calls. Its verifier rejects machine
surfaces, coordinates, bridge/runtime internals, and any non-apply decision that
tries to emit Intent DSL. Recommended actions from IntentWorldView are therefore
candidate evidence, not final authority.

`ai/llm2-context-provider.js` closes the model's `request_context` loop. It
returns LLM-safe focused evidence for `tick_event_window`, `project_world_diff`,
`snapshot_summary`, and `ui_template_policy`. This lets LLM2 ask for more
evidence without receiving raw engine data. A threat-density turn can now run as
`recommended_pack -> request_context(tick_event_window) -> provider summary ->
apply_intent`, instead of guessing from the initial candidate pack.

`ai/llm2-decision-loop-runner.js` is the runtime bus that makes the whole LLM2
turn replayable. It owns the sequence:

```text
IntentWorldView
  -> Context Cache Router
  -> Decision Runtime
  -> Context Provider when request_context
  -> Decision Runtime second pass
  -> Intent DSL artifact when apply_intent
  -> pipeline --continue
  -> Semantic Playtest writeback
  -> Semantic Iteration Memory
  -> Decision Loop report
```

The runner is the future real-LLM insertion point. DeepSeek should replace the
decision engine behind the Decision Runtime contract, not own routing,
context-provision, verification, pipeline execution, or report generation.

After an executed gameplay Intent, the runner compares before/after Tick
summaries using the semantic mapping and writes
`output/semantic-iteration-memory.json`. The memory is bound to the after-world
semantic hash, so only a matching next `IntentWorldView` receives
`semanticIterationMemory`. This is the continuous-remix bridge: LLM2 can see
that a prior turn improved `reward_reachability`, still left
`route_readability` work, or should keep the improved feel, without reading raw
coordinates, component ids, GDJS, adapter ids, bridge plans, or full logs.
The comparison always includes semantic improvement guard measurements from the
mapping, so an Intent that improves the requested issue but regresses survival,
pressure, or reward reachability is marked as needing another iteration instead
of being accepted as a successful turn.
The router carries this memory in the dynamic tail for cache discipline, and
Decision Runtime scores semantic repair candidates against current request hints,
remaining semantic issues, and already improved dimensions.

`ai/llm2-semantic-eval-loop.js` is the batch benchmark layer above that bus. It
does not add another model role. It repeatedly feeds natural creation and
feedback turns into the Decision Loop Runner, records the selected cache route,
captures `request_context` evidence from the Context Provider, optionally
executes safe Intent DSL through `pipeline --continue`, and writes transcript
artifacts for replay and audit.

The default eval set covers the product-critical cases:

- gameplay expansion: `金币多一点` produces `apply_intent` and runs the pipeline.
- evidence-first feedback: `怪别太密` first requests a tick event window, then
  applies a pressure-reduction Intent.
- semantic repair from tick evidence: `玩家死太快` applies a safer early-route
  Intent from death evidence.
- UI/template boundary: pure button/icon styling requests are rejected as
  non-gameplay Intent changes.
- stable review: `再看一下` produces `no_op` when current evidence is acceptable.

The eval outputs are:

- `output/llm2-semantic-eval-report.json`
- `output/llm2-semantic-eval-summary.txt`
- `output/llm2-semantic-eval-transcripts/*.json`

This is the guard before real LLM2 debugging: replacing the deterministic
decision engine with DeepSeek should not change the runtime-owned eval contract,
transcript shape, context-provider evidence, or apply/no-op/reject audit rules.

`ai/deepseek-cache-monitor.js` is the real DeepSeek observation gate for this
context strategy. Router modes such as `diff_hit`, `full_hit`, and
`recommended_pack` are only expected cache behavior; they are not proof. The
monitor calls the local Responses bridge, listens to `response.completed.usage`,
and requires hot turns to prove at least 90% text KV cache hit rate from
provider usage fields:

```text
stable LLM2 Intent prefix
  -> warmup request
  -> changed dynamic user turns
  -> DeepSeek usage
  -> prompt_cache_hit_tokens / prompt_cache_miss_tokens
  -> 90% gate
```

If usage is missing, or a hot step falls below 90%, the debug run fails. This
keeps context optimization evidence-based: the system must observe whether the
stable prefix actually hits instead of trusting the local prompt assembly.

The real DeepSeek decision provider uses slot prompts rather than free-form
examples. Its stable prompt names the output slots, while the dynamic prompt
passes local proof slots:

All text-model owners use `ai/responses-client.js` for only the Responses HTTP
transport and SSE decoding. It receives an already-built `input` array and does
not retain, merge, cache, or inspect LLM1 CreativeVision history, LLM2 semantic
context, or LangGraph state. Prompt construction remains owned by the caller.

```text
slot:user_request
slot:local_semantic_interpretation
slot:semantic_hints
slot:candidate_safe_actions
slot:local_proof
slot:allowed_requested_context_ids
slot:required_output
```

The proof vocabulary is deliberately small: `candidate_matched`,
`evidence_gap`, `stable_current_state`, and `template_policy`. If local runtime
evidence proves `candidate_matched`, the provider selects the proven safe Intent
DSL and records the model's raw decision type as audit evidence. Command-line
DeepSeek probes should pass request slots such as `REQUEST_SLOT:more_collectibles`
instead of raw natural-language examples, because shell encoding drift can
corrupt user text before the model sees it.

`LLM2DecisionLoopRunner` can now run the same loop with
`decisionProvider=deepseek`. In that mode each decision pass records
`decisionProviderTrace`, including raw model text, provider usage, proof slots,
verifier result, and cache gate result. `LLM2SemanticEvalLoop` has an async
real-provider path for batch eval. The debug command
`npm run debug:llm2-deepseek-loop` runs a slot-based `execute=false` batch through
the real provider: more collectibles, enemy density, early death, UI template,
stable no-op, route readability, content density, phase feedback, runner remix,
and survivor remix. It observes model behavior and cache hit rate without
mutating the current project. The command performs a warmup pass followed by a
hot pass; the hot pass owns the 90% gate. Both passes write transcripts so cache
behavior, raw model text, proof slots, verifier output, and final decision can
be audited step by step.

### `ai/pipeline.js`

当前编排层，负责项目模式判定、状态读写、target plan 执行、approval gate、repair loop 编排和 `output/` 写入。

Agent/model 内容不应继续堆在这里：

- `ai/llm-provider.js` owns Responses/SSE text model calls.
- `ai/creative-agent.js` owns unrestricted LLM1 CreativeVision generation.
- `ai/intent-agent.js` owns LLM2 slot prompts and slot compile
  repair.
- `ai/agent-workflow.js` owns role/model routing.

后续接入生图/识图时，应继续通过 Agent/contract 边界接入，而不是把 prompt 分支加回 `pipeline.js`。

### `ai/project-world.js`

当前状态翻译层，负责：

- 从 GDevelop `project.json` 生成稳定的 `ProjectWorld`。
- 给场景、对象、实例、变量和事件分配稳定 ID。
- 继承 AI-first Intent 摘要：Intent DSL、typed Intent Graph、Edit Constraints、aggregate compile contract、Placement Plan、Bridge Plan、Compile ResultCard owner trace、runtime adapter requirements。
- 输出语义 hash 和 worldVersion，避免运行时 UUID 造成缓存抖动。
- 追加 `ExecutionLedger`，记录每个 batch、每条 target plan 指令的完成/失败和下一步动作。

`ProjectWorld` 是给 LLM2 循环使用的世界摘要，不是完整 `project.json` 的替代存档。完整 `project.json` 仍然由 GDJS Runtime 消费。
Intent 摘要中的原始自然语言行用于审计，不参与 `semanticHash`；hash 使用结构化 Intent/Bridge 摘要，避免同义改写造成状态抖动。
`ProjectWorld.intent` may retain internal audit facts such as component ids,
bridge route evidence, and runtime adapter summaries for verification. Those
facts must not be passed directly to LLM2. `ai/project-world.js` owns the
AI-visible projection through `sanitizeProjectWorldForIntentPrompt` and
`sanitizeExecutionReportForIntentPrompt`; `ai/intent-agent.js` consumes that
projection when building Intent Commander prompts. The projection preserves
object names, natural placements, semantic edit facts, and prior safe Intent
lines while dropping coordinates, bridge plans, runtime adapter ids, GDJS object
types, target execution commands, and internal contract names. Intent repair
prompts use the same boundary: if the previous Intent DSL contained prohibited
machine syntax, the exact line is omitted and LLM2 repairs from the user
request, sanitized CreativeVision, sanitized world card, and natural rules instead of
copying the bad machine shape.
CreativeVision and creative changes remain natural text at the contract boundary. Intent prompts project that text into a safe semantic view before LLM2 fills declared slots. LLM2 receives game-world changes and slot meanings; deterministic owners supply engine facts.

### `ai/product-modules/` and `ai/capabilities.js`

模块能力真相源。Product module manifest owns compiler/runtime facts, while
capability cards derive LLM-safe ability summaries:

- LLM1 只读取 `llm1Hint` 派生出的轻量摘要。
- LLM2 读取 Slot Director 派生出的自然能力摘要、角色/动作/关系和安全 repair 候选，只填写已声明槽位。
- Capability cards must not carry target examples or internal compiler prompt context.
- 内部目标模板留在 product module `compiler` manifest 内部，不作为 live LLM2 产品面。
- prompt 不再维护另一份硬编码能力表。

当前已覆盖：平台跳跃核心（含移动、收集计分、敌人碰撞、场景、几何对象）、计分系统、开始界面、结束界面。能力卡片从 product-modules 自动派生，不单独维护。

### `ai/gdevelop-truth/`

`runtime-truth.json` is extracted from `C:\Ai\GDevelop-master` and is the canonical
GDevelop/GDJS runtime truth snapshot for the supported surface. It owns official
object types, behavior types, include files, runtime registration sources,
instruction function mappings, and object/behavior data fields.

`ai/gdevelop-truth.js` is the only code entry point for these facts. Pipeline
Intent DSL may stay AI-friendly, but emitted `project.json` and HTML manifests must
validate against this snapshot and fail fast on unsupported GDevelop names.

### `engine/runtime/`

GDJS 浏览器运行时。它只负责执行 `project.json`，不应该理解用户意图或模块选择。

### `platform/`

React/Vite 前端只消费 Local Game Runtime 的 HTTP/SSE 契约。当前产品主链已经接入真实 `ai/pipeline.js`，负责创建与继续迭代输入、权威运行状态、失败展示和不可变 release 的 iframe 试玩。它不读取 `output/`、不启动子进程、不解析日志，也不拥有引擎成功判定。

`server/local-runtime/` 是唯一运行边界：单 active project、忙时拒绝、工作区事务、完整进程树生命周期、HTML manifest allowlist、不可变 release 提交和独立试玩 origin。详细契约见 `docs/local-game-runtime.md`。

### `templates/`

当前是能力样例数据，不能继续被当作“完整小游戏模板库”对待。长期应演进为模块能力库：

```text
module capability
  -> required objects
  -> required variables
  -> events/actions
  -> matching modules
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
