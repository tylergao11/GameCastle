# GameCastle 实施路线图

## Phase 1: 骨架搭建 ✅

- [x] 目录结构
- [x] 模块 README
- [x] 平台前端骨架 (HTML/CSS)
- [x] System prompt 模板
- [x] GDevelop 类型定义 (operations.ts + gdevelop-types.ts)

## Phase 2: 核心管线 ✅

- [x] 行式 DSL 解析器 (`parseLine` / `parseDSL`)
- [x] 事件 DSL 解析器 (`parseEventDSL` / `parseTrigger` / `parseAction`)
- [x] 事件模板引擎 (9 CONDITIONS + 15 ACTIONS)
- [x] 操作执行器 (11 EXEC handlers: scene/object/behavior/place/var/event/layer)
- [x] 两段式 AI 管线 (Creative LLM temp=0.7 + Deterministic LLM temp=0)
- [x] Mock 模式（内置 platformer DSL，无需 LLM 即可测试）
- [x] 4 个游戏模板 (platformer / avoidance / shooter / breakout)
- [x] `output/project.json` + `output/game.html` 产出

## Phase 3: 引擎嵌入 ✅

- [x] GDJS 核心运行时 (gdjs-runtime.js)
- [x] PixiJS + Howler 渲染/音频
- [x] 14 个 GDJS 扩展 (Sprite, PlatformBehavior, ShapePainter, Text...)
- [x] game.html 启动器 (PROJECT_DATA_PLACEHOLDER 变量注入)
- [x] pipeline.js 自动生成 game.html

## Phase 4: 平台打磨

- [ ] 游戏广场（游戏列表/卡片）
- [ ] 一句话输入 → pipeline 调用（前端对接）
- [ ] iframe 游戏展示容器 + postMessage 通信
- [ ] 循环迭代（"再难一点" → remix）
- [ ] 游戏发布/分享

## Phase 5: 优化 & 扩展

- [ ] pipeline.js 与 json-engine.ts 统一（TypeScript 迁移）
- [ ] AI 素材生成（image generation skill）
- [ ] 用户账号
- [ ] 游戏排行榜
- [ ] 模板匹配（根据用户意图自动选择最接近的模板 DSL）
- [ ] 更丰富的 DSL 条件/动作（TopDownMovement, Physics, Tween 等）
