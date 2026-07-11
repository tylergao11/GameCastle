# 资产引擎测试与边界门

## 骨架门

- 总契约、风格词典、本地派生契约和 BuildContract schema 均存在。
- stage、graph、port、artifact、debt code 的 ID 唯一。
- 每个 stage 有 owner、input、output 和真实 implementation status。
- 声明 module 的阶段必须存在对应文件。
- 未注入实现的 capability 必须抛出 `CAPABILITY_UNIMPLEMENTED`。
- 非法状态迁移和缺字段产物必须 fail-closed。

## 后续实现测试矩阵

| 层 | 必测内容 | 失败出口 |
|---|---|---|
| Contract | schema、版本迁移、必填字段、枚举 | CONTRACT_INVALID |
| Resolver | 本地/缓存/云 exact/near/无候选顺序 | NO_CANDIDATE |
| Pixels | alpha、bounds、尺寸、hash、帧网格 | REVIEW_REJECTED |
| Derivation | 每个 op 的确定性、父版本、回执 | CAPABILITY_UNIMPLEMENTED |
| Model policy | 无 provider、超预算、隐私拒绝、模拟标签 | MODEL_UNAVAILABLE / BUDGET |
| Review loop | pass、repairable、reject、循环上限 | REPAIR_EXHAUSTED |
| Repository | 下载固化、license、provenance、去重 | LICENSE_UNKNOWN |
| Revision | 每个 binding 的 revision、父版本、hash 与操作回执 | CONTRACT_INVALID |
| Binding | manifest 与 Runtime 资源/对象一致 | BINDING_FAILED |
| Export | 发布目录 hash、无阻塞债务、离线可玩 | 阻止 final release |
| Cloud promotion | 无显式申请不上传、验收失败不上传 | PromotionRejection |

## 端到端场景

1. 用户跳过手绘，本地缓存命中并绑定。
2. 用户上传简笔画，本地美化、裁切、透明化、设置尺寸并绑定。
3. 云端精确命中，下载到项目本地后绑定。
4. 云端近似命中，本地改色成功，不调用模型。
5. 云端近似命中但需新增像素，ImageEdit 后审查和修复。
6. 完全无候选，生成一张三图标 sheet，本地切成三个 PNG 后逐个绑定。
7. 模型缺失，仍以 placeholder debt 完成可恢复的离线流程。
8. Runtime manifest 有记录但游戏对象未加载资产，测试必须失败。
9. 资产验收通过但无显式晋升请求，云库保持不变。

## 当前骨架测试

`node ai/check-asset-engine-skeleton.js` 只证明骨架一致性，不证明各阶段业务实现完成。各阶段只有补齐上述测试证据后才能修改 implementation status。
