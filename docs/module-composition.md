# 模块组合规则

GameCastle 的游戏不是代码生成结果，而是由可声明、可匹配、可编译的模块组合而成。

```
一个游戏 = gameplay模块 × N  +  shell模块 × N  +  network模块 × 1
```

gameplay、shell、network 是**同级组合单元**。没有底层基础设施。

---

## 模块声明

每个模块必须声明 `provides`（我提供什么）和 `requires`（我需要什么）。

compiler 做机械匹配，不做语义猜测。

### Gameplay 模块

```json
{
  "id": "core.platformer",
  "category": "gameplay",
  "provides": {
    "gameLoop": "platformer",
    "playerCount": { "min": 1, "max": 4 },
    "objects": ["Player", "Ground", "Coin", "Enemy"],
    "inputs": ["move_left", "move_right", "jump"]
  },
  "networking": {
    "supports": {
      "syncModels": ["local", "snapshot", "lockstep"],
      "authority": ["host", "server", "each-owns-own"],
      "players": { "min": 1, "max": 4 }
    },
    "determinism": {
      "supported": true
    },
    "inputs": ["move_left", "move_right", "jump"],
    "state": ["Score", "Player", "Coin", "Enemy"]
  },
  "compiler": {
    "dsl": [ "create scene name=Game ...", "on collision Player Coin -> score+1" ]
  }
}
```

### Network 模块

```json
{
  "id": "network.p2p-lockstep",
  "category": "network",
  "provides": {
    "syncModel": "lockstep",
    "topology": "peer-to-peer",
    "players": { "min": 2, "max": 2 }
  },
  "requires": {
    "gameplay": {
      "deterministic": true,
      "declaredInputs": true
    }
  },
  "compiler": {
    "dsl": [ "install network sync=lockstep tickRate=20", "sync input {{inputs}}" ]
  }
}
```

---

## 匹配规则

compiler 检查：

1. `gameplay.networking.supports` 包含 `network.provides.syncModel`
2. `gameplay.networking.determinism.supported >= network.requires.gameplay.deterministic`
3. 玩家数在各模块范围内
4. network 要求的 declaredInputs/declaredState 在 gameplay 中存在

不满足 → 拒绝，返回原因。

---



## 联机模块

网络模板和游戏模板是同级组合单元，两轴独立选择。LLM1 同时看游戏卡片和联机卡片，各自匹配。

六种互动模式覆盖所有联机需求：event-room / host-snapshot / p2p-lockstep / server-authoritative / peer-event / async-state。

详见 [联机同步模型](./network-sync-model.md)。

## 关键约束

- 模块之间不引用实现细节。requires 只声明接口需求。
- network 模块是契约声明，不包含协议代码。compiler 按 transport/codec 择入实现文件。
- 一个游戏最多一个 network 模块。
- compiler 做确定性匹配，AI 只负责从候选集选择模块。
