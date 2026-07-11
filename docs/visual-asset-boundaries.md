# 视觉资产边界与所有权

本文件定义视觉资产闭环的唯一 owner 边界。任何能力必须同时满足“文档声明、
LangGraph 路由、owner 实现”三项，缺一项即视为未实现。

## Owner 表

| Owner | 可读 | 可写 | 禁止 |
|---|---|---|---|
| Asset Studio（前端） | 用户选择、当前 revision、模板预览 | 本地画笔输入、裁切/擦除操作意图、用户授权 | 直连模型、直写云库、绕过 manifest 绑定游戏 |
| AssetRevision 服务 | 原图、父 revision、确定性操作参数 | 新 revision、派生 PNG、哈希 | 覆盖原图、决定云端审批、调用 LLM |
| LocalDerivationKernel | 项目本地输入、OperationSpec、受限参数 | 本地派生 PNG、OperationReceipt、子 revision | 读云 URL、覆盖父 revision、调用模型、晋升云库 |
| Template Registry | `TemplateSpec`、主题和槽位约束 | 模板版本、布局 token | 修改 Intent DSL、玩法规则、运行时内部计划 |
| RuntimeAssetResolver | `AssetSpec`、本地索引、云库索引、预算 | `ResolutionDecision`、缺失/debt 路由 | 直接改像素、直接审批候选、绕过优先级调用模型 |
| CloudResourceManager | Acceptance 后的晋升队列、批准云资源 | 持久化队列、同步、批准资源检索与本地化 | 直接接收未批准资产、模型候选或用户上传 |
| ImageAgent | 受限 `AssetSpec`、参考 revision、mask、修复约束 | 模型候选 revision、成本/provenance | 选资产、写 `AssetBinding`、发布、修改玩法 |
| VisionAgent | 候选图片和预期 `AssetSpec` | `AssetReview` | 修改像素、调用 ImageAgent、批准云库、修改 manifest |
| AssetAcceptanceGate | revision、确定性检查、`AssetReview`、预算 | 接受/拒绝/repair 路由、`acceptanceDecision` | 越过 attempt/budget 限制、伪造审查结果 |
| RuntimeLinker | 已批准 `AssetManifest`、`AssetBinding`、Bridge 计划 | 运行时资源绑定和 assembly report | 搜索资源、调用模型、从远端 URL 临时加载未本地化资源 |
| AssetWorld | `AssetManifest`、上一版 AssetWorld | 安全资产摘要、候选晋升队列 | 向 LLM2 暴露原图、提示词、内部路径或模型审计细节 |

## 语义引擎边界

- 语义引擎决定“需要什么”：对象、UI 功能、资源槽位、自然风格约束。
- 视觉资产闭环决定“使用哪一个文件及如何得到它”。
- 纯 UI/图标/主题变更只能更新 `TemplateSpec`、`AssetRevision` 或 `AssetBinding`；
  它不应改变玩法 `Intent`、模块选择或游戏世界语义 hash。
- LLM2 只能读取 AssetWorld 的安全摘要，例如资产是否满足、是否存在债务、可选风格策略；
  禁止读取图片字节、模型提示词、云端物理路径、成本明细或资产审查内部字段。

## 本地、云端与隐私

1. 本地上传和简笔画默认 `private/local`。识图、云端备份、候选晋升和公开发布均需
   独立、明确的用户动作。
2. 云资源必须带 `assetId`、内容哈希、来源、许可、scope、审核状态和可本地化版本。
3. 云端命中后，`AssetMaterialize` 写入项目本地缓存；导出的游戏和离线试玩不得依赖云 URL。
4. 内容哈希相同可去重；语义相近只能提示复用或创建 variant，不能静默丢弃用户作品。
5. `candidate`、`approved`、`rejected`、`public` 必须是不同状态。候选资源不得参与默认
   可发布解析，公开资源不得由模型或 Vision 自动产生。
   当前实现中的 `promoted` 仅表示进入受控复用库，绝不等同于 `public`；状态迁移完成前，
   旧状态不得用作公开发布依据。
6. 语义相似/感知相似只可用于排序、提示复用或创建 variant；它不得静默合并、丢弃或覆盖
   不同用户的图片。

## 模型调用边界

模型调用必须有 `resolutionDecision`、用户允许、预算余量和可审计 `costLedger` 四个前置条件。

| 调用 | 前置条件 | 结果 | 不通过时 |
|---|---|---|---|
| 本地识图 | 用户主动或非阻塞索引 | 视觉事实卡 | 保留本地资产，不阻断使用 |
| 云端识图/审查 | 候选需要审核 | `AssetReview` | 保持 candidate 或拒绝 |
| 模型微调 | 有父 revision，确定性操作不足 | 子 revision | 返回原版本和可解释 debt |
| 全新绘制 | resolver 无可用候选 | 候选 revision | 返回 placeholder debt |

模型不得直接访问完整 `ProjectWorld`、Bridge Plan、GDJS target plan 或无关用户文件。
模型 endpoint 必须通过 allowlist；调用记录必须包含用户同意、scope、目的、数据范围、
provider/model、时间和成本。不得因为 endpoint 可配置就上传完整用户图片。

## 文件接收安全

Asset Studio 与导入服务必须在生成 `AssetRecord` 前完成：

- 真实图像解码；MIME、扩展名与文件签名一致性检查；
- 文件大小、像素数量、帧数和解压后内存上限，防止压缩炸弹；
- EXIF 保留/剥离策略及其 provenance；
- SVG、文件路径、URL 和解码器隔离，禁止脚本执行或任意文件访问；
- 失败时不创建可解析、可发布或可晋升的资源记录。

## 发布与晋升门

资产可被试玩不等于可以发布或复用。发布/云端晋升至少需要：

- 非 placeholder；
- 完整 provenance、哈希与许可；
- PNG/尺寸/透明度等确定性约束通过；
- 模型产物或模型编辑产物有通过的 `AssetReview`；
- 用户授权的 scope；
- `AssetAcceptanceGate` 的批准记录。

任何一个条件失败都必须留下 owner-routed debt，而不是把失败伪装成资源命中。

## 实现前检查

每次新增视觉能力时，审计必须逐项确认：

```text
文档声明 -> schema/状态字段 -> LangGraph 条件边 -> owner handler -> 测试 -> 审计证据
```

若任一环节缺失，该能力必须在产品界面显示为不可用/预留，不能显示为已完成。
