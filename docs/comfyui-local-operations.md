# 本地 ComfyUI：唯一调优面

GameCastle 的业务、资产验收、落盘、绑定和版本提交都不应为视觉迭代而修改。视觉迭代只编辑 ComfyUI workflow registry/template 与未提交的 `.env.local`：

1. 从 `.env.local.example` 复制为 `.env.local`。
2. 只修改已批准的 `ASSET_IMAGE_MODEL`、`ASSET_VISION_MODEL`、`ASSET_SEGMENT_MODEL` 与 `COMFYUI_*` 调优参数；模板节点和固定模型必须继续登记在 registry，并更新 workflow 哈希。
3. 透明角色、敌人和道具使用 ComfyUI 内置 BiRefNet；语义验收或主体分割由已登记的 Florence2 工作流执行，不在业务侧增加抠图或识图脚本。
4. 手机网页默认落盘尺寸为 256×256；生成模板内部使用稳定的 512 latent，随后在 ComfyUI 内缩放到 256，再抠图和保存。尺寸调优只改 `COMFYUI_GENERATION_WIDTH/HEIGHT` 与 workflow 模板参数。
5. 运行 `npm run comfyui:start`，再运行 `npm run dev`。`dev` 会自动读取同一份 `.env.local`。

资产模型 ID 只能引用 `shared/comfyui-workflow-registry.json` 中对应角色已批准的 workflow。要引入新的模板，先把 workflow、节点与模型哈希写入 registry；不要修改业务流程来绕过治理边界。

运行态不依赖工作站盘符：ComfyUI 默认是 GameCastle 的同级 Portable 目录 `../ComfyUI_windows_portable/ComfyUI`，GDevelop 默认是 `../GDevelop-master`。公司或家里的不同盘符均不需要改仓库文件。

检查服务状态：

```powershell
npm run comfyui:status
```

停止服务：

```powershell
npm run comfyui:stop
```
