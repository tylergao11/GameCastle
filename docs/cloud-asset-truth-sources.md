# 云资产真相源与词典

## 唯一真相层级

| 层级 | 真相源 | 唯一拥有内容 | 禁止拥有 |
| --- | --- | --- | --- |
| 结构规则 | `cloud-asset-engine-contract.json` | 字段、产物、状态、关系类型、流程与硬门 | 具体资产事实、风格数值 |
| 云端受控词汇 | `cloud-asset-dictionary.json` | semantic tag、bundle kind、quality、provenance、license 的稳定 ID | style、template、asset kind |
| 视觉语法 | `asset-style-dictionary.json` | styleId、色板、描边、动画与渲染规则 | template 定义、云端授权 |
| 模板定义 | `asset-template-dictionary.json` | UI/game template、版本、slot 与约束 | 具体 revision 或槽位命中关系 |
| 本地操作 | `local-derivation-contract.json` | Runtime 可执行 operation | 云端查询和模型能力 |
| 公共动态事实 | `CloudRelationIndexPort` | family、revision、模板引用、slot 命中、bundle 和关系 | 重定义词典 ID 或模板槽 |
| 不可变字节 | `CloudBlobStorePort` | Blob 字节、sha256 和媒体元数据 | 授权、关系和 Runtime binding |

`CloudPromotionQueuePort` 只是真实的工作流状态，不是“已公开资产”的真相；只有成功写入
RelationIndex 的 published revision 才是公共事实。`CloudProjectionPort` 完全可重建，不能反向覆盖
RelationIndex、BlobStore 或静态词典。Agent proposal 在 `CloudGraphCommandPort.apply` 成功前不是事实。

## 冲突处理

- 契约拥有结构和不变量，词典拥有允许使用的稳定 ID。
- styleId 和 templateId 只能引用各自词典，云库不得复制色值、槽位或模板定义。
- RelationIndex 只记录“某个 revision 使用哪个 ID”，不得创建词典外 ID。
- Projection 与主源不一致时丢弃 Projection 并重建。
- Blob hash 与 RelationIndex 不一致时停止发布/物化并产生完整性事件。
- 未知、弃用或冲突 ID 一律 fail closed，不做别名兼容或猜测修复。

## 用户简单、内部严格

玩家仍可输入自然语言，如“一个偷东西的小浣熊”。语义引擎或 AssetSpecCompiler 将自然语言映射为
受控 tag；用户不需要记住 `role.hero`。关闭的是公共元数据写入口，不是用户表达入口。无法确定时
允许不填 tag，进入本地/模型流程，但不得把自由文本直接写进公共索引。

## 版本与扩展

新增 style、template、tag、quality、provenance 或 license 必须修改其唯一词典并提升版本；调用方
不得在 Runtime 增加临时别名。删除模板槽必须创建新的 template version。旧 revision 保留它当时
引用的版本，Projection 可按当前策略决定是否继续公开，但不能改写不可变 lineage。
