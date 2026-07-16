# Local text-model runtime

GameCastle uses CUDA `llama.cpp` for the local semantic DSL model. The pinned
runtime serves `Qwen/Qwen3.5-9B` from the `UD-Q4_K_XL` GGUF quantization on port
8002. Model files live in the persistent Docker volume
`gamecastle-llm-cache`, so normal restarts do not download them again.
The text-only service disables the multimodal projector and uses one inference
slot so the 8 GB GPU can keep more model layers resident.

Start or restore the service from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/models/start-semantic-llm.ps1
```

The application sends `enable_thinking=false` per request and supplies the
phase-specific GBNF grammar with every semantic call. The Director uses its
canonical deterministic route by default, so the separate 4B Director model is
not downloaded or started during the fast path. An explicit
`dynamicPlanning: true` call is required before that model endpoint matters.

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
