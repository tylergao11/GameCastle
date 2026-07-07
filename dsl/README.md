# DSL — 行式指令语言

GameCastle 使用行式 DSL 作为用户意图和 GDevelop JSON 之间的中间表示。

## 操作指令

```
verb target key=value key=value ...
```

### 可用操作

| 操作 | 语法 | 说明 |
|------|------|------|
| `create scene` | `create scene name=<name> first=true` | 创建场景 |
| `create object` | `create object name=<name> type=ShapePainter shape=<rect\|circle> color=#RRGGBB width=<w> height=<h> scene=<s>` | 创建几何图形对象 |
| `create object` | `create object name=<name> type=Text scene=<s> size=<n>` | 创建文本对象 |
| `add behavior` | `add behavior type=<full_type> to=<obj> scene=<s>` | 添加行为（如 Platformer） |
| `place` | `place object=<name> at=<x>,<y> scene=<s> [width=<w> height=<h>]` | 放置实例到场景 |
| `set variable` | `set variable name=<name> value=<val> type=Number` | 设置全局变量 |
| `delete scene` | `delete scene name=<name>` | 删除场景 |
| `delete object` | `delete object name=<name> scene=<s>` | 删除对象 |
| `add layer` | `add layer name=<name> scene=<s>` | 添加图层 |

## 事件指令

```
on <trigger> -> <action1>, <action2>, ...
every <N>s -> <action1>, <action2>
```

### 条件（trigger）

| 语法 | 说明 |
|------|------|
| `on start` | 场景开始时 |
| `on collision A B` | A 和 B 碰撞时 |
| `on key K` | 按键 K（up/down/left/right/space） |
| `on var Name Op Value` | 变量条件 |
| `every Ns` | 每 N 秒（Repeat 子事件） |
| `on is_jumping Obj` | 平台跳跃中 |
| `on is_falling Obj` | 下落中 |
| `on is_on_floor Obj` | 着地时 |

### 动作（action）

| 语法 | 说明 |
|------|------|
| `destroy Obj` | 销毁对象 |
| `spawn Obj at X,Y` | 生成对象 |
| `jump Obj Strength` | 施加向上力 |
| `move Obj to X,Y` | 移动到坐标 |
| `score+N / score-N` | 增减分数 |
| `score=N` | 设置分数 |
| `flip Obj left/right` | 翻转方向 |
| `animate Obj Name` | 切换动画 |
| `camera Obj` | 相机跟随 |
| `text Obj "content"` | 设置文本 |
| `scene Name` | 切换场景 |
| `restart` | 重启游戏 |

## 示例：Platformer

```
create scene name=Game first=true
create object name=Player type=ShapePainter shape=rectangle color=#4488FF width=32 height=48 scene=Game
create object name=Coin type=ShapePainter shape=circle color=#FFD700 width=16 height=16 scene=Game
add behavior type=PlatformBehavior::PlatformerObjectBehavior to=Player scene=Game
set variable name=Score value=0 type=Number
place object=Player at=100,400 scene=Game
place object=Coin at=240,430 scene=Game
on start -> Score=0
on collision Player Coin -> destroy Coin, score+1
on key Space -> jump Player 500
```
