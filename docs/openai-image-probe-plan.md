# OpenAI 图像端口：低成本探针合同

模型只补“本地、云库和确定性变体都不能提供”的像素，绝不是默认资源来源。

## 模型与预算

- 生图/编辑探针使用 `gpt-image-1.5`：它能输出原生透明 PNG，单张只允许 `low` 质量与方形尺寸。
  它是旧模型，因此仅作为透明资产的成本探针；正式默认仍待 `gpt-image-2` 的色键去背链验证后决定。
- Vision 使用支持图片输入的低成本 GPT 模型，图片 detail 固定 `low`（512px 预览）。
- 一次 smoke 最多四个图像请求；每次只生成一张。任一请求失败、超时或审查不确定即停止，保留 debt。

## 生图 prompt

`<SUBJECT>`、`<FILL_COLOR>`、`<ROLE>`、`<ANCHOR>` 必须由受限 `AssetSpec` 填入，模型不得猜测。

```text
Use case: stylized-concept
Asset type: one lightweight 2D game <ROLE> sprite, GameCastle STYLE 1
Primary request: Create exactly one readable <SUBJECT>.
Composition: centered full object, orthographic front or 3/4 view, generous padding,
base near bottom-center for <ANCHOR>.
Style: low-detail flat 2D cartoon; one solid <FILL_COLOR> fill; thick rounded #141923
outline; small upper-left #fff7e5 highlight; short lower-right shadow; at most three
interior details; readable at 96px.
Constraints: native transparent background, exactly one isolated subject, crisp opaque
edges, no crop.
Avoid: text, letters, numbers, logos, UI panels, scenery, extra objects, gradients,
realistic texture, watermark, frame, duplicate limbs, weapons.
```

UI 文字、按钮、HUD 与纯几何图标不得调用图像模型，应由模板/Canvas/SVG 生成。

## 编辑与 Vision

编辑只可使用父 revision 与批准 mask：保留主体、锚点、轮廓以及 mask 外全部像素；改色、
缩放、裁切、描边和投影优先本地完成。

Vision 输入仅含 512px 预览和安全 `AssetSpec`，只可返回：

```json
{"verdict":"pass|repairable|reject","confidence":0.0,"issues":["background_not_clean|multiple_subjects|subject_cropped|style_outline_missing|style_palette_violation|unreadable_small|text_or_logo|not_requested_subject"],"repairAction":"allowed enum or null"}
```

非 JSON、低置信度、超时均不得 pass；Vision 不能改像素、写 binding 或晋升云库。

## 最小 smoke

1. 一个单角色生成：透明 PNG、裁切、STYLE 1、Vision pass。
2. 一个单道具生成：验证不产生场景或多主体。
3. 一个 mask 内修复：验证不重画整个资产。
4. 一个故意违规样本：验证拒绝后只留下 PlaceholderDebt。

每次记录 provider/model、请求 ID、耗时、实际成本、candidate/最终 hash、Vision JSON、
Acceptance 及人工判定。不得发送用户完整项目截图、ProjectWorld、内部路径或无关文件。
