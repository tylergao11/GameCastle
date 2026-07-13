# AI Provider 治理真相源

`shared/ai-provider-governance.json` 是语义引擎与资产引擎共同使用的 provider、环境变量和
模态能力事实源；`shared/provider-runtime-contract.json` 定义统一的 ProviderRuntimePort。密钥只存在于环境变量，绝不写入项目 JSON、AssetWorld、receipt 或日志。

## 所有权

| 层 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| `ai-provider-governance` | provider 选择、endpoint、密钥环境变量名、模型别名、外部授权、预算 | 图片/文本请求体细节 |
| `ProviderRuntime` | 授权、调用、超时、取消、重试、成本 reservation、safe receipt、debt | 语义/像素/玩法领域决策 |
| 语义 adapter | 组装 text role 输入并验证语义输出 | 绕过 ProviderRuntime 调网络 |
| 资产 adapter | ImageGeneration、ImageEdit、VisionReview 请求/响应归一化和本地 PNG materialize | 改写 AssetProductionLoopGraph 路由、预算或 debt |
| LangGraph | 使用 typed result、repair、Runtime 绑定 | 持有 API Key |

## 环境变量

- 语义默认：`LLM_PROVIDER`、`LLM_ENDPOINT`、`LLM_MODEL`、`DEEPSEEK_API_KEY`。
- 资产 provider：`ASSET_MODEL_PROVIDER`；缺省为 `simulated-local`，不会静默调用网络。
- OpenAI 多模态：`OPENAI_API_KEY`、可选 `OPENAI_ENDPOINT`、`OPENAI_IMAGE_MODEL`、`OPENAI_VISION_MODEL`。
- 本地 ComfyUI：`ASSET_MODEL_PROVIDER=comfyui-local`、`COMFYUI_ALLOW_LOCAL=true`、`COMFYUI_ENDPOINT`、`COMFYUI_MODEL_PATH`、`COMFYUI_MODEL_SHA256`。它不需要 API key，endpoint 必须是 loopback，模型调用仍由 ProviderRuntime 统一授权、计费和记 receipt。
- 外部调用：`AI_ALLOW_EXTERNAL=true` 或对应的 `LLM_ALLOW_EXTERNAL=true` / `ASSET_ALLOW_EXTERNAL=true`；资产预算为 `ASSET_MODEL_MAX_COST=<非负数>`。

将 `ASSET_MODEL_PROVIDER=openai`、`ASSET_ALLOW_EXTERNAL=true` 和 OpenAI Key 配齐后，
`ProviderRuntime` 会经 `/images/generations`、`/images/edits` 与 Responses vision 调用真实服务；
不得新增独立的 Key、endpoint 或预算配置。

## 安全门

1. 资产默认 `simulated-local`。
2. 非模拟 provider 必须显式 `allowExternal`。
3. AssetProductionLoopGraph 在调用前共享预算 reservation；不足时写 `budget_exhausted` debt。
4. provider 返回必须归一为 candidate/review receipt，之后仍走验收、revision、Runtime 与
   AssetWorld。
5. Provider receipt 只含 request hash、model、usage、成本、provenance 和状态；不含 raw prompt、图片或密钥。
6. `simulated-local` 可用于离线控制流，但其 receipt 与资产都不得通过发布门。
