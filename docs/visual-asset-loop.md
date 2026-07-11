# 视觉资产闭环

## 目标

视觉资产闭环让用户以最低成本把想法变成可运行游戏中的可编辑资产。
它服务于已经完成的语义引擎，不替代或绕过语义引擎：语义层声明需要的
对象、UI 槽位和风格约束；资产层负责取得、编辑、审查并绑定实际视觉资源。

用户应能从本地画图、上传图片、云资源、确定性变体或模型绘制开始，并得到
可撤销、可导出 PNG、可追溯、可再次复用的资产版本。

## 不可变优先级

每个资产槽位必须按以下顺序解析；任一后续节点不得绕过前序节点直接执行：

```text
localExplicit
  -> localExactCache
  -> cloudRepoExact / cloudRepoSemantic
  -> deterministicVariant
  -> constrainedModelEdit
  -> imageGeneration
  -> runtimePlaceholder
```

含义如下：

1. **本地优先。** 用户简笔画和上传文件留在本地项目资产库，可立即使用。它们
   不会自动上传云端、不会自动送入识图或生图模型。
2. **云端复用第二。** 没有合适本地资产时，检索私有/授权云资源；命中后复制或
   缓存到项目本地，运行和导出不得依赖远端 URL。
3. **先做确定性变体。** 裁切、擦除为透明、缩放、改色、调色板映射、描边、图层
   合成等操作在本地完成，不调用模型。它们产生带父版本和操作参数的 `AssetRevision`。
4. **受控模型微调。** 只有确定性操作无法补出所需像素时，才允许以现有 revision、
   可选 mask 和目标约束为输入做局部编辑。该结果仍是 `variant`，不是全新资产。
5. **最后才绘制。** 没有可复用或可变体资产时，才允许 ImageAgent 生成全新候选。
6. **占位符是债务。** 它只保证试玩不中断；不可发布、不可缓存为成功结果、不可晋升云库。

`localExactCache` 是同一原图/变体操作的内部零成本缓存，不改变“本地优先”的
产品语义。

## 资产事实与版本

资产不是单一文件。实现必须以以下契约作为唯一事实源，后续写入
`ai/contracts/schema.json` 并由运行时校验：

| 契约 | 责任 |
|---|---|
| `AssetSpec` | 槽位需求：用途、尺寸、透明度、语义/风格标签、许可、预算和绑定目标。 |
| `AssetRecord` | 原始文件事实：内容哈希、来源、许可、格式、尺寸、作者或模型 provenance。 |
| `AssetRevision` | 不可变操作链：父 revision、裁切框、擦除 mask、色彩变换、模型编辑输入和输出。 |
| `TemplateSpec` | UI 布局、主题 token、组件槽位、状态和断点；不是一张页面截图。 |
| `AssetBinding` | 已批准 revision 绑定到项目对象、场景层、动画帧或 UI 槽位的事实。 |
| `AssetReview` | VisionAgent 或确定性检查的结构化审查结论，不能直接变更资产。 |

原始上传和简笔画永不被覆盖。裁切、擦除、改色、模型编辑和 PNG 导出都必须从
revision 生成派生产物，以支持撤销、重做、复用与审计。

## 规范 LangGraph

资产链是 `Project Weave Graph` 内的条件子图。它在 `IntentCompiler` 产出
`BuildContract.assetSlots` 后运行，并在 `RuntimeLinker` 前输出 `AssetManifest` 和
`AssetWorld`。LLM2 不直接进入此子图。

```text
asset-intake
  -> asset-resolver
       -> [local] deterministic-validation
       -> [cloud exact] asset-materialize -> deterministic-validation
       -> [cloud near] deterministic-variant
                            -> [satisfied] deterministic-validation
                            -> [needs pixels] image-edit
       -> [no candidate] image-generation

image-edit / image-generation
  -> vision-review
       -> [approved] deterministic-validation
       -> [repairable and within limit] asset-repair-plan
                                      -> image-edit / image-generation
       -> [rejected, timeout, or budget exhausted] placeholder-debt

local / cloud exact / deterministic-variant
  -> deterministic-validation

deterministic-validation
  -> asset-acceptance-gate
       -> [accepted] asset-finalize
       -> [rejected] placeholder-debt

asset-finalize / placeholder-debt
  -> asset-manifest
  -> asset-world
  -> runtime-linker
```

### 节点状态与循环限制

资产子图只读写以下显式状态：

```text
assetSpec
resolutionDecision
sourceRevision
candidateRevision
assetReview
repairPlan
attemptCount
costLedger
deterministicValidation
acceptanceDecision
acceptedRevision
assetBindingPlan
assetManifest
assetWorld
```

- `ImageGeneration` 只能由 `resolutionDecision = generation_required` 进入。
- `ImageEdit` 必须有 `sourceRevision`；没有父版本不得使用“微调”路径。
- `VisionReview` 只写 `AssetReview`，无权批准云端资源或写入 manifest。
- 所有本地、云端、变体和模型候选都必须先通过 `DeterministicValidation`，再由
  `AssetAcceptanceGate` 写入 `acceptanceDecision`；没有接受决定不得写 manifest 或 binding。
- 每个 slot 的模型候选总次数默认最多 2 次；预算、超时或用户取消立即终止循环。
- `AssetRepairPlan` 只能引用 Vision 给出的可验证缺陷，例如透明背景缺失、文字错误、
  主体不符合槽位；不得把游戏内部目标计划或自由提示词回灌给模型。
- `attemptCount` 和 `costLedger` 必须以 `runId + slotId + AssetSpec hash` 持久化。重启或
  再次调用图不能重置模型次数或预算；同一幂等键应返回已有结果或明确恢复记录。

节点 owner 固定为：`AssetMaterialize` 归 CloudLibraryManager，`DeterministicVariant` 与
`DeterministicValidation` 归 AssetRevision 服务，`AssetRepairPlan` 与
`AssetAcceptanceGate` 归 AssetAcceptanceGate，`AssetFinalize/AssetManifest` 归
RuntimeAssetResolver，`AssetBinding` 归 RuntimeLinker。任何节点都不能兼任其他节点的
禁止写入。

资产层现在以单一 `asset-weave` 条件图运行；旧的线性 smoke 已删除。`check:visual-assets`
验证本地、云端、变体、编辑、生成、Vision、预算 debt 与 RuntimeLinker 输出，防止恢复
任何“先读后写”的节点顺序。

### 当前实现状态与迁移阻断

下表是当前代码事实，不是产品能力承诺。表中“禁止接 UI”表示在完成迁移与测试前，
该路径不得被产品界面暴露为可用。

| 区域 | 当前事实 | 状态 |
|---|---|---|
| Image model port | 未配置真实 provider 时 fail-closed；不保留 stub，Asset Weave 产出 `PlaceholderDebt` 而不中断构建。 | 预留，禁止接 UI |
| VisionAgent | 角色已注册，但没有真实实现。 | 预留，禁止接 UI |
| Asset LangGraph | 两个断开的线性 smoke，且 generation 读取后置 resolver 状态。 | 迁移阻断 |
| 旧 `texture-provider` | 已删除；不得恢复云库直查、直接生图或候选直写。 | 已移除 |
| 旧 async resolver | 已删除；resolver 不得直接生成、发布或写云库。 | 已移除 |
| 云端晋升 | 当前缺少完整 consent、license、provenance、Vision 与 Acceptance 硬门。 | 迁移阻断 |

现有 `candidate/approved/promoted/rejected` 是实现状态；在新契约中 `promoted` 只表示
已进入受控复用库，**不等于 public**。公开发布必须另有 `public` scope 和用户授权。

## 生图与识图的职责

### ImageAgent

ImageAgent 是候选供应者，不是资产选择者。它只能接收受限的 `AssetSpec`、风格约束、
参考 revision 和可选 mask，并返回候选 revision、provider/model、成本、seed（若有）
及 provenance。它不能绑定游戏对象、修改云库状态或绕过 resolver。

### VisionAgent

VisionAgent 有两种受限用途：

1. 用户主动识图或后台索引本地/云端资产时，生成视觉事实卡；失败不得阻断本地使用。
2. 模型生成或模型编辑候选进入发布/云端晋升前，检查它是否满足 `AssetSpec`。

VisionAgent 只返回标签、置信度、缺陷和审查结论。它不能改写像素、自动上传用户内容、
自动发布资产或改写玩法语义。

## 成本与数据规则

- 先解析缓存与资源库，再做本地像素操作，最后调用模型。
- 裁切、擦除、PNG、缩略图、尺寸/alpha 检查和哈希均在本地执行。
- 用户上传、简笔画、参考图和模型调用均需来源记录；云端晋升需要显式允许和许可信息。
- 生图先产生候选；高成本升分辨率、公开发布或云端晋升必须在审查通过后发生。
- 模型失败不会删除原图、父 revision 或现有绑定。
- 模型/识图 endpoint 必须在 allowlist 中；提交时记录用户同意、scope、目的和发送的数据范围。
  未经同意不得把完整用户图片 base64 上传到任意配置 endpoint。
- 上传门必须先实际解码图片，校验 MIME 与文件签名一致、文件/像素上限和压缩炸弹；定义
  EXIF 清理策略，并禁止 SVG、路径和解码器成为脚本或文件系统入口。

## 完成定义

下列五条路径都须产生同样可追溯的 `AssetRevision -> AssetManifest -> AssetBinding`：

1. 简笔画 -> 擦除/裁切 -> 透明 PNG -> 绑定游戏对象。
2. 上传图片 -> 本地编辑 -> 导出/绑定。
3. 云端精确资源 -> 本地化 -> 绑定。
4. 云端近似资源 -> 本地改色或受控局部编辑 -> 绑定。
5. 无任何可用资源 -> 生图 -> 识图审查 -> 绑定或明确 debt。

具体所有权见 [视觉资产边界](visual-asset-boundaries.md)，验收与命令见
[视觉资产测试矩阵](visual-asset-test-matrix.md)。
