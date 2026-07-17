# Local model runtime (Ollama)

## Runtime modes (keep this small)

Do not scatter model names across env files. Code owns names; you only touch:

1. `GAMECASTLE_RUNTIME_MODE` — `development` or `production`
2. `DEEPSEEK_API_KEY` — LLM1 always; also development LLM2
3. `OLLAMA_ALLOW_LOCAL=true` — production LLM2 + Spatial vision

| Mode | LLM1 Director | LLM2 Semantic DSL | Spatial vision |
| --- | --- | --- | --- |
| `development` | DeepSeek | same DeepSeek key/model | Ollama `qwen3-vl:8b` |
| `production` | DeepSeek | Ollama `qwen3:8b` | Ollama `qwen3-vl:8b` |

```powershell
npm run model:config:check
```

That command prints the effective binding so a mode flip is never silent.
`product:serve` also logs `mode / LLM1 / LLM2` on startup.

## One Ollama process, two models

Install Ollama, then pull once:

```powershell
ollama pull qwen3:8b
ollama pull qwen3-vl:8b
```

Confirm:

```powershell
ollama list
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

`.env.local` should include:

```env
OLLAMA_ENDPOINT=http://127.0.0.1:11434/v1
OLLAMA_ALLOW_LOCAL=true
OLLAMA_TEXT_MODEL=qwen3:8b
OLLAMA_VISION_MODEL=qwen3-vl:8b
SPATIAL_MODEL_PROVIDER=ollama
SPATIAL_VISION_MODEL=qwen3-vl:8b
```

Director provider/model are fixed by `director-model-port.js`.
Semantic mode selection is owned by `semantic-model-policy.js`.
Spatial uses ProviderRuntime role `spatial-plan` with Ollama vision (`qwen3-vl:8b`).

Ollama calls use the native `/api/chat` transport with **`think: false` by
default** (OpenAI-compat `/v1` often still emits Qwen3 reasoning). Grammar
fields may still be attached for Semantic calls, but Ollama does not
server-enforce GBNF. The Runtime parser remains authoritative.

```powershell
npm run model:director:check
npm run model:director:smoke
npm run model:semantic:smoke
npm run model:semantic:benchmark
```

Offline acceptance for the semantic loop is always:

```powershell
npm run check:semantic-loop
```

The model-visible protocol is DSL only. The application sends no JSON schema
response format and accepts no JSON model output fallback.
