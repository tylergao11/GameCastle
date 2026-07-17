# Semantic domain (current truth)

**Owners:** `packages/semantic/src/`  
**Language:** `semantic-dsl-v9` (`semantic-dsl-syntax.js`)  
**Protocols:** planner `semantic-planner-prompt-v22` · executor `semantic-executor-prompt-v28`

## Roles

| Role | Job | Wire |
|------|-----|------|
| **Planner** | Domain dispatcher only | One `plan-task(goal=…)` or `plan-complete()` per round |
| **Executor** | Free-write one work order | `game`/`entity`/`member`/`event`/`when`/`then`/… |
| **Runtime** | Feasibility, authorize, commit | Not a model |

Product-level total scheduling (semantic vs asset) lives under `packages/product/` (`product-dispatch-*`), not the semantic planner.

## Executor context layout

```text
SYSTEM  law + WORK_MODE + FORMS(mode) + [L1-structure-kinds] + [L1-ops-*]
USER    [L3-work-order] + [L3-board] + [L2-product]? + [L4]
```

- **new** board: empty world; FORMS may include `game`.
- **revision** board: seed exists (member values on board); FORMS/GBNF **omit** `game`/`policy`.
- Work order goal appears **once**. No structure `plan-*` on planner.

## Verification (maintain these)

```powershell
npm run check:semantic-loop
```

Includes parser, gbnf, task-plan, state machine, prompt bundle, draft-slice, llm2 runtime, snake offline suite.

Live freeze executor (short goals under `.gamecastle/output/semantic-plans/`):

```powershell
$env:GAMECASTLE_RUNTIME_MODE='development'
npm run debug:snake:live -- --benchmark-task=state-fields --plan-dsl-file=.gamecastle/output/semantic-plans/state-fields.plan.dsl --timeout-ms=90000
```

Report **runtimeOk** and **oracleOk** separately.

## Models

See `scripts/models/README.md`.  
`GAMECASTLE_RUNTIME_MODE=development` → DeepSeek for LLM2; `production` → local Qwen + GBNF.

## Do not

- Reintroduce structure `plan-entity` / `plan-use` as planner wire.
- Put oracle recipes into freeze plan goals.
- Document second truths outside this file + code owners above.
- Advertise illegal revision commands (`game`/`policy`) in executor FORMS.

## Residual (known, deferred — not code stubs)

- Multi-sample live stability for loss-restart first-round delta-only.
- Free-plan (true planner) full six-task campaign.
- Product free path on `product-dispatch-langgraph` still separate from sealed Director delivery.
