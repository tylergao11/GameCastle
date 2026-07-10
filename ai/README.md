# AI — 模块化生成管线

`ai/` 当前负责把用户意图编译为可运行游戏项目。它不是“模板拷贝器”，而是游戏工厂的生成管线雏形。

## 当前文件

| 文件 | 职责 |
|------|------|
| `pipeline.js` | 当前编排层：项目模式、状态读写、DSL 执行、approval gate、`output/` 写入 |
| `agent-workflow.js` | Agent role/model registry：需求模型、DSL 模型、DSL repair、生图模型、识图模型 |
| `contracts/schema.json` | Multi-agent contract schemas：BuildContract、AssetManifest、Linker/Validator reports |
| `contracts.js` | Contract schema loader and owner/type constants shared by checks and future runtime assembly |
| `asset-resolver.js` | RuntimeAssetResolver：cache/repo/variant/generation/fallback resolution skeleton and AssetManifest output |
| `asset-world.js` | AssetWorld builder：stable resource context, asset debts, cache state, and cloud promotion queue |
| `assets/local-repo.json` | Local asset repository manifest seed for project/local reuse |
| `assets/cloud-repo.json` | Cloud asset repository manifest seed for repo-first asset resolution |
| `image-agent.js` | ImageAgent：生图 prompt 构建 + DistillHint 输出。当前为 stub（假装生成占位 PNG），接真模型时替换内部实现，契约不变 |
| `cloud-library-manager.js` | CloudLibraryManager：确定性资产存取、去重、版本、权限。不调 LLM，只被 DistillationAgent 和 texture-provider 调用 |
| `texture-provider.js` | 薄集成层：pipeline executor → 查 CloudLibraryManager → 未命中则调 ImageAgent 生成 → 存 candidate |
| `distillation-agent.js` | DistillationAgent：独立脚本（`node ai/distillation-agent.js`），异步批量蒸馏 candidate → approved，含 RAG 视觉验证。不跑在主 pipeline 上 |
| `asset-rag-client.js` | RAG 客户端：轻量 HTTP 客户端，本地零 ML 依赖。调云端 CLIP+LanceDB 做图像-标签一致性验证，不可达时 fallback 到 stub |
| `check-image-agent.js` | ImageAgent 自检，校验 generateImage + DistillHint schema |
| `check-cloud-library-manager.js` | CloudLibraryManager 自检，校验 storeCandidate + dedupe + resolveByTags |
| `check-distillation-agent.js` | DistillationAgent 自检，校验 promoteCandidate + rejectCandidate + 幂等 |

| `llm-provider.js` | Responses/SSE 文本模型调用边界，负责流式输出、reasoning 可见性和 provider 日志 |
| `requirement-agent.js` | LLM1/RequirementModel：把用户意图翻译成轻量 design brief |
| `dsl-agent.js` | LLM2/DSLAgent: AI-first Intent Commander prompt and Intent repair |
| `capabilities.js` | 加载并校验能力卡，派生 LLM1 摘要和 LLM2 编译上下文 |
| `check-agent-workflow.js` | Agent workflow 自检，防止模型角色再次散落硬编码 |
| `check-contracts.js` | Multi-agent contract 自检，校验契约类型、owner 路由、repair/cache 字段和 workflow 映射 |
| `check-asset-resolver.js` | RuntimeAssetResolver 自检，校验 repo lookup、exact cache、AssetManifest 和 placeholder debt |
| `check-asset-world.js` | AssetWorld 自检，校验资源上下文、稳定 hash、placeholder debt 和生成资产云端沉淀队列 |
| `check-capabilities.js` | 能力卡校验脚本，已接入 `npm run check:ai` |
| `check-product-modules.js` | 产品模块校验脚本，已接入 `npm run check:ai` |
| `module-compiler.js` | 产品模块编译器，把结构化模块 command 展开为内部低层 DSL，并产出 tick runtime manifest |
| `project-world.js` | 把 GDevelop `project.json` 翻译为稳定的 `ProjectWorld`，并追加 `ExecutionLedger` |
| `semantic-mapping/semantic-feedback.json` | 语义映射字典真相源：subject aliases、issue profiles、repair verbs、Intent line strategies 和默认语义值 |
| `semantic-feedback.js` | 语义反馈 owner：读取语义映射字典，把结构化 probe issue 归一成安全 repair Intent DSL，并生成 LLM-safe semantic mapping view |
| `semantic-playtest-agent.js` | Semantic Playtest Agent：自动生成 PlayPolicy，调用 Tick 伪运行，产出 LLM/user 双层报告和可执行 Repair Intent |
| `intent-world-view.js` | IntentWorldView：把单场景 ProjectWorld + tick 试玩证据压成 gameplay-first 的 LLM2 决策上下文，UI/Icon 只作为模板化辅助层 |
| `llm2-context-cache-router.js` | LLM2 Context Cache Router：按 DeepSeek 文本 KV 前缀缓存选择 `full_hit` / `diff_hit` / `recommended_pack` / `full_miss` |
| `llm2-context-provider.js` | LLM2 Context Provider：按 `request_context` 返回安全的 `tick_event_window`、`project_world_diff`、`snapshot_summary`、`ui_template_policy` |
| `llm2-decision-runtime.js` | LLM2 Decision Runtime：把 Router + IntentWorldView 变成 `apply_intent` / `request_context` / `no_op` / `reject` 决策并验证 |
| `llm2-decision-loop-runner.js` | LLM2 Decision Loop Runner：串联 Router、Provider、Decision Runtime、pipeline 执行和复盘报告 |
| `llm2-semantic-eval-loop.js` | LLM2 Semantic Eval Loop：批量自然语言创作/反馈基准，复用 Decision Loop、Tick 证据、Intent 执行、试玩复测和 transcript |
| `deepseek-cache-monitor.js` | DeepSeek Cache Monitor：真实 Responses bridge 调试层，监听每步 usage，按 90% text KV cache hit rate gate 判定 |
| `llm2-deepseek-decision-provider.js` | LLM2 DeepSeek Decision Provider：真实模型决策接入点，解析严格 JSON，经 Decision Verifier 与 cache gate 后才可用 |
| `tick-playtest-runtime.js` | Tick 伪运行 owner：读取 ProjectWorld + PlayPolicy + semantic mapping，产出 EventLog/Snapshot/tick evidence issues |
| `full-creative-loop.js` | Full Creative Loop v1：用 deterministic Mock LLM 串起用户意图、Intent、创建、试玩、修复、二次试玩和用户总结 |
| `gdevelop-truth.js` | 项目内唯一 GDevelop runtime truth 入口，负责官方类型/include/字段读取和校验 |
| `gdevelop-truth/runtime-truth.json` | 从 `D:\GDevelop-master` 提取的官方 GDevelop/GDJS runtime truth snapshot |

历史拼装脚本和硬编码旧路径已经移除。后续新增脚本必须使用仓库相对路径，并且明确属于测试、构建还是迁移。

## 能力真相源

`ai/product-modules/` 是当前模块能力的唯一真相源。每个 product-module 内嵌 capability 卡片。capabilities.js 从此目录自动派生能力目录（不再独立维护 capabilities/ 目录）：

- `llm1Hint`：给 LLM1 的轻量能力提示，不包含完整 DSL 示例或模板结构。
- `provides/requires`：能力提供什么、需要什么对象/变量/事件/行为。
- `constraints`：编译和运行时约束。
- `sync`：未来联机同步模式、确定性和权威状态边界。

`pipeline.js` 不再把能力表手写在 prompt 里，而是通过 `capabilities.js` 派生：

- LLM1：只拿 `buildCreativeCapabilitySummary()`。
- LLM2：通过 Intent Commander 获取自然能力摘要；capability card 不携带低层 DSL 示例或修复上下文。

## 资产生成与蒸馏管线（新增）

```text
DSL: create object name=Player type=Sprite texture=player.png
  → pipeline.js executor
    → textureProvider.resolveTexture()
      → CloudLibraryManager.resolveByTags() → 命中 approved? 直接用
      → 未命中 → ImageAgent.generateImage() → 产出 PNG + DistillHint
      → CloudLibraryManager.storeCandidate() → 内容hash去重 + 语义hash去重
  → gdevelopTruth.createSpriteObject(texture) → project.json

# 独立进程，手动或定时触发：
node ai/distillation-agent.js
  → 读 manifest
  → 脱敏 / 标准化标签 / 质量门
  → visionVerify() → asset-rag-client.js → 云端 CLIP 验证（或 stub fallback）
  → promoteCandidate() → candidate → approved
  → 下次 resolveByTags 直接命中复用
```

## 当前管线

```text
prompt
  -> LLM1 generateDesignBrief
  -> module/design brief
  -> IntentWorldView / safe ProjectWorld / semantic evidence
  -> LLM2 natural Intent DSL
  -> Intent Graph / Resolver / Bridge
  -> runtime executor
  -> Semantic Playtest / Repair Intent / Decision Loop
  -> output/project.json + output/game.html
  -> output/project-world.json + output/execution-ledger.json
```

## Semantic Playtest Agent

Semantic Playtest Agent is the product-facing owner above the Tick pseudo-runner.
After pipeline execution writes `ProjectWorld` and `ExecutionReport`, the
pipeline automatically writes:

- `output/semantic-playtest-report.json`
- `output/semantic-playtest-policy.json`
- `output/semantic-playtest-llm-report.json`
- `output/semantic-playtest-user-report.json`
- `output/intent-world-view.json`
- `output/semantic-playtest-repair.intent.dsl`

The agent builds a policy from the LLM-safe ProjectWorld view and the LLM-safe
semantic mapping view, then asks the local Tick runner to play in semantic terms:

```text
ProjectWorld + Semantic Mapping
  -> PlayPolicy
  -> Tick EventLog + Snapshot
  -> tick evidence issue
  -> SemanticFeedback
  -> repair Intent DSL
```

The agent writes two reports from the same evidence:

- LLM report: structured tick summary, tick issues, evidence, and repair Intent.
- User report: short human-language playtest summary and suggested intent lines.

The runner uses semantic role bindings such as player, collectible, threat, and
control. Fixture games can bind those roles to concrete world nouns, but the
runtime must not hard-code a genre. `ai/check-semantic-playtest-pipeline-output.js`
verifies pipeline output, and `ai/check-llm-guided-tick-playtest-loop.js`
verifies create -> playpolicy -> tick pseudo run -> feedback -> repair -> rerun
improvement.

## IntentWorldView

`ai/intent-world-view.js` is the LLM2 decision context above Semantic Playtest.
It describes one active scene as gameplay responsibilities instead of UI layout:

- `player_agent`, `reward_pacing`, and `pressure_source` are primary gameplay
  design objects.
- `action_entry` UI controls are supporting input surfaces only.
- icon style, visual style, and broad UI layout are expected to come from
  selectable templates, not from long LLM2 tuning loops.
- recommended actions are unified semantic repair candidates; `no_op` remains a
  Decision Runtime result, not an action candidate.

The view also carries `contextCache`: semantic hash, cache-hit state, and a
small diff. When semantic hashes match, LLM2 should treat the world as
`diff-only`; when they do not match, it receives `summary-plus-diff`. This keeps
iterations focused on changed gameplay evidence instead of repeatedly re-reading
the whole scene.

## LLM2 Context Cache Router

`ai/llm2-context-cache-router.js` is the debug layer before real LLM2 calls. It
routes the LLM2 context by DeepSeek text KV prefix-cache economics, where cache
hit and miss cost can differ massively. The router does not use asset,
repository, image, or multimodal cache assumptions.

Modes:

- `diff_hit`: same semantic world, gameplay iteration, stable prefix should hit,
  dynamic tail carries the user turn and tick evidence diff.
- `full_hit`: stable prefix is available and broader context is worth reading,
  especially after repeated wrong turns.
- `recommended_pack`: small triage context with candidate actions and context
  requests, used for focused requests such as "怪别太密".
- `full_miss`: new project, no base semantic hash, or repeated failures without
  a trusted stable prefix.

The router output contains `stablePrefix`, `dynamicTail`, `estimatedCacheRisk`,
`reason`, and the explicit provider cache model:

```text
provider=deepseek
cacheKind=text-kv-prefix
reusableAcrossModalities=false
hitToMissPriceRatio=50
```

`full-creative-loop.js` writes the selected route to
`output/full-creative-loop-repair-context-route.json` so real DeepSeek debugging
can inspect context selection before spending tokens.

## LLM2 Decision Runtime

`ai/llm2-decision-runtime.js` is the replaceable decision node after context
routing. It turns `IntentWorldView + ContextRoute + user request` into one of
four verified decisions:

- `apply_intent`: emit safe Intent DSL.
- `request_context`: ask for focused context such as `tick_event_window`.
- `no_op`: leave the world unchanged because current evidence is acceptable.
- `reject`: reject out-of-scope or unsafe requests, such as pure icon styling
  that belongs to UI template policy.

The runtime includes a deterministic Mock engine plus `LLM2DecisionVerifier`.
The verifier rejects coordinates, machine fields, component ids, bridge/runtime
internals, and non-apply decisions that try to emit Intent DSL. This makes real
DeepSeek a replaceable decision engine rather than the owner of GameCastle's
rules.

`ai/llm2-context-provider.js` closes the `request_context` loop. When Decision
Runtime asks for context, the provider returns safe focused summaries:

- `tick_event_window`: semantic events around the evidence tick.
- `project_world_diff`: semantic hash state and latest Intent diff lines.
- `snapshot_summary`: compact metric/state snapshots around the evidence tick.
- `ui_template_policy`: template boundary for UI/icon requests.

The provider deliberately strips coordinates and backend fields. A typical
two-step decision is:

```text
"怪别太密"
  -> recommended_pack
  -> request_context: tick_event_window
  -> ContextProvider returns focused threat events
  -> apply_intent: reduce enemy pressure near Player early route
```

## LLM2 Decision Loop Runner

`ai/llm2-decision-loop-runner.js` is the runtime bus for LLM2 decisions before
real DeepSeek is connected. It reads the current `IntentWorldView`, routes
context, runs Decision Runtime, resolves `request_context` through Context
Provider, optionally writes Intent DSL, executes `pipeline --continue`,
and writes a replayable report.

Outputs:

- `output/llm2-decision-loop-report.json`
- `output/llm2-decision-loop.intent.dsl`
- `output/llm2-decision-loop-context-route.json`
- `output/llm2-decision-loop-provided-context.json`
- `output/semantic-iteration-memory.json`

When an `apply_intent` turn executes, the runner compares before/after Tick
summaries through the semantic mapping and writes `SemanticIterationMemory`.
That memory is bound to the after-world semantic hash and is injected into the
next matching `IntentWorldView` as `semanticIterationMemory`. LLM2 sees only the
safe gameplay result: which experience measurements improved, which issues
remain, and what semantic focus should carry into the next creation turn. It
does not see coordinates, component ids, GDJS, adapter ids, or bridge plans.
The comparison includes semantic improvement guard measurements from the mapping
in addition to the issue-targeted measurements, so local reward fixes cannot
pass while survival, pressure, or reachability regress.
The router keeps this memory in the dynamic tail, not the stable cache prefix,
and Decision Runtime uses it to prefer remaining semantic issues over dimensions
that Tick evidence already improved.

Real LLM integration should replace the deterministic decision engine inside the
Decision Runtime boundary. Router, Provider, verifier, pipeline execution, Tick
playtest, and report generation should remain deterministic runtime ownership.

## LLM2 Semantic Eval Loop

`ai/llm2-semantic-eval-loop.js` is the batch evaluation layer above the single
Decision Loop Runner. It does not own gameplay rules or model behavior. It owns
the replayable benchmark set:

```text
natural user request
  -> LLM2 Decision Loop Runner
  -> Context Provider if request_context
  -> Intent DSL / pipeline execution when apply_intent
  -> Semantic Playtest writeback
  -> transcript + before/after summary
```

The default eval set covers natural creation/feedback turns such as:

- `金币多一点`: apply safe Intent and execute the pipeline.
- `怪别太密`: request focused tick evidence, then apply a pressure-reduction Intent.
- `玩家死太快`: apply a safer early-route Intent from semantic evidence.
- `按钮换个酷炫图标` and `按钮往上一些`: reject pure UI/icon tuning as template policy.
- `再看一下`: no-op on stable evidence.

Run it directly with:

```bash
npm run eval:llm2-semantic-loop
```

Outputs:

- `output/llm2-semantic-eval-report.json`
- `output/llm2-semantic-eval-summary.txt`
- `output/llm2-semantic-eval-transcripts/*.json`

`node ai/check-llm2-semantic-eval-loop.js` is also part of `npm run check:ai`.
It audits that every case has a transcript, every decision passed verifier,
`request_context` really received provider evidence, executed cases have
before/after tick summaries, and no LLM2-visible result leaks machine surfaces.

## DeepSeek Cache Monitor

`ai/deepseek-cache-monitor.js` is the real-provider debug gate for the LLM2
Intent Engine context strategy. Router reports are predictions; this monitor
requires provider usage evidence from the local DeepSeek Responses bridge.

It sends a stable LLM2 Intent prefix followed by changing dynamic turns, listens
to `response.completed.usage`, and computes the hot-step cache hit rate from
`prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, and
`input_tokens_details.cached_tokens`.

Run it when tuning real DeepSeek context:

```bash
npm run debug:deepseek-cache
```

Outputs:

- `output/deepseek-cache-monitor-report.json`
- `output/deepseek-cache-monitor-summary.txt`

The first request is treated as warmup. Every later hot request must pass the
90% cache hit gate. Missing usage fails closed, because cache savings must be
proven by provider data rather than inferred from prompt shape. The local check
`node ai/check-deepseek-cache-monitor.js` uses fake SSE usage and is included in
`npm run check:ai`; it does not spend tokens.

`ai/llm2-deepseek-decision-provider.js` is the narrow real-model decision entry.
It asks DeepSeek for strict JSON, parses one decision object, runs the same
`LLM2DecisionVerifier`, and attaches the provider cache gate result. Unsafe
model output becomes `reject`; it cannot bypass verifier rules or emit machine
surfaces. The deterministic Decision Runtime remains the default fast path until
real-model eval is intentionally enabled.

Prompt discipline for this provider is intentionally low-model friendly:

- Use named slots such as `slot:user_request`, `slot:local_proof`, and
  `slot:required_output`.
- Use proof vocabulary such as `candidate_matched`, `evidence_gap`,
  `stable_current_state`, and `template_policy`.
- Command-line probes should pass stable request slots such as
  `REQUEST_SLOT:more_collectibles` instead of raw natural-language examples, so
  shell encoding cannot corrupt the semantic proof.
- When `slot:local_proof` proves `candidate_matched`, the provider applies the
  proven safe Intent DSL and records the model's raw decision type separately.

The real-provider loop can be probed without mutating the project:

```bash
npm run debug:llm2-deepseek-loop
```

That command runs a slot-based semantic eval batch:

```text
REQUEST_SLOT:more_collectibles
REQUEST_SLOT:enemy_density
REQUEST_SLOT:death_too_fast
REQUEST_SLOT:ui_template
REQUEST_SLOT:stable_noop
REQUEST_SLOT:route_unclear
REQUEST_SLOT:content_sparse
REQUEST_SLOT:phase_reward_missing
REQUEST_SLOT:remix_runner
REQUEST_SLOT:remix_survivor
  -> LLM2 Decision Loop Runner
  -> LLM2 DeepSeek Decision Provider
  -> proof slot gate
  -> verifier
  -> provider cache gate >= 90%
  -> transcript/report
```

It runs a warmup pass and then a hot pass. The hot pass must meet the 90% cache
gate. It writes:

- `output/llm2-deepseek-loop-debug-report.json`
- `output/llm2-deepseek-loop-debug-summary.txt`
- `output/llm2-deepseek-loop-report.json`
- `output/llm2-deepseek-loop-summary.txt`
- `output/llm2-deepseek-loop-transcripts/*.json`

The command uses `execute=false`, so it observes DeepSeek decision quality and
cache behavior without applying an Intent artifact to the current project.

## Full Creative Loop

`ai/full-creative-loop.js` is the first complete single-player creative loop.
It uses a deterministic Mock LLM only to produce stable semantic outputs, then
uses the real pipeline and Semantic Playtest Agent for execution:

```text
user request
  -> Mock RequirementModel design brief
  -> Mock DSLAgent Intent DSL
  -> pipeline create
  -> Semantic Playtest Agent
  -> IntentWorldView
  -> Context Cache Router
  -> LLM2 Decision Runtime
  -> Context Provider if request_context
  -> pipeline --continue repair
  -> Semantic Playtest Agent rerun
  -> before/after comparison
  -> final user summary
```

The Mock LLM must not emit coordinates, GDJS names, component ids, bridge plans,
or runtime adapter fields. The loop writes:

- `output/full-creative-loop-create.intent.dsl`
- `output/full-creative-loop-before-semantic-playtest-report.json`
- `output/full-creative-loop-before-intent-world-view.json`
- `output/full-creative-loop-before-repair.intent.dsl`
- `output/full-creative-loop-repair-context-route.json`
- `output/full-creative-loop-repair.intent.dsl`
- `output/full-creative-loop-after-semantic-playtest-report.json`
- `output/full-creative-loop-after-intent-world-view.json`
- `output/full-creative-loop-report.json`
- `output/full-creative-loop-user-summary.txt`

`node ai/check-full-creative-loop.js` verifies the whole create -> playtest ->
repair -> rerun chain and requires the second playtest metrics to improve.
`node ai/check-full-creative-loop-reliability.js` runs multiple deterministic
creative-loop scenarios and writes `output/full-creative-loop-reliability-report.json`.
It covers both repair and no-repair outcomes, verifies EventLog/Snapshot evidence
for every run, repeats a representative scenario to prove deterministic evidence,
and asserts that Mock LLM output stays on the safe Intent surface.

## AI-first LLM2 Boundary

The live LLM2 product surface is Intent DSL. `dsl-agent.js` owns the Intent
Commander prompt and Intent repair path. Low-level DSL is a compiler/runtime
target shape only. Capability cards carry safe creative summaries and must not
carry low-level DSL examples or compiler prompt sections.

## Agent Workflow

Agent roles are centralized in `agent-workflow.js`:

- `requirement`: LLM1 / RequirementModel. Default model: `deepseek-v4-flash`.
- `dsl`: LLM2 / DSLAgent. It writes AI-first Intent DSL from sanitized game-world context. Default model: `deepseek-v4-flash`.
- `dslIntentRepair`: LLM2 / DSLAgent repair role for AI-first Intent DSL compiler diagnostics. It rewrites natural Intent DSL only and does not see engine target code.
- `imageGeneration`: reserved ImageAgent role for generated or edited assets when repo/cache/variant resolution misses. It is registered but not yet wired into the runtime asset pipeline.
- `vision`: reserved VisionAgent role for screenshots, references, and generated asset inspection. It is registered but not yet wired into the runtime asset pipeline.

Override models with:

```bash
GAMECASTLE_REQUIREMENT_MODEL=deepseek-v4-flash
GAMECASTLE_DSL_MODEL=deepseek-v4-flash
GAMECASTLE_IMAGE_MODEL=<image-model>
GAMECASTLE_VISION_MODEL=<vision-model>
```

## Multi-Agent Contracts

`ai/contracts/schema.json` is the versioned contract truth source for agent
handoffs. It intentionally describes complete runtime-facing payloads instead
of minimal placeholders:

- `BuildContract`: frozen RequirementModel output before parallel work begins.
- `AssetManifest`: RuntimeAssetResolver output containing cache/repo/variant/generated/placeholder asset decisions, hashes, dimensions, publishability, and debt state.
- `AssetReview`: VisionAgent output for visual/semantic asset checks.
- `AssemblyReport`: RuntimeLinker output after deterministic module/asset binding.
- `ValidationReport`: RuntimeValidator output with cache, schema, GDevelop truth, HTML, smoke, and owner-routed repair status.

The boundary is deliberate: LLM agents propose under a contract; runtime code
links, validates, owns facts, and routes repair to the failing owner. Asset
resolution is repo-first: exact cache, cloud repo exact match, cloud repo
semantic/style match, project reuse, variant/edit, external generation, then
runtime placeholder. ImageAgent does not write `project.json` or own final asset
selection, DSLAgent does not invent asset file names, and VisionAgent does not
become the source of project truth.

Placeholders are build-continuity debt, not assets. They may appear in
`AssetManifest` so Linker/Validator can keep a playable prototype moving, but
they are marked `repoEligible=false`, `trainingEligible=false`, and normally
`blocksFinalExport=true`.

## Runtime Asset Resolver

`ai/asset-resolver.js` is the runtime owner for asset choice. It does not call
image or vision models yet. The current skeleton supports:

- loading local and cloud repository manifests;
- computing stable slot signatures for exact cache hits;
- deterministic metadata/tag scoring for repo candidates;
- writing `AssetManifest` entries for reused assets;
- writing placeholder debt when repo/cache resolution misses;
- keeping placeholder debt out of the resolver cache.

Repository manifests are seed data, not hard-coded prompts. Future cloud
storage, vector search, generated variants, ImageAgent, and VisionAgent should
plug in behind this resolver contract instead of bypassing it.

## AssetWorld

`ai/asset-world.js` translates each `AssetManifest` into stable resource context
for later asset-side loops. It records resolved slot state, placeholder debts,
cache-hit state, publishability state, and `cloudPromotionQueue` for generated
or edited assets that are repo eligible.

This is the asset-side sibling of `ProjectWorld`: LLMs should not receive the
whole asset repository or raw image corpus. They should receive a narrow
AssetWorld summary plus the specific slot they own.

Expensive generated assets must not remain one-off outputs. If an ImageAgent or
future editor spends money to create an asset and the result passes validation,
the generated asset should be marked `repoEligible=true` and enter
`cloudPromotionQueue` so it can be reviewed, indexed, and reused by later games.

## Product Modules

`ai/product-modules/` is the higher-level product module truth source. These
modules are intentionally coarse and AI-friendly:

- `core.platformer`: a complete playable platformer core.
- `shell.start_screen`: a start scene shell.
- `shell.game_over_screen`: a fail-state shell that links into core fail slots.
- `meta.score`: score state/display support for cores that need it.

The compiler resolves module links before producing low-level DSL. For example,
installing `shell.game_over_screen` fills the `core.platformer` fail slot with
`scene GameOver`, so composition belongs to runtime/compiler ownership instead
of LLM1 memory.

The live LLM2 path is Intent DSL first. Product modules remain compiler truth,
but LLM2 selects them through natural game intent instead of writing module ids:

```text
LLM1 design brief
  -> LLM2 Intent Commander
  -> AI-first Intent DSL
  -> Intent Graph
  -> module/component compiler
  -> internal low-level DSL
  -> executor / ProjectWorld / ExecutionLedger
```

On `--continue`, existing `ProjectWorld.modules` are treated as the base module
set. The compiler rejects duplicate module installs, merges new modules into
the module state, rewrites the full tick runtime manifest, and can generate narrow
slot update templates against the existing `ProjectWorld` instead of replaying a whole
template.

Configured installed modules use the same closed loop:

```text
configure module id=shell.start_screen title="Moon Runner" button="Play Now"
configure module id=shell.start_screen sync=event authority=host
```

The compiler only accepts keys declared by `compiler.configureUpdateTemplates` or sync
policy fields. Text and navigation changes become targeted event replacement
diffs. Sync-only changes are metadata-only batches with zero internal DSL
commands, but still update `ProjectWorld.modules`, `ExecutionLedger`, and
`output/tick-runtime-manifest.json`.

Module manifests also own fixed interaction contracts. Display parameters such
as `button` and `hint` may be configurable, but they cannot invent triggers that
the module runtime does not implement. LLM2 sees only the natural capability and
interaction summary while writing Intent DSL; the compiler maps that intent to
module/component facts and validates configured copy before producing any
approval packet.

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

`--approval-gate` stops after Intent compilation and writes
`output/pending-approval.json`. The approval packet contains:

- LLM2 Intent DSL.
- Typed Intent Graph, Placement Plan, Bridge Plan, and Compile ResultCard.
- Compiled internal low-level DSL.
- Installed module state and tick runtime manifest.
- Dry-run preview: `nextAction`, predicted semantic hash, cache-hit status, and
  failed command summaries.

Nothing is written to `project.json` until `--approve-pending` is run.

## 项目模式

pipeline 先判断项目模式，再决定状态来源：

- 默认 live prompt 模式和 `--intent-fixture-file` fixture：新项目。会重置 `output/project.json`、`output/game.html`、`project-world.json`、`execution-ledger.json`，从空项目执行第一轮 Intent DSL。
- `--continue`：迭代现有项目。必须存在完整 Intent iteration state：`output/project.json`、`output/project-world.json` 和含至少一条运行记录的 `output/execution-ledger.json`。`project.json` 只是 GDJS 运行产物，不能单独作为 AI 继续迭代入口。

这条边界很重要：continue loop 可以基于“当前已应用的项目”追加自然 Intent DSL 和语义迭代记忆，但新项目绝不能继承上一局的 world/ledger。

## 目标管线

```text
prompt / iteration request
  -> project state summary
  -> lightweight creative context
  -> LLM1 creative design intent
  -> sanitized ProjectWorld and AI-first capability cards
  -> LLM2 natural Intent DSL
  -> Intent Graph / Resolver / Compiler / Bridge
  -> typed operation executor
  -> versioned project state
  -> runnable build
```

LangGraph integration is owned by `langgraph-runtime.js`. It loads the official
`@langchain/langgraph` package, compiles the canonical Intent owner sequence into
a `StateGraph`, and keeps every node behind the same `PipelineState`
view/state-write contract used by the local graph runner. `PipelineState` is
Intent-only; graph node writes are contract-scoped state updates, not product or
operation-artifact compatibility. The local runner remains for fast contract
checks; production orchestration should enter through the LangGraph runtime
instead of bypassing node contracts.

## LLM 可见信息边界

LLM1 不记忆模板结构，也不负责输出可执行修改。它看到用户意图、当前游戏体验摘要和少量能力提示，负责提出高层玩法和体验变化。

LLM2 看到 IntentWorldView、安全 ProjectWorld 摘要、语义试玩证据、自然能力摘要和 LLM1 的创意输出。它负责选择或编写自然 Intent DSL。

完整模板不应该作为主要上下文展示给任一阶段。LLM1 只需要能力提示；LLM2 需要的是自然游戏世界能力和安全 repair intent 候选，而不是整套游戏模板或内部 DSL 命令表。

`project.json` 是 GDevelop/GDJS 的运行产物，不是 LLM2 的主要上下文。LLM2 的循环上下文应该是 `IntentWorldView`、安全 `ProjectWorld` 摘要、语义试玩证据、上一轮自然 Intent、Semantic Iteration Memory 和 owner-routed diagnostics，用来判断当前体验、剩余问题和可执行的自然修复意图。

## LLM2 修复循环

首轮 LLM2 输出作为 `apply_intent` 执行。每次执行都会追加 `ExecutionReport`，并写入 Semantic Playtest 结果、IntentWorldView 和语义改善对比。

当 parser/surface 层失败时，pipeline 最多让 LLM2 重写自然 Intent：

- 输入安全 `IntentWorldView` / `ProjectWorld` 摘要。
- 输入上一轮自然 Intent 和 surface diagnostic。
- 只允许输出修正后的自然 Intent DSL。

当 Intent 已经编译到 Resolver、Bridge、Runtime 或 Playtest，失败必须由对应 owner 修复。LLM2 不接收坐标、组件 id、runtime adapter、Bridge Plan 或低层 DSL，也不能为这些层写修复命令。

如果修复轮后仍然失败，pipeline 设置失败退出码，并保留当前 `output/project.json`、`project-world.json` 和 `execution-ledger.json` 供下一次诊断。

## Fixture 测试

`npm run test:ai` 使用 `ai/fixtures/` 中的 Intent fixture 和结构化 runtime tests 验证状态机，不调用 LLM：

- `intent-mobile-platformer.dsl`：覆盖 Intent DSL 到可运行项目。
- `intent-parkour-real.dsl`：覆盖语义试玩和修复闭环。

Intent fixture 和 runtime tests 会验证：

- 新项目会重置 `ProjectWorld` 和 `ExecutionLedger`。
- 等价新项目重复生成时 `semanticHash` 命中，`project.json` 字节稳定。
- 失败命令进入 `ExecutionReport.failed`。
- 修复 DSL 以 `repair_01` batch 追加执行。
- 每个 pipeline 子进程有 15 秒 timeout guard，ledger run 数有上限，防止内部循环悄悄卡住。

## 命令

```bash
# 离线 Intent fixture 生成
node ai/pipeline.js --intent-fixture-file ai/fixtures/intent-mobile-platformer.dsl

`--intent-fixture-file` is an Intent artifact entry. It accepts only offline fixtures under `ai/fixtures/intent-*.dsl` or generated repair artifacts under `output/*.intent.dsl`; it is not a general external Intent file path.

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
