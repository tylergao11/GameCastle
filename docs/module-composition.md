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

## Network Plan

`output/network-manifest.json` keeps the per-module `syncPolicy` records for
traceability, but runtime assembly must consume the compiler-owned `plan`.

The plan has one realtime owner and zero or more side channels:

```json
{
  "realtime": {
    "sync": "lockstep",
    "authority": "host",
    "tickRate": 20,
    "inputs": ["move_left", "move_right", "jump"],
    "state": ["Player", "Score"],
    "moduleIds": ["core.platformer"]
  },
  "channels": [
    { "id": "shell.game_over_screen", "sync": "event", "authority": "host" }
  ]
}
```

Runtime ownership follows the plan:

- `lockstep`, `lockstep-input`, and `server-authoritative` are realtime modes.
  `GameCastleNetworkBridge` owns the GDJS frame loop for these modes, but it
  does not own the netcode protocol.
- `event`, `peer-event`, `async-state`, and `snapshot` are channels.
  They may share the room/transport, but they must not create another GDJS tick
  owner.
- Channel-only games connect through transport lifecycle helpers and keep the
  normal GDJS local loop.

## Frame Sync Template

Realtime modules compile into a stable three-layer runtime:

1. `GameCastleFrameSyncSession` is the pure netcode core. It owns frame numbers,
   local/remote input buffers, player slot mapping (`p1_*`, `p2_*`), input
   delay, redundant input packets, ready-frame ACKs, history pruning, and the
   disconnected/reconnected advance gate.
2. `GameCastleNetworkBridge` is only the GDJS adapter. It captures physical
   inputs, sends frame packets through transport, injects replay inputs, and
   steps GDJS at the fixed tick rate.
3. Gameplay modules only declare `networking.inputs` and `networking.state`.
   They must not implement networking behavior directly.

This follows the standard lockstep/rollback split: deterministic games exchange
input frames, not object positions. Rollback-style prediction can replace or
extend the frame-sync session later by implementing the same save/load/replay
boundary, while module DSL and GDJS bridge code remain stable.

Current template behavior:

- Lockstep waits until every required player has input for a frame before
  advancing that frame.
- Packets include recent previous frames so a later packet can fill gaps after
  packet loss or reconnect.
- Packets include the latest locally executed frame as an ACK so old history can
  be pruned.
- A disconnected session freezes advancement but keeps buffered frames; after
  reconnect it resumes from the first missing ready frame.
- Player input is always mapped through slots before replay, so two players
  never drive one shared entity by accident.

## Snapshot Sync Template

`snapshot` is the canonical realtime state template. Do not use `state` as a
sync mode name; `networking.state` remains the data contract that lists which
variables and objects a module exposes for synchronization.

Snapshot sync is also split into layers:

1. `GameCastleSnapshotSyncSession` owns snapshot sequence numbers, snapshot
   buffers, latest/full snapshot records, interpolation delay metadata, and
   history pruning.
2. `SnapshotSyncStrategy` adapts the session to transport. In `authority=host`
   mode the first player in the room publishes snapshots on the `snapshot`
   channel; clients receive and emit `snapshot` events.
3. A GDJS snapshot bridge/codec can be added above this template to read and
   apply `getNetworkSyncData` / `updateFromNetworkSyncData` without changing
   module declarations.

Product interaction names such as `host-snapshot` are selection cards. The
runtime protocol template is `snapshot`.

## Template Matrix

Canonical protocol/server templates:

- `frame-sync`: deterministic input-frame sync. Runtime owner:
  `GameCastleFrameSyncSession`; GDJS adapter: `GameCastleNetworkBridge`.
- `snapshot`: authoritative snapshot sync. Runtime owner:
  `GameCastleSnapshotSyncSession`; transport adapter: `SnapshotSyncStrategy`.
- `event`: room/peer event relay. Runtime owner:
  `GameCastleEventRelaySession`; transport adapter: `EventRelayStrategy`.
- `async-state`: asynchronous persistence. Runtime owner:
  `GameCastleAsyncPersistenceSession`; transport adapter:
  `AsyncPersistenceStrategy`.
- `server-ordered-input`: server-side input ordering. Server owner:
  `ServerOrderedInputSession`; timer wrapper: `GameLoop`.

The old `strategies/` directory is intentionally removed. New templates must be
added as canonical runtime/server files, not as compatibility wrappers.
