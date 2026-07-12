# CloudAssetLibrarianAgent 契约

该 Agent 专门维护公共云资源库，但不是云库的数据库管理员。它读取公共元数据和聚合使用事实，
输出可审计的 `CloudGraphCommand`；确定性校验器决定是否应用。

## 负责

- 将 revision 归入已有 AssetFamily，或建议创建新 family。
- 从 `cloud-asset-dictionary.json` 选择受控 semantic tags、quality flags、bundle kind，并补充 styleId 引用和 fillsSlot 关系。
- 根据模板共同使用情况建议 AssetBundle 与 usedTogether。
- 标记低质量、重复、授权风险和失效关系。
- 给出下架建议和修复原因。

## 不负责

- 理解当前玩家完整意图；这属于语义引擎。
- 生成、编辑或审查当前项目图片；这属于资产引擎及模型端口。
- 直接操作 Blob、关系表、项目目录或 Runtime。
- 自动发布用户原图、测试资产或未验收资产。
- 创造词典外的 tag、quality、license、bundle kind、styleId、模板槽或本地 operation。
- 创建模板定义；Template/TemplateSlot 只能来自模板词典投影。

## 命令流程

```text
公共/staging 元数据
  → Librarian proposal
  → CloudGraphCommand(actor, operation, targets, payload, reason)
  → schema + ownership + relation + license validation
  → atomic apply or reject
  → CloudGraphReceipt(beforeHash, afterHash, issues)
```

Agent 可缺席：hash 去重、晋升硬门、exact 查询、物化和本地执行必须仍然工作。Agent 的作用是
提高 near 与 template-kit 的命中率，不能成为玩家主链依赖。
