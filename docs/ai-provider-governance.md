# AI Provider 治理真相源

`shared/ai-provider-governance.json` 是语义引擎与资产引擎共同使用的 provider、环境变量和
模态能力事实源；密钥只存在于环境变量，绝不写入项目 JSON、AssetWorld、receipt 或日志。

## 所有权

| 层 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| `ai-provider-governance` | provider 选择、endpoint、密钥环境变量名、模型别名、外部授权、预算 | 图片/文本请求体细节 |
| 语义 adapter | Responses 文本请求与语义验证 | 图片生成/审查 |
| 资产 adapter | ImageGeneration、ImageEdit、VisionReview 的请求/响应归一化 | 改写 LangGraph 路由、预算或 debt |
| LangGraph | 授权、预算、repair、receipt、debt、Runtime 绑定 | 持有 API Key |

## 环境变量

- 语义默认：`LLM_PROVIDER`、`LLM_ENDPOINT`、`LLM_MODEL`、`DEEPSEEK_API_KEY`。
- 资产 provider：`ASSET_MODEL_PROVIDER`；缺省为 `simulated-local`，不会静默调用网络。
- OpenAI 多模态：`OPENAI_API_KEY`、可选 `OPENAI_ENDPOINT`、`OPENAI_IMAGE_MODEL`、`OPENAI_VISION_MODEL`。
- 资产外部调用：`ASSET_ALLOW_EXTERNAL=true` 与 `ASSET_MODEL_MAX_COST=<非负数>`。

将 `ASSET_MODEL_PROVIDER=openai`、`ASSET_ALLOW_EXTERNAL=true` 和 OpenAI Key 配齐后，未来
Image adapter 只需从 `ai-provider-governance` 取得配置并实现三类资产端口；不得新增独立的
Key、endpoint 或预算配置。

## 安全门

1. 资产默认 `simulated-local`。
2. 非模拟 provider 必须显式 `allowExternal`。
3. AssetWeave 在调用前共享预算 reservation；不足时写 `budget_exhausted` debt。
4. provider 返回必须归一为 candidate/review receipt，之后仍走验收、revision、Runtime 与
   AssetWorld。
