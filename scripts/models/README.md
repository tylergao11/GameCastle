# Local text-model runtime

## Runtime modes (keep this small)

Do not scatter model names across env files. Code owns names; you only touch:

1. `GAMECASTLE_RUNTIME_MODE` — `development` or `production`
2. `DEEPSEEK_API_KEY` — one key for LLM1 and for development LLM2

| Mode | LLM1 Director | LLM2 Semantic DSL | Local llama.cpp |
| --- | --- | --- | --- |
| `development` | DeepSeek | same DeepSeek key/model | not required |
| `production` | DeepSeek | open-source Qwen `Qwen/Qwen3.5-9B` | `npm run model:semantic:start` |

```powershell
npm run model:config:check
```

That command prints the effective binding so a mode flip is never silent.
`product:serve` also logs `mode / LLM1 / LLM2` on startup.

Development is for iteration without the GPU service. Production is the
formal DSL path: Qwen under CUDA `llama.cpp` with phase-specific GBNF.
DeepSeek development calls still receive the grammar field, but only
llama.cpp enforces it server-side; the Runtime parser remains authoritative.

## Production local Qwen service

GameCastle uses CUDA `llama.cpp` for the local semantic DSL model. The pinned
`server-cuda13-b9445` runtime image (manifest digest recorded in the Compose
file) serves `Qwen/Qwen3.5-9B` from the `UD-Q4_K_XL` GGUF quantization on port
8002. Model files live in the persistent Docker volume
`gamecastle-llm-cache`, so normal restarts do not download them again.
The text-only service disables the multimodal projector and uses one inference
slot so the 8 GB GPU can keep more model layers resident.

Prerequisites are Docker Desktop, an NVIDIA GPU, and the NVIDIA container
runtime. Start or restore the service from PowerShell (production mode):

```powershell
npm run model:semantic:start
```

The application sends `enable_thinking=false` per request and supplies the
phase-specific GBNF grammar with every Semantic call. Director LLM1 is not a
local model: it uses external DeepSeek `deepseek-v4-flash`. In production,
Semantic LLM2 alone uses the local GPU service, avoiding two resident text
models on the 8 GB GPU.

Director provider and model are fixed by `director-model-port.js`.
Semantic mode selection is owned by `semantic-model-policy.js`.
`.env.local` stores mode plus private DeepSeek endpoint and key, and
`npm run product:serve` loads them automatically. New terminals do not export
variables manually:

```powershell
npm run model:director:check
npm run model:director:smoke
```

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

Live command-following for **current** `semantic-dsl-v9` only (plan-task /
plan-complete + free-write forms; no structure plan-*). Needs local llama when
production mode is used:

```powershell
npm run model:semantic:benchmark
```

Offline acceptance for the semantic loop is always:

```powershell
npm run check:semantic-loop
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
