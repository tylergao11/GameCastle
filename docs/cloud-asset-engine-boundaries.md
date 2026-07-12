# 云资产引擎边界与测试门

## 所有权边界

| 组件 | 可以做 | 禁止做 |
| --- | --- | --- |
| AssetEngine | 查询、选择、物化、执行本地派生、调用模型、绑定 Runtime、提交晋升 | 直接写公共图或 BlobStore |
| CloudAssetEngine | 查询公共图、返回本地计划、物化、晋升、公共索引 | 读取 private-local、修改项目、直接生图 |
| Local Runtime | 下载校验、裁切、改色、分帧、模板装配、项目 revision 与绑定 | 使用远程 URL、发布公共资产 |
| CloudAssetLibrarianAgent | 提交归族、标签、槽位、套件、质量和下架建议 | 直接改存储、发布、读私有原图、绑定 Runtime |
| CloudGraphCommandPort | 验证并原子应用 Agent/系统命令、写回执 | 接受无 actor/reason 的隐式修改 |
| CloudBlobStorePort | 持久化与读取不可变 Blob | 决定关系、授权或 Runtime 绑定 |
| CloudRelationIndexPort | 持久化资源图主源 | 存储玩家项目本地状态 |
| CloudPromotionQueuePort | 持久化异步晋升状态 | 改写已发布 Blob |
| CloudProjectionPort | 由关系主源重建检索投影 | 成为第二份关系真相源 |
| CloudAccessPolicyPort | 判定公开查询、项目物化与晋升授权 | 改 Blob、关系、模板或 Runtime binding |

## 主链硬门

- 查询输入只有 AssetSpec、模板上下文、本地 capability 与策略，不上传玩家原图。
- CloudCandidate 的本地计划必须引用已声明 operation。
- materialize 必须校验 sha256，并产生 project-local revision 和回执。
- 本地计划可满足时禁止模型调用。
- 只有运行成功、验收通过且明确授权的最终 revision 才能进入 staging。
- simulated、test、未知授权、缺 provenance、阻塞 debt 一律拒绝发布。
- 公共 semantic tag、quality、provenance、license、bundle kind 必须来自云资产词典；玩家自由文本先编译，不直接入库。
- Template/TemplateSlot 只能投影模板词典，不允许云端创建定义。
- Agent 命令只允许 contract 的 `addRelation`、`setClassification`、`markQuality`、`createBundle`、`withdrawRevision`；无论成功或拒绝都写持久 audit receipt。
- 云库维护和晋升不得阻塞玩家生成、预览与导出。

## 测试矩阵

| 场景 | 必须证明 |
| --- | --- |
| exact | 返回单一低成本候选，不调用模型 |
| near | 返回可执行 operation，并在本地派生后满足 AssetSpec |
| template-kit | 一个查询可返回多个槽位候选，但每个 binding 仍独立验收 |
| materialize | hash 正确、路径 project-local、远程 URL 不进入 Runtime |
| duplicate promotion | 相同 hash 不重复 Blob，只补关系 |
| private/raw/simulated | 晋升被拒并产生明确 reason |
| Agent proposal | 只能通过 command port，非法关系或越权写入被拒 |
| query outage | AssetEngine 继续走本地/模型/debt，不阻塞项目 |
| projection rebuild | 可从 Blob 元数据与关系主源重建，不改变语义 hash |

## 漂移审计

禁止出现第二份 node/relation 定义、前端自定义云状态、云端复制 style 色值、旧 schema alias、
双写或“兼容旧接口”的旁路。新增字段先升级唯一契约和测试，再改实现。

线上部署必须以 Port 替换默认文件适配器：对象存储承接 Blob，关系数据库承接 RelationIndex，
持久队列与 Worker 承接 PromotionQueue，查询索引承接 ProjectionIndex。认证、授权、审核、限流
与运营告警属于这些线上适配器的部署责任；在未部署前不得把本地共享目录称为线上云库。
