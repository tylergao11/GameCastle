# Templates — 游戏原型模板

每个模板是一个 JSON 文件，内嵌 DSL 操作数组，定义了完整的游戏对象、布局和事件。

## 模板格式

```json
{
  "name": "platformer",
  "displayName": "平台跳跃",
  "description": "横版平台跳跃...",
  "dsl": [
    "create scene name=Game first=true",
    "create object name=Player type=ShapePainter ...",
    "place object=Player at=100,400 scene=Game",
    "on collision Player Coin -> destroy Coin, score+1"
  ]
}
```

## 模板列表

| 模板 | 文件 | DSL 行 | 事件数 | 描述 |
|------|------|--------|--------|------|
| platformer | `platformer/template.json` | 21 | 4 | 平台跳跃，收集金币躲避敌人 |
| avoidance | `avoidance/template.json` | 13 | 3 (含 Repeat) | 躲避掉落物，坚持越久分越高 |
| shooter | `shooter/template.json` | 15 | 3 (含 Repeat) | 横向射击，发射子弹消灭敌人 |
| breakout | `breakout/template.json` | 21 | 5 | 打砖块，反弹球消除砖块 |

## 设计原则

1. **ShapePainter 几何图形** — 零素材依赖，所有对象用矩形/圆形 + 颜色表示
2. **DSL 优先** — 模板即 DSL 数组，可直接被 pipeline mock 模式使用
3. **颜色多样化** — 不同角色用不同颜色区分（蓝色玩家、红色敌人、金色金币）
4. **事件覆盖核心玩法** — collision + key + every + score 组合

## 使用方式

```bash
# Mock 模式使用内置 platformer DSL（与 platformer/template.json 一致）
node ai/pipeline.js --mock "平台跳跃"

# 真实 AI 模式中，LLM 生成的 DSL 与模板格式相同
```

## 与旧方案的区别

早期方案使用 `project.json` + `__PARAM__` 占位符（AI 只填参数）。当前方案使用 DSL 数组，AI 生成完整的 DSL 操作序列，更灵活、表达能力更强。
