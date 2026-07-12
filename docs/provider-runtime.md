# WP1 Provider Runtime

`ai/provider-runtime.js` is the sole external model invocation owner. It exposes
`ProviderRuntimePort.invokeRole`, `cancel`, and `health`; its closed role set is
`creative-text`, `intent-text`, `image-generate`, `image-edit`, and
`vision-review`.

The Runtime reads provider endpoint and credentials only from
`ai-provider-governance`. A request may choose a provider ID, but cannot supply
an API key, authorization value or arbitrary endpoint. Each call is explicitly
authorized, reserves a bounded cost, has a timeout/retry/cancel lifecycle, and
produces a safe immutable receipt. Receipts contain only request hash, provider,
model, usage, cost, provenance and status; they never contain prompts, images or
secrets.

Every role has a positive `defaultEstimatedCost` in
`shared/provider-runtime-contract.json`. A caller can provide a higher or lower
declared estimate, but cannot omit reservation to obtain a zero-cost external
call. The receipt labels cost as `estimated`; provider billing reconciliation is
an Operations (WP8) concern, not an invented exact charge.

Text callers use `ai/llm-provider.js`; LLM2 DeepSeek decisions use
`ai/llm2-deepseek-decision-provider.js`. Both now delegate to ProviderRuntime.
Asset Engine may receive a ProviderRuntime and uses
`ai/provider-runtime-adapters.js` to turn typed image/vision results into local
PNG candidates and AssetWeave-compatible review results. This preserves the
local → cloud → deterministic edit → model priority; the Runtime is reached only
after AssetWeave chooses a model route.

`npm run check:provider` proves the five roles, authorization denial, cost cap,
cancellation, receipt redaction, local image materialization and the simulated
publish denial. In the current no-key stage, this simulated ProviderRuntime is
the formal WP1 Runtime: it exercises the same typed port, receipt, budget,
cancel and failure routes as a real adapter. It is not a fake success because
its `simulated` provenance is retained and publishing remains denied.

`npm run smoke:provider:live` is a future optional adapter verification. It
requires explicit OpenAI asset authorization and a key, has a finite default
smoke budget, emits only safe receipts, and performs exactly one call for each
of the five roles. It is not a prerequisite for the current simulated stage.
