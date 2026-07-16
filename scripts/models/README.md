# Local text-model runtime

GameCastle uses CUDA `llama.cpp` for the local semantic DSL model. The pinned
`server-cuda13-b9445` runtime image (manifest digest recorded in the Compose
file) serves `Qwen/Qwen3.5-9B` from the `UD-Q4_K_XL` GGUF quantization on port
8002. Model files live in the persistent Docker volume
`gamecastle-llm-cache`, so normal restarts do not download them again.
The text-only service disables the multimodal projector and uses one inference
slot so the 8 GB GPU can keep more model layers resident.

Prerequisites are Docker Desktop, an NVIDIA GPU, and the NVIDIA container
runtime. Start or restore the service from PowerShell:

```powershell
npm run model:semantic:start
```

The application sends `enable_thinking=false` per request and supplies the
phase-specific GBNF grammar with every semantic call. The Director uses its
canonical deterministic route by default, so the separate 4B Director model is
not downloaded or started during the fast path. An explicit
`dynamicPlanning: true` call is required before that model endpoint matters.
The 8 GB single-GPU setup must not assume the 4B Director and 9B Semantic models
can remain resident together.

Check readiness:

```powershell
Invoke-RestMethod http://127.0.0.1:8002/health
Invoke-RestMethod http://127.0.0.1:8002/v1/models
```

Then verify the real project transport, non-thinking mode, GBNF constraint, and
DSL parser together:

```powershell
npm run model:semantic:smoke
```

Measure basic Planner/Executor command syntax, exact-value following,
non-thinking behavior, and per-command latency:

```powershell
npm run model:semantic:benchmark
```

The benchmark is a diagnostic rather than a release SLA. The latest RTX 5070
Laptop GPU run produced 12/12 parser-valid commands, 12/12 responses without
thinking text, 11/12 strict literal matches, and a 770 ms warm average. The one
strict mismatch was a semantically correct paraphrase of the free-form
`plan-task.goal` text. Run the command again after any model, prompt, grammar,
quantization, context, or GPU-offload change.

The model-visible protocol is DSL only. llama.cpp's OpenAI-compatible HTTP
transport necessarily uses a private JSON envelope, but the application sends
no JSON schema/response format and accepts no JSON model output fallback.
