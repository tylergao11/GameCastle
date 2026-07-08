# 联机互动模式

## 基础

GDJS 运行时提供 `getNetworkSyncData` / `updateFromNetworkSyncData`，覆盖变量、对象、图层、计时器、触发器、场景栈——这是唯一的联机基础，不依赖 GDevelop 云服务。

---

## 六种互动模式

所有联机需求归为六种**玩家之间的互动模式**，每种对应一个 network 模板：

| # | 模式 | 模板 ID | 一句话 |
|---|------|---------|--------|
| 1 | 轮流事件 | `event-room` | 每人出一招，服务器判对错 |
| 2 | 主机照镜子 | `host-snapshot` | 一个人玩，其他人看同一画面 |
| 3 | 帧同步对战 | `p2p-lockstep` | 两边输入一模一样，逐帧对齐 |
| 4 | 服务器裁判 | `server-authoritative` | 所有人发操作，服务器说了算 |
| 5 | 各自为战 | `peer-event` | 各玩各的，偶尔互相扔东西 |
| 6 | 异步社交 | `async-state` | 不在同一时间玩，状态互相可见 |

---

## 通道本质

所有模式都是 `getNetworkSyncData` 的同一个调用，只是：

| 参数 | 含义 |
|------|------|
| 取什么子集 | 全量状态 / 只取 inputs / 只取事件 |
| 什么频率发 | 每帧 / 每 100ms / 事件触发 / 存取触发 |
| 发给谁 | Host→Client / P2P / Client→Server→Client |
| 可靠性 | 必须可靠 / 可丢包 / 服务器覆盖 |

---

## 模板 = LLM1 卡片 + compiler 契约

每个 network 模板两层：

- **`llm1Card`**：反向声明"我适合什么玩家互动场景"——LLM1 拿用户描述匹配
- **`provides`/`requires`**：compiler 机械验证游戏模板是否满足联机条件

游戏模板和联机模板各自独立选择，LLM1 不猜技术参数。
