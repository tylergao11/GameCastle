# LocalDerivationKernel：本地资产派生内核

本内核是资源引擎的默认像素执行层。它的任务不是理解用户意图，而是把已经明确的
`OperationSpec` 可重放地变成新的本地 revision。只有当目标需要新增且无法由这些操作表达
的像素，`AssetResolver` 才可进入 `ImageEdit` 或 `ImageGeneration`。

## 三个存储边界

```text
LocalOriginalStore     用户原图、手绘、revision 链；private/local；不可覆盖
ProjectAssetCache      当前项目可玩的派生 PNG、sheet、binding；可删除后重建
CloudApprovedStore     明确授权且通过 Acceptance 的可复用记录；只能 materialize 到 ProjectAssetCache
```

- Cloud 不可直接挂载为 Runtime URL；导出只能读取 `ProjectAssetCache`。
- 云端命中只读；任何改色、裁切、分帧、重排都在本地生成子 revision，绝不修改云源。
- 内容 hash 相同可去重；近似结果只能创建 local variant，不能覆盖或静默合并用户作品。
- 上传、手绘、缓存、云库、模型候选必须有不同 `scope/repositoryStatus/provenance`。

## OperationSpec

```json
{
  "schemaVersion": 1,
  "dictionaryId": "gamecastle.asset-style-dictionary",
  "styleId": "gamecastle.style-1",
  "operationId": "op.unique",
  "op": "sprite_sheet_split",
  "input": { "assetId": "asset.sheet", "contentHash": "sha256..." },
  "params": { "columns": 3, "rows": 1, "frameWidth": 96, "frameHeight": 96 },
  "post": ["trim_alpha", "normalize_anchor"],
  "output": { "kind": "sprite", "format": "png", "transparent": true },
  "scope": "project-local"
}
```

相同输入 hash 与相同 `OperationSpec` 必须得到相同输出 hash。每次执行写入
`OperationReceipt`：父 revision、输入/输出 hash、脚本版本、参数、时间、失败 debt。不得覆写父文件。

`shared/local-derivation-contract.json` 是操作名、scope 和 receipt 字段的唯一事实源；
`shared/asset-style-dictionary.json` 是 style、色板、锚点与低帧策略的唯一事实源。任何脚本若
自带未声明色值、锚点、frame policy 或 operation 名，均视为合同违规。

## 分期操作目录

| 域 | 操作 | 状态 |
| --- | --- | --- |
| 几何 | `trim_alpha`、`pad_canvas`、`resize`、`anchor_normalize`、`align_canvas` | 全部已有默认 RGBA handler；锚点缺省读取 style dictionary 的输出锚点 |
| 分帧 | `sprite_sheet_split`、`sprite_sheet_pack`、`frame_reorder`、`frame_anchor_normalize` | 全部已有默认 RGBA handler |
| 像素 | `palette_map`、`recolor`、`erase_connected`、`remove_light_edge_background`、`despill` | 全部已有默认 RGBA handler；despill 缺省以 STYLE 词典纸张色执行 alpha 反混色 |
| 风格 | `outline`、`shadow`、`highlight`、`quantize_palette`、`solidify_closed_line_art` | 描边、投影、高光、量化与闭合线稿已有默认 RGBA handler；色值和比例从 style dictionary 读取 |
| 动画 | `transform_frames`、`ping_pong`、`frame_timing`、`state_sheet` | 全部已有默认本地 handler；输出仍需 RuntimeLinker 消费为实际状态机 |
| 质量 | `decode_normalize_png`、`inspect_raster`、`validate_alpha`、`validate_frame_grid` | decode/normalize、inspect、alpha 与 frame grid 校验已有默认 RGBA handler |

目录中的“已声明”不是已实现。未注册 handler 必须返回 `LOCAL_OPERATION_UNAVAILABLE`，不可退化为模型调用。

## Owner

- Asset Studio：只提交 OperationSpec，不写文件、不调云、不调模型。
- LocalDerivationKernel：只读项目本地输入，写新派生文件和 receipt。
- LocalDerivationPort：把 kernel 的 RGBA 输出编码为项目本地透明 PNG，作为
  `deterministicVariant` candidate 交给 AssetWeave；不得绕过 AssetSpec、验收或 Runtime binding。
- AssetRevision：持久化 revision 链与 hash。
- RuntimeAssetResolver：决定是否先派生；不能直接改像素。
- CloudAssetEngine：只在明确晋升后读取 Acceptance，不执行 OperationSpec。
- 模型端口：只接收 resolver 证明“本地操作无法表达”的最小输入副本。

## 实现门

每个新 handler 必须同时提供：纯函数/文件适配器、OperationSpec 校验、像素或文件 fixture、
重复执行 hash 稳定性、父 revision 不变、错误 debt、导出 materialize 验证。Pillow 可用于
Runtime 文件级 handler；共享 RGBA helper 保持浏览器与 Node 可复用。
