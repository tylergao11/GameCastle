# GameCastle 路线图

## Phase 1: 当前骨架

- [x] 仓库目录和基础文档
- [x] GDJS Runtime 嵌入
- [x] DSL 解析与执行主路径
- [x] Mock 生成 `output/project.json` + `output/game.html`
- [x] React/Vite 平台壳
- [x] 清理旧路径、临时拼装脚本和旧平台残留
- [x] 生成稳定 `ProjectWorld` 和追加式 `ExecutionLedger`
- [x] 建立 `ai/product-modules/` 唯一真相源（合并 capabilities），接入 LLM1/LLM2 上下文派生
- [x] 接入 LLM2 repair loop：失败报告 -> 追加修复 DSL diff -> 再执行
- [x] 建立 DSL fixture 测试器，覆盖状态边界、repair batch、缓存命中和超时防护
- [x] 建立产品模块 DSL 骨架：product module manifests -> Module DSL -> compiler -> internal DSL -> ProjectWorld/tick runtime manifest

## Phase 2: 模块化生成管线

- [x] 清理 `templates/` 游戏原型样例，能力迁移到 product-modules
- [x] 定义 AI-facing 产品模块 schema，保持 `core.*`、`shell.*`、`system.*`、`meta.*` 等粗颗粒模块边界
- [x] 为产品模块预留 sync/authority/tickRate/seed，同步策略写入 `output/tick-runtime-manifest.json`
- [x] Historical baseline: 将在线 LLM2 主路径切到 Module Patch Commander：Module DSL -> compiler -> internal DSL -> executor
- [x] 支持 `--continue` 基于 `ProjectWorld.modules` 追加模块，并拒绝重复安装已有模块
- [x] 闭合 `configure module`：支持已安装模块参数 patch、sync-only metadata patch、非法配置 fail-fast
- [x] 增加测试审批闸门：`--approval-gate` 生成 pending approval，人工审查后 `--approve-pending` 执行
- [x] 定义模块能力 schema：对象、变量、事件、依赖、兼容关系、运行时限制
- [x] 明确 LLM1 只看轻量能力提示和当前体验摘要，不看模板结构
- [x] 明确 LLM2 读取模块能力库、DSL 能力、参数约束和项目状态
- [x] 明确只有 LLM2 输出确定性 patch
- [ ] 把 `pipeline.js` 拆成设计、编译、执行、状态、provider 五个边界
- [x] 用 `ai/gdevelop-truth/runtime-truth.json` 统一 GDevelop runtime 类型、include 和数据字段真相源

## Phase 3: 可反复迭代的项目状态

- [x] AI-first Intent refactor: make Intent DSL the only live LLM2 product surface; do not keep Module DSL as a parallel compatibility path
- [x] Add `ai/intent-dsl.js`: parse natural Intent DSL into an AST that rejects coordinates, event indexes, GDJS instruction names, module ids, component ids, runtime adapter names, and `key=value` machine fields in the LLM2 surface
- [x] Add `ai/intent-compiler.js`: compile Intent AST into a typed Intent Graph with things, components, relations, placements, semantic values, bindings, requirements, and diagnostics
- [x] Add `ai/components/` component library schema and first manifests with split AI Manifest and Compiler Manifest views: virtual joystick, jump button, attack button, inventory
- [x] Add component inheritance/override contracts: default config keys are classified as exposed natural overrides or sealed internal defaults, and ResultCard records both inherited defaults and overrides
- [x] Add compiler-only component family inheritance: abstract parents such as `input.touch_button`, `system.storage`, and `ui.panel` provide shared defaults, bindings, bridge expansions, and runtime adapter ownership without entering the LLM2 prompt
- [x] Move runtime adapter keys, labels, panel titles, and sizing into sealed component defaults so generated runtime code consumes config instead of inferring behavior from component ids
- [x] Move runtime adapter route metadata into component manifests via `gdjsBridge.adapterRoutes`, so the GDJS bridge copies owner/mechanism evidence instead of branching on adapter ids
- [x] Enforce runtime adapter config contracts so keys, labels, inputs, panel titles, slots, persistence, and dimensions must come from inherited component config rather than codegen fallbacks
- [x] Move GDJS component object emission into manifest `gdjsBridge.objectSpec`, so target object type, visual defaults, and object/layer/placement route evidence come from inheritance instead of bridge fallbacks
- [x] Add Intent Rewrite Contract: ResultCard rewrites must carry owner, mechanism, and stage for module inference, component aliases, natural anchors, and semantic groups
- [x] Enforce rewrite/emission/runtime adapter contracts in the compiler and bridge return paths, not only in standalone checks
- [x] Add aggregate Intent Compile Contract: compiled Intent artifacts must validate graph, ResultCard, diagnostics, rewrites, placement, bridge emission, and runtime adapter evidence before returning, then expose the passed contract summary to downstream runtime surfaces
- [x] Add `ai/placement-resolver.js`: implement the Placement Contract, resolving `near/direction/distance/pattern` with screen/world/camera/object context and traceability
- [x] Add Placement Resolution Contract: resolved placements carry route evidence for safe-area placement, UI overlap avoidance, object-relative placement, contextual direction rewrite, and semantic pattern placement
- [x] Add semantic placement emission metadata: pattern/group placements carry bridge emission evidence from the Placement Plan instead of hard-coded bridge route labels
- [x] Add semantic placement edit constraints: LLM2 can say `adjust Fox placement above slightly`, while placement resolver and GDJS bridge own numeric step planning and target emission
- [x] Add `ai/gdjs-bridge.js`: compile Intent Graph and placement plan into internal low-level DSL and runtime adapter requirements
- [x] Add GDJS Bridge Emission Contract: every emitted internal DSL target line carries owner/source/mechanism and optional route evidence
- [x] Add Runtime Adapter Requirement Contract: adapter needs carry runtime owner/source/mechanism/route evidence for touch controls and inventory systems
- [x] Add `ai/intent-runtime-codegen.js` and `--intent-dsl-file`: generate HTML intent runtime adapters from bridge requirements and execute Intent fixtures through the bridge path
- [x] Switch live Stage2 LLM2 path to Intent Commander: Intent DSL -> Intent Compiler -> Bridge Plan -> internal DSL -> executor; keep Module DSL only as explicit fixture/internal migration input
- [x] Add Compile ResultCard with input, resolved symbols, auto-added defaults, placement decisions, emitted target code, warnings, and owner trace
- [x] Add DSL Growth Control and Rewrite Contract checks: GDJS bridge issues must route to symbol rewrite, inheritance, component manifest, placement, bridge target rewrite, or owner diagnostics before any new LLM2-facing DSL concept is admitted
- [x] Add bridge issue routing fixtures for touch controls, UI overlap, collision masks, inventory persistence, networked input, and awkward GDJS parameters; each fixture must prove no new LLM2-facing syntax was needed
- [x] Add owner-routed diagnostics for compiler, placement, and bridge failures so failures carry `routeId`, `routeOwner`, `routeMechanism`, and `nextAction`
- [x] Enforce Intent compile repair routing: parser/surface errors may use LLM2 repair, but system-owner diagnostics fail fast instead of leaking into LLM2 repair
- [x] Update approval gate to include Intent DSL, typed Intent Graph, Bridge Plan, aggregate Intent compile contract, Compile ResultCard, compiled internal DSL, runtime adapter requirements, and dry-run command results
- [x] Store AI-first Intent, aggregate compile contract, and GDJS Bridge summaries in `ProjectWorld` and `ExecutionReport`, while keeping raw Intent wording out of `semanticHash`
- [x] Sanitize ProjectWorld/ExecutionReport before Intent Commander prompts so LLM2 sees game-world planning context instead of component ids, runtime adapter ids, coordinates, bridge plans, or target DSL commands
- [x] Sanitize Intent repair prompts so prohibited machine-syntax lines are omitted instead of being repeated back to LLM2
- [x] Sanitize LLM1 design briefs and diffs before Intent Commander prompts so coordinates, object sizes, variable values, and implementation defaults become natural game-world planning hints
- [x] Move RequirementModel DesignBrief contract to natural placement hints and reject coordinates, object sizes, implementation colors, and runtime variable values at validation time
- [x] Add a LangGraph-friendly `PipelineState` contract that separates internal graph slots from the LLM2-safe ProjectWorld projection
- [x] Add official `@langchain/langgraph` runtime integration through `ai/langgraph-runtime.js`, using `StateGraph` while preserving contract-bound PipelineState view/patch access
- [x] Keep a dependency-free local graph runner for fast contract tests and fallback validation
- [x] Add canonical `ai/intent-pipeline-graph.js` owner order and graph entry that can run local async handlers or generate contract-bound LangGraph nodes
- [x] Route live Intent approval/runtime PipelineState assembly through canonical graph-owned artifact replay backed by official LangGraph `StateGraph`, and persist five-node `graphTrace` evidence
- [x] Add runtime Intent fulfillment validation so ExecutionReport checks world-level things/components/placements/edits instead of treating command success alone as done
- [x] Add unified `ai/check-ai-visible-boundary.js` gate for prompts, sanitizers, PipelineState views, graph views, and approval AI projections
- [ ] Finish migrating stale docs and approval surfaces from Module DSL primary examples to Intent DSL primary examples; stale primary forms fail fast
- [ ] 完整建立项目状态模型，区分 design brief、module graph、DSL patch、ProjectWorld、project.json
- [ ] 支持用户连续修改，例如“再难一点”“加入 Boss”“改成双人”
- [ ] 让 LLM2 生成 DSL/operation patch，而不是每次重建全量项目
- [ ] 保留版本历史和回滚点
- [ ] 在平台端展示当前模块、生成步骤和可试玩版本

## Phase 4: 平台接入

- [ ] 前端创建页真正调用生成管线
- [ ] iframe 试玩 `output/game.html`
- [ ] postMessage 上报加载、分数、错误和游戏结束
- [ ] 发布到发现流
- [ ] 分享和作品管理

## Phase 5: 联机能力

- [x] 定义六种互动模式（轮流事件、主机照镜子、帧同步对战、服务器裁判、各自为战、异步社交）
- [x] 四种同步模型（event / snapshot / lockstep-input / server-authoritative）+ 两种扩展（peer-event / async-state）
- [x] 所有同步基于 GDJS getNetworkSyncData/updateFromNetworkSyncData，不依赖 GDevelop 云服务
- [x] ~~engine/network/ 骨架代码~~ → 已删除，统一为 ai/network-runtime/ + RuntimeAdapter 架构
- [x] 6 个 network 模板，llm1Card 反向声明互动模式
- [x] server/signaling-server.js 信令服务器（单端口、所有游戏共用）
- [x] game template 和 network template 两轴独立选择
- [ ] llm1Card 接入 LLM1 卡片流（network 模板暂未喂给 LLM1）
- [ ] 联机编译接入 html-exporter
- [x] 联机冒烟测试 + lockstep 测试通过（server/test-smoke.js, server/test-lockstep.js）

## Phase 5.5: 联机架构 v2（2026-07）

- [x] RuntimeAdapter 隔离 GDevelop（公开 API 注入，不碰私有字段）
- [x] tick-intent-bridge.js 重写：Bridge 接管帧推进，固定 tick + 正确输入顺序
- [x] 删除 engine/network/ 旧层，消除双栈不兼容
- [x] server load_state 按 playerId 隔离
- [x] GameLoop 处理上限防死循环
- [x] Room 支持 inputDelay 透传

## Phase 6: 质量门

- [ ] 生成器单元测试
- [x] DSL fixture 测试
- [ ] `project.json` schema 校验
- [ ] 浏览器运行时冒烟测试
- [ ] 前端 lint/typecheck/build 纳入根命令
