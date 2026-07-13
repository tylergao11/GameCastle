# C-2：受控 GPU 部署与真实验证

此阶段的目标不是“把一个 endpoint 填进环境变量”，而是取得可审计的生产验证证据。当前开发机没有 NVIDIA GPU 与 Docker，因此本文件的部署审批和指标合同已实现，真实部署与 live evidence 尚未发生。

## 1. 部署审批门

`shared/comfyui-worker-deployment-registry.json` 中的 deployment 只有在状态为 `approved` 且通过
`ai/comfyui-worker-deployment-approval.js` 时才能被 `comfyui-worker` 调用。审批必须包含：

- 固定 GPU Worker 镜像 repository 与 `sha256:` digest；
- `salad-comfyui-api` 上游 repository、固定 commit 与 SBOM SHA-256；
- 精确匹配的 workflow/model SHA-256 和许可证；
- NVIDIA GPU 名称、至少 16GB VRAM、driver/CUDA 版本；
- 人工 reviewer、时间、receipt ID 与明确 `approved` 决策。

不得用 `latest` tag、全零 hash、模型下载 URL、运行时 custom-node 安装或未审计的权重替代这些证据。

## 2. 真实部署顺序

1. 在受控 NVIDIA 主机构建固定镜像；镜像内只含批准的 ComfyUI、`salad-comfyui-api`、模型、workflow 与 custom nodes。
2. 生成 SBOM，执行许可证审查，写入 deployment approval；没有这些字段不得将 registry 改为 `approved`。
3. Worker 只暴露 GameCastle `/v1` gateway；底层 Salad `/prompt` 不对产品网络开放。
4. 配置 `COMFYUI_WORKER_ENDPOINT`、`COMFYUI_WORKER_API_KEY`、`ASSET_MODEL_PROVIDER=comfyui-worker` 和 `ASSET_ALLOW_EXTERNAL=true`。
5. 在真实 AssetSpec 集合执行至少 20 个 image-generation samples；每条记录真实 GPU、latency、gpuMs、Acceptance、repair 与人工 decision。

在 GPU 主机上先运行 `npm run preflight:comfyui-c2`。它需要固定 image digest、SBOM、模型文件、workflow 文件、CUDA 和上游 commit，并从 `nvidia-smi` 取得单张 NVIDIA GPU 的真实显存/driver 事实；它只生成审批输入，不能自行批准 registry 或绕过人工签名。

## 3. C-2 指标与阶段 C 关闭条件

`ai/comfyui-c2-metrics.js` 只接受 `source: live-gpu-worker`、至少 20 条非 simulated 的 image-generation sample，并计算：P50/P95 latency、平均 GPU ms、Acceptance rate、repair rate、human acceptance rate。

阶段 C 关闭前必须同时有：已批准 deployment、至少一次真实 FLUX AssetSpec→Acceptance→Revision→Binding smoke、上述 metrics report、人工接受记录、以及独立测试/审计。CPU smoke、mock transport 或 fixture 不构成此证据。

## 4. Signed metric evidence gate (C-2 hardening)

`ai/comfyui-c2-metrics.js` does not accept a hand-authored list of claimed GPU
numbers. Every sample must bind the same request through all four records:

1. a successful `ProviderRuntime` receipt for `comfyui-worker`;
2. an Ed25519-signed Worker attestation that binds request/project/job,
   deployment, workflow, model, GPU and `gpuMs`;
3. an Ed25519-signed Acceptance receipt bound to the provider receipt ID; and
4. an Ed25519-signed human-review receipt bound to that request.

The public keys are allowlisted in
`shared/comfyui-worker-trust-registry.json`; the checked-in registry contains
no production keys. A fixture can test this validator, but is never live
evidence. C-2 may be closed only with a report generated from real signed
records after the controlled Worker deployment.

## 5. 当前状态

`gamecastle.flux-schnell.gpu.v1` 与 `gamecastle.florence2.gpu.v1` 保持 `planned-not-approved`。本机探测到 `NVIDIA_SMI_UNAVAILABLE` 与 `DOCKER_UNAVAILABLE`，所以目前不能诚实地产生真实 FLUX、GPU memory、P50/P95 或人工接受率；待受控 GPU 环境与部署权限就绪后继续。
