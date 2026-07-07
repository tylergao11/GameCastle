# GameCastle 架构设计

## 整体数据流

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐    ┌───────────┐
│ 一句话输入 │ →  │ Creative LLM │ →  │ Deterministic│ →  │   DSL    │ →  │  GDJS     │
│          │    │ temp=0.7     │    │ LLM temp=0   │    │ 解析+执行 │    │  Runtime  │
└──────────┘    └──────────────┘    └──────────────┘    └──────────┘    └───────────┘
                       │                    │                  │               │
                       ▼                    ▼                  ▼               ▼
                  设计稿 JSON          DSL 操作序列       project.json    platform/iframe
                  {theme, objects,     行式指令列表        GDevelop 格式    游戏展示
                   rules, layout}                         
```

## 两段式 AI 管线

### Stage 1: Creative LLM (temp=0.7)

输入用户一句话，输出结构化设计稿 JSON：

```json
{
  "theme": "太空射击",
  "objects": [
    { "name": "Ship", "shape": "rectangle", "color": "#00AAFF", "width": 48, "height": 32, "role": "player" },
    { "name": "Bullet", "shape": "rectangle", "color": "#FFFF00", "width": 4, "height": 12, "role": "bullet" }
  ],
  "rules": ["空格发射子弹", "碰到敌人重新开始", "每2秒生成敌人"],
  "difficulty": "normal",
  "controls": "左右移动，空格射击"
}
```

### Stage 2: Deterministic LLM (temp=0)

输入设计稿，输出行式 DSL 操作序列：

```
create scene name=Game first=true
create object name=Ship type=ShapePainter shape=rectangle color=#00AAFF width=48 height=32 scene=Game
place object=Ship at=400,550 scene=Game
on start -> Score=0
on key Space -> spawn Bullet at 400,500
on collision Bullet Enemy -> destroy Bullet, destroy Enemy, score+10
```

## DSL 语法

### 操作指令

```
verb target key=value key=value ...
```

- `create scene name=<name> first=true`
- `create object name=<name> type=ShapePainter shape=<shape> color=<#hex> width=<w> height=<h> scene=<scene>`
- `add behavior type=<full_type> to=<object> scene=<scene>`
- `place object=<name> at=<x>,<y> scene=<scene> [width=<w> height=<h>]`
- `set variable name=<name> value=<value> type=Number scope=global`

### 事件指令

```
on <trigger> -> <action1>, <action2>, ...
every <N>s -> <action1>, <action2>
```

**条件**: start, collision A B, key K, every Ns, var Name Op Value, is_jumping, is_falling, is_on_floor

**动作**: destroy, spawn, jump, move, score, flip, animate, camera, text, scene, restart, variable

## 关键技术决策

### 为什么两段式而非一段式？

1. **可靠性**: 创意阶段自由发散产生多样化设计，翻译阶段严格填空保证格式正确
2. **可控性**: temp=0 的翻译阶段输出确定性 DSL，不会有语法错误
3. **调试性**: 设计稿 JSON 和 DSL 均可独立审查和修改

### 为什么 ShapePainter 而非 Sprite？

1. 零素材依赖 — 纯几何图形（矩形、圆形），无需图片文件
2. 颜色多样性 — 每个对象可指定独立颜色
3. GDevelop PrimitiveDrawing 扩展原生支持

### 为什么行式 DSL 而非直接 JSON？

1. 人类可读 — 一行一个操作，便于调试
2. LLM 友好 — 比 JSON 更少的 token 消耗和格式错误
3. 易扩展 — 新增操作只需添加 EXEC 处理器

## 模块边界

### ai/pipeline.js — 主引擎
- 输入: 用户 prompt
- 输出: output/project.json + output/game.html
- 依赖: LLM HTTP API, engine/runtime/game.html 模板
- 自包含: DSL 解析器 + 事件引擎 + 操作执行器均内联

### engine/ — 游戏运行时
- 输入: project.json（通过 game.html 中的变量注入）
- 输出: 浏览器可玩游戏
- 依赖: PixiJS, Howler, 14 个 GDJS 扩展

### templates/ — 游戏模板
- 输入: 无（静态数据）
- 格式: JSON 内嵌 DSL 数组
- 用途: Mock 模式参考 + 未来模板匹配

### platform/ — 平台前端
- 输入: 用户交互
- 输出: 网页 UI
- 依赖: engine (GDJS Runtime)
