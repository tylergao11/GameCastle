# 完整项目所有权边界

## Owner 表

| Owner | 唯一拥有 | 可以读取 | 禁止 |
| --- | --- | --- | --- |
| PlatformIntentEntry | 用户自然请求、可选输入、展示状态 | RunSnapshot、自然报告 | 编译玩法、写项目文件、解析日志 |
| Semantic Engine / IntentAgent | CreativeVision、Intent、不可变 BuildContract | 安全 ProjectWorld、Playtest evidence | 读取目标代码、资产原图、直接修改 Runtime；后续 owner 反写 BuildContract |
| ProductModuleSystem | WP2 跨 owner 交付顺序和总门 | 各 WP2 artifact 与 evidence | 接管语义、坐标、编译或仓库领域真相 |
| ProductModulePlanner | 语义覆盖、批准模块选择、依赖冲突和 continue delta | 不可变 BuildContract、现有语义词典、模块 manifest、ProjectWorld | 发明语义、输出 target-plan、在线造模块 |
| SpatialCompositionPlanner | 宏观 topology、语义区域、空间角色和节奏 | Requirement、Composition、ModuleDeclaration | 输出最终坐标、复制 archetype 固定布局 |
| ProductModuleCompiler | 两阶段声明/编译、槽链接、ownership receipt、remove/replace | Composition、Placement、批准 manifest | 让 LLM 输出模块实现、临时修项目、解释用户意图 |
| ProductModuleFoundry | 离线 fixture 提取与候选模块验证包 | ModuleDebt、获许可 fixture、现有能力索引 | 进入在线 create/continue、直接批准或发布候选 |
| Asset Engine | AssetSpec、解析顺序、项目资产、AssetWorld | BuildContract、云候选 | 拥有项目生命周期、直接发布公共资产 |
| CloudAssetEngine | 公共资产 revision、关系、晋升和物化 | 受控 AssetSpec、公共 metadata | 保存个人项目、读取 private-local 原图 |
| ProjectWeaveRuntime | 图执行、checkpoint、resume、owner route | 各 owner 的契约 artifact | 复制语义、像素、模块或 Runtime 算法 |
| RuntimeLinker | 项目装配与 Runtime bindings | Bridge Plan、AssetWorld | 选择游戏意图、使用远程资产 URL |
| RuntimeValidator | 可玩性、artifact、发布阻断检查 | Runtime report、ProjectWorld、AssetWorld | 自动掩盖失败或改业务真相 |
| ProjectStore | 项目索引、版本、rollback、active workspace | ProjectRun 成功 artifact | 充当公共资产库或发布站点 |
| Publisher | release gate、不可变发布、撤回 | ProjectVersion、Validation、AssetManifest | 发布 mutable workspace、隐式上传 |
| ProjectCloudService | 身份、项目所有权、同步、配额 | ProjectVersion、PublishReceipt | 复用公共资产云保存个人项目 |
| MultiplayerRuntime | 房间、player slot、同步、重连 | compiled network plan、release | 选择玩法、创建第二 tick owner |
| OperationsBoundary | telemetry、成本、安全、迁移、SLO | 结构化 receipts/events | 把日志当领域真相、记录密钥或私有内容 |

## 数据区

| 数据区 | 可见范围 | 真相 owner | 发布规则 |
| --- | --- | --- | --- |
| private-local input | 当前设备/项目 | ProjectStore + Asset Engine | 默认永不上传 |
| project workspace | 当前项目 | ProjectStore | mutable，不直接服务玩家 |
| project version | 项目所有者 | ProjectStore / ProjectCloud | immutable，可回滚 |
| cloud-shared asset | 全用户 | CloudAssetEngine | 仅批准晋升 |
| release candidate | 项目发布流程 | ReleaseAssembler | 必须验证后提交 |
| published release | 目标受众 | Publisher | immutable、可撤回、不可原地修改 |
| room/session state | 当前房间 | MultiplayerRuntime | 按生命周期清理或持久化 |
| telemetry | 运维 | OperationsBoundary | 去私密、结构化、限保留期 |

## 关键边界

### 公共资产云不等于个人项目云

CloudAssetEngine 只保存全用户可复用、已授权的资产。ProjectCloudService 保存项目版本、所有权和
发布关系。二者可引用同一公开 revisionId，但不得共享私有原图、权限表或生命周期状态。

### Playable 不等于 Publishable

缺少非关键美术时可以用明确 debt 得到可玩版本；存在 blocking debt、失败 Validation、未知授权、
远程 Runtime URL、缺失 hash 或未固定 Provider provenance 时禁止发布。

### Repair 不等于重新生成

修复必须路由给问题 owner：Intent、模块、Asset、Bridge、Runtime、Publish、Network 各自处理。
Project Weave 只重放受影响节点；不得每次从空项目重新生成，也不得让 LLM 修改目标代码绕过 owner。

### UI 简单不等于契约宽松

用户可以说任何自然语言，但进入系统后必须编译为稳定 ID、模块、模板槽和 artifact。UI 不要求
玩家学习这些 ID，也不能为了方便在浏览器里维护第二份项目状态。

## 发布硬门

- 必须存在 ProjectWorld、AssetWorld、ProjectVersion 与 content hash。
- RuntimeValidator 和 SemanticPlaytest 均通过，或所有剩余 debt 明确不阻断发布。
- 资产均为 project-local binding，许可与 provenance 可追溯。
- ReleaseManifest 只引用 allowlist 文件，不暴露 output、日志、checkpoint 或密钥。
- 用户明确执行 publish；自动保存、试玩和云同步都不等于发布授权。
- 发布后修改产生新版本和新 releaseId，不能覆盖旧 release。

## 禁止兼容策略

项目尚未上线。实现工作包时直接删除被新 owner 取代的旧路径，不保留字段 alias、双写、旧 Runtime、
旧发布入口或前端 fallback。确需迁移时必须另立 MigrationContract，不能污染 live contract。
