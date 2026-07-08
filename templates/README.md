# Templates — 当前能力样例

`templates/` 当前保存的是早期游戏原型样例。它们可以帮助验证 DSL 能力，但不能作为长期的“完整小游戏模板库”继续扩展。

GameCastle 的目标是模块化游戏工厂。模块能力真相源已经放在 `ai/capabilities/`；本目录保留为早期完整原型样例和 DSL fixture 参考，不再作为 LLM 上下文的主要来源。

## 当前样例

| 样例 | 文件 | 覆盖能力 |
|------|------|----------|
| platformer | `platformer/template.json` | 平台移动、跳跃、收集、碰撞、计分 |
| avoidance | `avoidance/template.json` | 定时生成、躲避、碰撞、计分 |
| shooter | `shooter/template.json` | 射击、子弹、敌人生成、碰撞、计分 |
| breakout | `breakout/template.json` | 球、砖块、反弹、碰撞、胜负条件 |

## 目标格式方向

```json
{
  "id": "capability.platformer.jump",
  "requires": {
    "objects": ["player"],
    "behaviors": ["PlatformBehavior::PlatformerObjectBehavior"],
    "variables": []
  },
  "provides": ["jump", "left_right_movement"],
  "dslExamples": [
    "add behavior type=PlatformBehavior::PlatformerObjectBehavior to=Player scene=Game",
    "on key Space -> jump Player 500"
  ],
  "compatibleWith": ["capability.collectible", "capability.enemy.collision"],
  "sync": {
    "mode": "input",
    "deterministic": true
  }
}
```

## LLM 使用边界

LLM1 只应该看到从 `ai/capabilities/` 派生的轻量能力提示，例如“支持平台跳跃、射击、收集、敌人、Boss、联机雏形”。它不应该看到模板结构、完整能力 schema 或 DSL 示例。

LLM2 可以看到 `ai/capabilities/` 的模块能力 schema、DSL 示例和参数约束，并负责把 LLM1 的高层意图编译成 patch。

两个阶段都不应该把完整样例当作可直接复制的最终游戏。
