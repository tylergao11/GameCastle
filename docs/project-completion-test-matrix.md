# 完整项目测试矩阵

## 测试层级

| 层级 | 证明内容 | 不能证明 |
| --- | --- | --- |
| Contract | schema、owner、引用和硬门一致 | Runtime 真能运行 |
| Domain | 单个语义/资产/云库/模块 owner 行为 | 总编排闭环 |
| Project Graph | artifact 真实流转、checkpoint、owner route | 浏览器体验与线上部署 |
| Browser E2E | 用户创建、试玩、继续、取消、回滚 | 多用户与服务稳定性 |
| Publish E2E | immutable release、权限、撤回 | 多人房间正确性 |
| Multiplayer E2E | 两客户端同步、重连、房间清理 | 大规模容量与运维 |
| Operations | 安全、负载、成本、备份、迁移 | 新玩法语义正确性 |

## WP 验收矩阵

| WP | 正常路径 | 失败路径 | 恢复路径 | 最终证据 |
| --- | --- | --- | --- | --- |
| WP0 | create/continue 完整 Project Weave | 任一 owner 报错 | checkpoint resume、cancel rollback | 正式 graph trace + `check:project` |
| WP1 | 每个 role 一次授权 live smoke | timeout、预算、无凭据、错误响应 | fail closed、重试上限、receipt | provider matrix |
| WP2 | 五类玩法各两种 topology create + minimal-delta continue | 未解析语义、模块冲突、缺槽、无能力、不支持 topology、未批准 revision、legacy target-plan 旁路 | 明确 owner debt、上一 playable 保留、catalog/需求修正后重试；Foundry 不在线运行 | 10 create + 5 continue playable fixtures、remove/replace receipt、browser/playtest evidence、独立测试与审计 |
| WP3 | 两项目隔离、保存版本 | 崩溃、写入中断、版本冲突 | transaction rollback、restart continue | version/rollback receipts |
| WP4 | 一句话到试玩再修改 | 取消、repair 耗尽、Runtime 失败 | 上一 release 继续可玩 | browser screenshots + API trace |
| WP5 | publish/share/withdraw | blocking debt、许可、hash、allowlist 失败 | 回滚旧 release | PublishReceipt + hosted E2E |
| WP6 | 登录、同步、跨设备拉取 | 越权、配额、并发冲突 | 版本协调或显式冲突 | two-user isolation |
| WP7 | 建房、加入、同步 | 丢包、乱序、掉线、作弊边界 | reconnect、room cleanup | two-client E2E |
| WP8 | telemetry、成本、备份 | 注入、泄密、超额、迁移失败 | 限流、恢复、回滚 migration | security/load/restore reports |

## Local Creator Complete 场景

1. 用户只输入一句自然语言，不上传图、不选模板，得到第一个可玩版本。
2. 用户先手绘或上传，Runtime 本地处理并进入同一项目链。
3. 云库命中、近似派生和无资源生图分别进入同一 Runtime binding。
4. 用户要求增加角色、改变规则或更换风格，只重编译受影响 owner。
5. Runtime 或 Provider 失败时上一可玩版本仍存在，用户看到自然语言恢复建议。
6. 重启应用后可继续同一 ProjectVersion。
7. 两个项目的 workspace、AssetWorld、ProjectWorld 和版本互不污染。

## 总门规则

- `check:project` 必须显式聚合当前 milestone 的全部 required tests。
- 单测存在但未进入总门，视为没有持续完成证据。
- simulated/mock 只验证控制流；需要 live provider、浏览器、多人或部署的里程碑必须有对应 smoke/E2E。
- 发布构建必须从干净 transaction workspace 产生，验证实际输出而不是只检查源文件。
- Writer、Tester、Auditor 三个 pass 分开记录；无法独立代理时必须标明例外，不得宣称等价独立审计。
