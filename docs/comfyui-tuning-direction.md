# ComfyUI 调优方向

## 目标

GameCastle 只把 ComfyUI 用于可验收的手机网页资产：角色、道具和无文字 UI 图标。业务闭环、资产合同、运行时绑定和项目真相不参与视觉调优。

## 唯一调优面

- `shared/comfyui-workflow-registry.json`：批准的模型、工作流、哈希和输入绑定。
- `ai/comfyui-workflows/`：图形模板；模板变更必须更新 registry 哈希。
- `.env.local`：本机可变参数；不得提交机器路径或密钥。

## 固定资源规格

| 资产类别 | 最终 PNG | 内部生成 | 背景策略 | 通过条件 |
| --- | --- | --- | --- | --- |
| Hero / Enemy | 256x256 | 512 latent 后在 ComfyUI 内缩放 | RGBA 透明 | 单主体、轮廓可读、角色锚点正确 |
| Collectible / Prop | 256x256 | 512 latent 后在 ComfyUI 内缩放 | RGBA 透明 | 单主体、小尺寸可读、中心锚点正确 |
| UI Icon | 256x256 | 512 latent 后在 ComfyUI 内缩放 | RGBA 透明 | 无生成文字、留安全边距、触控缩放仍可读 |

512 只用于内部稳定构图；交付与运行时只收到 256x256 PNG。

## 成熟路径与升级条件

1. 基座：批准的 SD1.5 checkpoint + ComfyUI 原生 BiRefNet。它负责草图生成和前景 mask，不负责接受资源。
2. 几何后处理：ComfyUI 原生 `ThresholdMask` 先去除 BiRefNet 软背景残值；固定提交的 [ComfyUI Essentials](https://github.com/cubiq/ComfyUI_essentials) `MaskBoundingBox+` 自动求前景包围盒，`ImageResize+` 保比例透明 pad 到最终画布，`ImageFlip+` 只在明确要求镜像变体时使用。不得再使用反转 mask、底部像素补丁或人工坐标裁切。
3. 结构控制：只有基座无法稳定满足单主体、姿态或构图时，才引入已登记的 ControlNet 参考模型。
4. 风格迁移：只有结构仍无法稳定符合 Style DNA 时，才引入有许可证、文件哈希和固定版本的 IP-Adapter 或风格 LoRA。
5. 语义事实：固定提交的 [ComfyUI-Florence2](https://github.com/kijai/ComfyUI-Florence2) 与 [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) 只输出描述文本；资产引擎依据 Style DNA 的验收策略作决定，不把视觉模型本身当作接受者。
6. 主体分割：同一 Florence2 模型的 referring-expression segmentation 工作流输出版本化 alpha 掩码；只有语义验收报告背景污染或多主体时才进入该步骤。`ASSET_SEGMENT_MODEL` 是唯一的分割模板选择项。

任何外部节点或模型都必须先登记 repository/commit、许可证、模型 SHA-256、工作流 SHA-256；不能直接从社区工作流复制进生产路径。

## 透明与几何链

`VAE Decode -> BiRefNet foreground mask -> ThresholdMask -> MaskBoundingBox+ -> ImageResize+ (RGB and mask together) -> JoinImageWithAlpha -> SaveImage`

- `COMFYUI_ALPHA_THRESHOLD` 和 `COMFYUI_TRIM_PADDING` 是唯一可调的透明/裁切参数；默认值分别为 `0.5` 与 `16`。
- 裁切只服从 foreground mask；模型把台面、石块等误判为前景时属于语义生成失败，必须拒绝并重新生成，不能通过裁切节点掩盖。
- 不保留 raw、mask、crop 或失败候选输出；它们只可作为一次性调试事实，验证后立即删除。

## 语义验收的唯一真相

- `shared/asset-style-dictionary.json` 的 `semanticReview` 拥有角色别名和透明单主体资源的禁止语义组；它不是 ComfyUI 工作流参数。
- 角色、道具、特效等透明单主体的描述出现 `background`、`scene`、`ground`、`floor`、`platform` 或 `landscape` 时，验收给出 `background_contamination`，进入修复或重生成循环。
- 世界几何和背景不会套用这一单主体规则；由其各自的生产家族和验收合同决定。

## 提示词与参数原则

- 正向提示词先描述：主体、构图、轮廓、色块、比例、留白和输出用途。
- 负面词仅保留硬性拒绝项：文字/水印、多个主体、繁忙背景、颗粒噪点、像素画。
- 每一次对比只允许改变一个维度：seed、steps、CFG、sampler、denoise 或参考强度。
- 单张 master 通过后，才允许在固定参数矩阵中批量生成；批量只用于候选扩充，不直接进入资源库。

## 验收顺序

1. PNG 为 256x256 RGBA，主体以外 alpha 为零。
2. 通过资产合同对应的单主体、锚点、留白、无文字和小尺寸可读性要求。
3. 人工审图确认 Style DNA：粗圆深色描边、干净色块、低细节几何、单层 toon 阴影、无颗粒。
4. 语义验收确认没有地台、石块、场景或额外主体被误判为前景。
5. 执行 `npm run check:comfyui-local`、`npm run smoke:comfyui:live` 与相关资产检查。
