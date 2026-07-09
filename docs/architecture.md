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
- 从 ai/product-modules/ 中 capability 卡片派生的轻量能力提示，例如“支持平台跳跃/射击/收集/敌人/Boss/联机雏形”，但不是完整模板或 DSL schema。
- 少量设计边界，例如画布大小、目标是可玩、后续可迭代、未来会有同步约束。

LLM1 输出的是高层设计意图：想要什么体验、加入什么玩法、哪里变难、哪里要保留。它可以是自然语言加少量 JSON 摘要，但不承担精确 patch、对象 ID、DSL 行或 `project.json`。

### LLM2: 结构化编译与 patch

LLM2 面向工程落地，才是结构化模型。它应该看到：

- LLM1 的高层设计意图。
- 当前 `ProjectWorld` 摘要、稳定 ID 和上一轮执行报告。
- `ai/product-modules/ 中的模块能力库（capability 卡片），包括对象、变量、事件、兼容关系、运行时限制和未来同步标记。
- 从能力卡派生的 DSL 能力表、参数约束和 patch 规则。

LLM2 输出应是 DSL patch 或更严格的 operation patch。初次生成也应视为“从空项目打 patch 到第一个可玩版本”。这样连续迭代不会退化为全量重生成。

LLM2 具备受限自循环：首轮输出作为 `apply` batch；如果 `ExecutionReport.summary.nextAction=repair`，则读取当前 `ProjectWorld`、上一轮失败报告和上一轮 DSL，只追加修复所需的 DSL diff。已完成命令不能重复输出。当前限制最多 2 轮修复，仍失败则保留产物并返回失败码。

项目模式必须先判定：

- 新项目：默认模式和 `--mock`，重置上一局 generated state，从空项目开始。
- 迭代项目：`--continue`，必须加载现有 `output/project.json`，并继承同一局游戏的 `ProjectWorld` 和 `ExecutionLedger`。

因此 repair loop 的“当前已应用项目”只在同一局游戏内延续；开新项目时不得继承上一局缓存。

Current AI-first override: LLM2 output is AI-first Intent DSL. LLM2 may repair
parser/surface errors by rewriting natural Intent DSL, but it must not repair
Bridge/Runtime execution failures by emitting low-level DSL. Once Intent has
compiled to target code, failures route to the owning compiler, placement
resolver, bridge, runtime adapter, or executor layer.

### Agent Model Registry

`ai/agent-workflow.js` owns model routing. Pipeline code should call roles, not
hard-code model names:

- `requirement`: LLM1 creative/requirement model, default `deepseek-v4-flash`.
- `dsl`: LLM2 product-editing model for AI-first Intent DSL, default
  `deepseek-v4-flash`.
- `dslIntentRepair`: LLM2 repair role for AI-first Intent DSL compiler
  diagnostics. It rewrites natural Intent DSL only and does not see engine
  target code.
- `dslInternalRepair`: legacy/internal low-level repair role owned by
  RuntimeExecutor. Intent execution failures do not use it; they route back to
  lower-layer owners.
- `imageGeneration`: reserved asset generation role, configured by `GAMECASTLE_IMAGE_MODEL`.
- `vision`: reserved visual inspection role, configured by `GAMECASTLE_VISION_MODEL`.

Image and vision roles are intentionally registered before they are wired into
game generation. They should enter through asset/runtime ownership, not by
adding more prompt branches inside `pipeline.js`.

### Multi-Agent Contract

`ai/contracts/schema.json` owns the handoff contract between agents and runtime.
The flow is contract-first:

```text
RequirementModel
  -> BuildContract (frozen)
  -> DSLAgent writes Intent DSL; RuntimeAssetResolver resolves assets behind its own contract
  -> ImageAgent only fills repo/cache/variant misses when allowed
  -> ModuleCompiler/Bridge lower Intent into target facts; legacy ModuleDslPatch remains a ModuleCompiler-owned fixture/migration contract
  -> RuntimeLinker binds compiler output + AssetManifest + optional AssetReview
  -> RuntimeValidator checks project truth, cache, assets, HTML export, smoke status
  -> owner-routed repair patch
```

This boundary keeps AI context small and stable. RequirementModel sees product
module cards and creative capability hints, not full template internals or
engine/runtime fields. Its DesignBrief contract uses natural object roles and
`layout.placements` with `anchor/direction/pattern`; it rejects coordinates,
object sizes, implementation colors, and variable initial values.
DSLAgent should see AI-first Intent capability plus sanitized planning context,
not raw `project.json`, bridge/runtime audit internals, or coordinate-shaped
creative brief fields. During migration, legacy Module DSL remains an internal
compiler target and fixture baseline.
RuntimeAssetResolver resolves asset slots declared by the BuildContract by
checking exact cache, cloud repository, semantic/style repository matches,
project reuse, variants/edits, generation, and only then runtime placeholders.
ImageAgent is one supplier behind the resolver, not the owner of asset truth.
RuntimeLinker and RuntimeValidator are deterministic code, not LLM roles, because
they own merge truth, cache truth, GDevelop truth, publishability truth, and
repair routing.

The contract types are complete runtime-facing shapes, not placeholders:

- `BuildContract`: request, world summary, style guide, module intents, asset slots, parallel plan, acceptance, cache policy, repair policy.
- `ModuleDslPatch`: legacy/internal ModuleCompiler-owned module patch with
  Module DSL text and declared asset-slot dependencies; not the live LLM2
  product contract after the Intent migration.
- `AssetManifest`: RuntimeAssetResolver output with selected source, asset ids, paths, hashes, dimensions, confidence, publishability, and placeholder debt.
- `AssetReview`: VisionAgent semantic/visual checks over generated assets.
- `AssemblyReport`: RuntimeLinker bindings, outputs, conflicts, and next action.
- `ValidationReport`: RuntimeValidator checks, cache hit, owner-on-failure, and next action.

`npm run check:ai` runs `ai/check-contracts.js`, which verifies the schema,
local `$ref`s, required fields, owner enums, repair/cache fields, and
`agent-workflow.js` contract owner mappings.

`ai/asset-resolver.js` is the first runtime implementation of that asset side.
It currently resolves against manifest-backed local/cloud repositories, writes
exact-cache entries for real reused assets, emits `AssetManifest`, and records
placeholder debt when no repository candidate is acceptable. It deliberately
does not cache placeholders as successful assets, so future cloud repo fills or
ImageAgent output can replace them by slot signature.

`ai/asset-world.js` is the stable asset-side context. It turns `AssetManifest`
into `AssetWorld`, preserving slot state, placeholder debt, cache hit state, and
cloud promotion candidates. Expensive generated or edited assets that pass
validation should not be wasted as one-off files: if they are repo eligible,
AssetWorld places them into `cloudPromotionQueue` for cloud repository review,
indexing, and future reuse.

自动化验证由 `npm run test:ai` 覆盖。它不调用 LLM，而是用 DSL fixture 验证 new/continue 状态边界、失败报告、repair batch、缓存命中和 15 秒子进程超时防护。

## 当前模块边界

### Product Module DSL

This section describes the current pre-refactor module baseline. The
AI-facing composition layer is `ai/product-modules/` plus `ai/module-dsl.js`
and `ai/module-compiler.js`.

LLM1 should select from product-level module cards and should not memorize
template internals. The historical pre-refactor LLM2 path emitted Module DSL
patches such as:

```text
install module id=core.platformer preset=basic sync=lockstep authority=host tickRate=20 seed=auto
install module id=shell.start_screen preset=basic sync=local authority=client
install module id=shell.game_over_screen preset=basic sync=event authority=host
```

The compiler expands those modules into the existing internal line-style DSL,
then the current executor mutates `project.json`. Installed modules are recorded
in `ProjectWorld.modules`; future networking metadata is recorded in
`output/network-manifest.json`.

Product modules also declare `repositoryPolicy`. The module repository is the
gameplay-side equivalent of the asset repository: prefer reuse, and if an
expensive generated module variant becomes useful, promote it back as a
`cloudModuleRepo` candidate rather than leaving it as a one-off template.

This keeps the product skeleton coarse: a platformer core plus shells is exposed
as product composition, while player objects, collision events, text objects,
and fail-scene wiring stay inside runtime/compiler ownership.

The AI-first Intent refactor replaces this live surface instead of keeping it as
a parallel compatibility path. Module DSL becomes a compiler/internal migration
shape, not the product language LLM2 should speak. The compiler remains the only
owner that expands product modules into internal line-style DSL. Low-level DSL is
target code for compiler/bridge/runtime owners, not an Intent-path LLM2 repair
language.

For iteration, `ProjectWorld.modules` is the base module truth. A patch such as
adding `shell.game_over_screen` to an existing `core.platformer` project compiles
to a narrow event replacement generated from `ProjectWorld`, not a full replay
of the platformer module.

`configure module` is closed for installed modules. Supported configuration keys
live in each product module manifest under `compiler.configurePatches`; sync
policy fields are metadata-only. In the live Intent path, LLM2 asks for natural
product changes such as changing a start button label or making the session
host-authoritative; the compiler decides whether that maps to a module
configuration patch and owns event lookup, replacement ordering, module-state
updates, and network-manifest updates.

Fixed player interactions are product-module truth, not free-form prompt
knowledge. A configurable label may describe the exposed runtime trigger, but it
must not claim another trigger. LLM2 should see this contract while translating
creative intent into Intent DSL; the compiler enforces the same contract before
approval, so bad translations fail at the module/component boundary instead of
becoming misleading generated projects.

Module-link slots remain internal compiler ownership. If a shell module changes
how a core module fails, the shell module should expose the product capability
and its `compiler.links` entry should fill the core slot. LLM2 should select the
shell module, not hand-edit the core slot value.

Live testing should use `--approval-gate`. It creates a pending approval packet
with Intent DSL, typed Intent Graph, Placement Plan, Bridge Plan, Compile
ResultCard, aggregate Intent compile contract summary, compiled internal DSL,
runtime adapter requirements, module/network state, and a dry-run preview. The
preview is the reviewer contract: it reports every command result, whether the
patch is expected to execute, what semantic hash it predicts, and whether the
patch is a cache hit against the current `ProjectWorld`. Only
`--approve-pending` mutates the actual generated project. The full packet is a
human/runtime audit artifact and may contain Bridge Plan, internal DSL, runtime
adapter requirements, and command results. Any LLM or agent review must use
`aiVisibleForLlm2`, which is derived from the PipelineState LLM2 node input plus
safe counts/status only.

### AI-first Intent Layer

The live LLM2 product surface is now the AI-first Intent DSL. This is a breaking
refactor, not a compatibility layer. The goal is to lower AI and user cognition
by making LLM2 describe game-world intent instead of engine details.

The new canonical chain is:

```text
LLM2 Intent DSL
  -> typed Intent Graph
  -> Edit Constraint Graph
  -> Module + Component graph
  -> Semantic Placement plan
  -> GDJS Bridge plan
  -> internal low-level DSL
  -> project.json + code*.js + runtime adapters
  -> GDJS Runtime
```

The chain is now represented by a graph-ready state contract in
`ai/pipeline-state.js` and an official LangGraph runtime adapter in
`ai/langgraph-runtime.js`. The contract names the orchestration slots:
`userRequest`, `requirement`, `llm2`, `intentGraph`, `resolver`, `compiler`,
`bridge`, `runtime`, `projectWorld`, `diagnostics`, and `ownerRoute`.
Internal slots may keep Bridge Plan, runtime adapter requirements, and execution
reports for audit. The LLM2 slot only receives the ProjectWorld-owned sanitized
node input: sanitized user request, sanitized design brief, sanitized diff, and
the sanitized world context. Future LangGraph nodes should read
`pipelineState.llm2.nodeInput`, not raw `requirement.designBrief` or
`projectWorld.world`. This prevents coordinates, component ids, adapter ids,
Bridge Plan details, and target DSL from flowing back into Intent generation.
`ai/pipeline-state.js` also exports machine-checkable node contracts. The
`llm2-intent` contract only allows reads from `llm2.nodeInput` and writes to the
Intent DSL fields; tests fail if it tries to read raw requirement, raw
ProjectWorld, Bridge Plan, runtime report, or internal target DSL fields.
Each saved `PipelineState` also carries a `nodeContracts` snapshot so external
or LangGraph runners can audit the same read/write boundary from the
state file itself instead of relying on prose. Runners should build node inputs
through `makeNodeStateView(state, nodeName)`, which validates the state and
returns only the paths allowed by the node contract; the `llm2-intent` view
contains `llm2.nodeInput` and excludes raw requirement, raw ProjectWorld,
Bridge, Runtime, and target DSL state. Node outputs should be merged through
`applyNodeStatePatch(state, nodeName, patch)`, which accepts only contract-owned
write paths and rejects LLM2 attempts to write raw requirement, bridge, runtime,
or ProjectWorld fields. The same view/patch mechanism is used for the compiler,
resolver, bridge, and runtime contracts.

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
`applyNodeStatePatch` output, supports async handlers, and records read/write
trace evidence. `ai/langgraph-adapter.js` is the node boundary used by both the
local runner shape tests and official LangGraph: it wraps a PipelineState in a
`pipelineState` channel, gives each node only the contracted view, requires a
path-object patch from the node, merges it through `applyNodeStatePatch`, and
returns an updated `pipelineState` plus trace evidence. `ai/langgraph-runtime.js`
loads `@langchain/langgraph`, defines the `PipelineState` and `graphTrace`
channels, compiles the canonical owner sequence into a `StateGraph`, and invokes
it without giving any node extra state access. A LangGraph node should therefore
implement only the node's domain work; it must not receive the full PipelineState,
raw ProjectWorld, Bridge Plan, runtime report, or internal DSL unless its node
contract explicitly allows that read.
Approval preview packets include this state, and real Intent execution now asks
the canonical graph entry to assemble the persisted post-runtime state. The
saved `output/pipeline-state.json` carries `graphTrace` evidence for the five
owner nodes after `ProjectWorld` and `ExecutionReport` are written.

### Project Weave Graph

The whole-project orchestration name is **Project Weave Graph** (`项目联排图`).
It is the graph above the World Intent Layer. The current official LangGraph
runtime already executes the embedded World Intent Layer; the remaining project
owners are now declared as contract-ready nodes so migration can proceed without
inventing new prompt surfaces or widening LLM2 access.

`ai/project-pipeline-graph.js` owns the total graph specification:

```text
requirement
  -> llm2-intent
  -> intent-compiler
  -> resolver
  -> asset-library
  -> image-generation
  -> asset-review
  -> asset-resolver
  -> asset-world
  -> bridge
  -> runtime-linker
  -> network-runtime
  -> server-runtime
  -> html-export
  -> runtime
  -> runtime-validator
  -> project-world
```

Layer names:

- `Briefing Layer`: user request and creative design brief.
- `World Intent Layer`: natural Intent DSL, Intent Graph, resolver, bridge plan.
- `Asset Weave Layer`: asset library lookup, image generation, asset review, slot resolution, reuse/generation debt, AssetWorld.
- `Runtime Assembly Layer`: asset/bridge binding, network runtime codegen, runtime files, HTML export, execution.
- `Server Weave Layer`: signaling server, rooms, ordered input, game loop, and state store.
- `Validation Layer`: fulfillment, asset debt, export health, owner routing.
- `World Summary Layer`: ProjectWorld and ledger feedback for the next turn.

`llm2-intent` remains intentionally narrow in the total graph: it reads only
`llm2.nodeInput`. It must not read raw `AssetManifest`, raw `AssetWorld`, Bridge
Plan, runtime report, or internal target DSL. Resource and assembly details flow
downstream through owned runtime nodes and only return to models through
sanitized world summaries.

Official LangGraph smoke coverage now exists for:

- `asset-library -> image-generation -> asset-review`
- `asset-resolver -> asset-world`
- `network-runtime -> server-runtime`
- `runtime-linker -> html-export -> runtime-validator -> project-world`

Every Project Weave Graph owner outside the live World Intent path now has at
least one official `StateGraph` smoke. The remaining migration distinction is
between `wired-langgraph` live nodes and `wired-langgraph-smoke` nodes, not
between represented and unrepresented owners.

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
`project.json` patches as the normal product path. It also must not write
module ids, component ids, runtime adapter names, or `key=value` machine fields
as the normal product path; the compiler owns those selections.

Product modules remain as compiler truth and reusable skeletons, but LLM2 now
selects them through Intent DSL. Module DSL is no longer a second live LLM2
product surface; it remains only an explicit fixture/internal migration input.
Low-level line DSL remains target code for the bridge and runtime executor, not
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
layer. The bridge may assemble internal DSL from those facts, but it must not
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
The Intent compiler runs this contract before returning a compiled patch, so
malformed rewrite evidence fails at the owner boundary instead of becoming a
quiet ResultCard drift.

The full compiled artifact is checked by `ai/intent-compile-contract.js` before
`ai/intent-compiler.js` returns. This aggregate contract verifies the Intent
Graph, edit constraints, ResultCard fields, routed diagnostics, rewrite
evidence, Placement Plan, Bridge Plan emission evidence, and runtime adapter
requirements together. A compiled Intent patch is therefore not considered valid
unless the whole Intent -> Edit/Placement -> Bridge -> Runtime chain is
contract-complete.
The compiler attaches this aggregate contract summary to the compiled artifact;
the approval packet, `ProjectWorld`, and `ExecutionReport` persist it as
`intentContracts`/`intent.contracts`, so reviewers can audit the whole lowering
chain without reading GDJS target details.

The first GDJS bridge owner is `ai/gdjs-bridge.js`. It turns the Intent Graph,
component compiler manifests, and Placement Plan into a Bridge Plan containing
internal low-level DSL plus runtime adapter requirements. If a target detail is
not expressible by the current GDJS/internal DSL, the bridge routes it as an
owned adapter requirement or diagnostic instead of expanding the LLM2 surface.
`ai/intent-runtime-codegen.js` then generates `intent-runtime.js` for the HTML
export, attaching mobile controls and inventory UI through
`GameCastleIntentRuntime` after the GDJS `RuntimeGame` is created.
Bridge target emission is contracted by `ai/gdjs-bridge-emission-contract.js`:
each internal DSL line carries `owner`, `source`, and `mechanism`, with optional
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
components, emit internal DSL, and apply through the GDJS bridge. Each compile
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
internal target DSL with `semantic-placement-edit-rewrite` evidence. LLM2 never
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
surface detection and bridge issue route lookup. `ai/dsl-growth-control.js`
adds the evidence gate: current bridge issue fixtures must prove the owner and
mechanism through the compiled Intent Graph, Placement Plan, Bridge Plan, and
ResultCard instead of admitting new LLM2-facing machine syntax.
Diagnostics use the same contract through `ai/intent-diagnostic-router.js`:
when a compiler, placement, or bridge failure is emitted, it carries `routeId`,
`routeOwner`, `routeMechanism`, and `nextAction`. Only diagnostics owned by
`llm2-intent` may ask LLM2 to change Intent DSL; system-owner diagnostics route
back to the component catalog, placement resolver, bridge, runtime adapter, or
other owning layer.
`ai/dsl-agent.js` enforces this at the Intent compile repair boundary: parser or
surface-form errors may be repaired by LLM2, but compiled diagnostics with
`nextAction=route-to-owner` fail fast and preserve the owner-routed diagnostic
instead of entering the LLM2 repair loop.
`ai/pipeline.js` enforces the same boundary after execution: if an Intent patch
has already compiled to bridge/internal DSL and runtime execution fails, the
pipeline records the `ExecutionReport`, returns a failure status, and does not
ask LLM2 to write low-level DSL repair lines.
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
dangerous coordinate/GDJS/adapter/component-id/Bridge/internal-DSL payloads.

### `ai/pipeline.js`

当前编排层，负责项目模式判定、状态读写、DSL 执行、approval gate、repair loop 编排和 `output/` 写入。

Agent/model 内容不应继续堆在这里：

- `ai/llm-provider.js` owns Responses/SSE text model calls.
- `ai/requirement-agent.js` owns LLM1 design brief generation.
- `ai/dsl-agent.js` owns LLM2 Intent Commander prompts and Intent compile
  repair. Module Commander and internal repair prompt builders remain for
  explicit fixture/internal migration paths only, not the live Intent path.
- `ai/agent-workflow.js` owns role/model routing.

后续接入生图/识图时，应继续通过 Agent/contract 边界接入，而不是把 prompt 分支加回 `pipeline.js`。

### `ai/project-world.js`

当前状态翻译层，负责：

- 从 GDevelop `project.json` 生成稳定的 `ProjectWorld`。
- 给场景、对象、实例、变量和事件分配稳定 ID。
- 继承 AI-first Intent 摘要：Intent DSL patch、typed Intent Graph、Edit Constraints、aggregate compile contract、Placement Plan、Bridge Plan、Compile ResultCard owner trace、runtime adapter requirements。
- 输出语义 hash 和 worldVersion，避免运行时 UUID 造成缓存抖动。
- 追加 `ExecutionLedger`，记录每个 batch、每条 DSL 命令的完成/失败和下一步动作。

`ProjectWorld` 是给 LLM2 循环使用的世界摘要，不是完整 `project.json` 的替代存档。完整 `project.json` 仍然由 GDJS Runtime 消费。
Intent 摘要中的原始自然语言行用于审计，不参与 `semanticHash`；hash 使用结构化 Intent/Bridge 摘要，避免同义改写造成状态抖动。
`ProjectWorld.intent` may retain internal audit facts such as component ids,
bridge route evidence, and runtime adapter summaries for verification. Those
facts must not be passed directly to LLM2. `ai/project-world.js` owns the
AI-visible projection through `sanitizeProjectWorldForIntentPrompt` and
`sanitizeExecutionReportForIntentPrompt`; `ai/dsl-agent.js` consumes that
projection when building Intent Commander prompts. The projection preserves
object names, natural placements, semantic edit facts, and prior safe Intent
lines while dropping coordinates, bridge plans, runtime adapter ids, GDJS object
types, low-level execution commands, and internal contract names. Intent repair
prompts use the same boundary: if the previous patch contained prohibited
machine syntax, the exact line is omitted and LLM2 repairs from the user
request, design brief, sanitized world card, and natural rules instead of
copying the bad machine shape.
LLM1 design briefs and design diffs are natural at the contract boundary. If an
older saved brief contains numeric layout sketches, RequirementModel history and
Intent Commander prompts sanitize them into coarse `screen` directions such as
`bottom-right`. LLM2 receives game-world changes, not numeric planning sketches.

### `ai/capabilities/`

模块能力真相源。能力卡是 LLM 可见能力的唯一来源：

- LLM1 只读取 `llm1Hint` 派生出的轻量摘要。
- LLM2 读取结构化能力卡、DSL 示例、约束和同步标记。
- prompt 不再维护另一份硬编码能力表。

当前已覆盖：平台跳跃核心（含移动、收集计分、敌人碰撞、场景、几何对象）、计分系统、开始界面、结束界面。能力卡片从 product-modules 自动派生，不单独维护。

### `ai/gdevelop-truth/`

`runtime-truth.json` is extracted from `D:\GDevelop-master` and is the canonical
GDevelop/GDJS runtime truth snapshot for the supported surface. It owns official
object types, behavior types, include files, runtime registration sources,
instruction function mappings, and object/behavior data fields.

`ai/gdevelop-truth.js` is the only code entry point for these facts. Pipeline
DSL may stay AI-friendly, but emitted `project.json` and HTML manifests must
validate against this snapshot and fail fast on stale GDevelop names.

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
