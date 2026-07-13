# 资产引擎实现接力清单

## 接力原则

后续模型不得重新发明总流程。先读取 `shared/asset-engine-contract.json`，再按阶段 owner 填充 `ai/asset-engine-skeleton.js` 的 capability registry。若发现契约不足，先升级 schemaVersion 和迁移测试，再改实现。

## 模块工作包

### A. 输入与规范化

- 实现 `AssetSpecCompiler`：从 BuildContract.assetSlots 生成完整 AssetSpec。
- 实现 `LocalInputArchive`：保留原图、计算 hash、创建 revision 0。
- 保证用户无手绘/上传时仍能进入 AssetResolver。

### B. 解析与仓库

- 检索逻辑已经收敛为唯一 AssetProductionResolver；不得恢复旧图或兼容 reader。
- 明确 exact/near 的评分阈值、license 和 provenance 过滤。
- 所有云命中先下载到 project-local，再生成 AssetRevision。

### C. 本地工具链

- 按 `local-derivation-contract.json` 为每个 op 注册真实 handler。
- 每次执行输出不可变文件、父 revision 和 OperationReceipt。
- 优先实现裁切、透明 PNG、缩放、分帧、改色、帧锚点统一、sheet pack/split、轮廓与阴影。

### D. 模型循环

- 实现 ModelPolicyGate：预算、隐私、provider、重试、模拟标记。
- ImageEdit 只处理已有父 revision 且确实需要新增像素的任务。
- ImageGeneration 只处理无可复用资产的任务。
- VisionReview 输出固定三态，并受最大修复次数/预算约束。

### E. 验收与绑定

- AcceptanceGate 同时校验像素、AssetSpec、风格、透明度、尺寸、锚点和 publishability。
- RuntimeAssetBinder 生成真正的 GDevelop/Cocos 资源和对象绑定，不得使用网页覆盖层。
- 导出前比对 AssetManifest、RuntimeBindingManifest 和实际发布目录 hash。

### F. 云资源管理

- 搜索/下载与晋升分离。
- 晋升必须有 AcceptanceReceipt、license、provenance 和显式请求。
- 云端记录保留 revision lineage、styleId、semanticTags、质量和使用统计。

CloudAssetEngine 已定义 query、materialize、显式 staging promotion 与 graph command 的本地可验证骨架。后续部署只替换 BlobStore、RelationIndex、ProjectionIndex 和 Queue 的基础设施实现，不得改变 `shared/cloud-asset-engine-contract.json` 的产物与硬门；未注入 CloudAssetEngine 时不能进行云端写入。

## Definition of Done

一个阶段只有在以下证据齐全时才能从 skeleton/partial 改为 implemented：

1. 领域契约校验通过。
2. 正常、空输入、边界和失败路径测试通过。
3. 产生不可变 revision 与 receipt。
4. 不越过本地/云端/模型存储边界。
5. 能在 LangGraph checkpoint 后恢复。
6. 错误进入有 owner 的 AssetDebt，而不是吞错或伪成功。

## 禁止事项

- 不得让用户必须画图。
- 不得因为云端命中而直接使用远程地址。
- 不得用“修改状态字段”冒充真实像素派生。
- 不得让模型先于本地脚本和云复用。
- 不得用 Manifest 中存在记录冒充 Runtime 已绑定。
- 不得自动把用户输入、模拟输出或未验收资产上传云库。
