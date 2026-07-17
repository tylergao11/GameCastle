# Snake semantic loop — short handoff

**Truth entry:** [semantic.md](./semantic.md)  
**Date pin:** keep in sync with `tests/benchmarks/snake-semantic-contract.json` protocol versions.

## What this loop is for

Six layered tasks debug **executor free-write DSL** (and freeze plan when needed).  
Not for faking pass rates with recipe goals.

## Commands

```powershell
npm run check:semantic-loop

$env:GAMECASTLE_RUNTIME_MODE='development'
# Freeze executor only (one task):
npm run debug:snake:live -- --benchmark-task=loss-restart --plan-dsl-file=.gamecastle/output/semantic-plans/loss-restart.plan.dsl --timeout-ms=180000
```

Plan goldens (short Add/Create goals only): `.gamecastle/output/semantic-plans/*.plan.dsl`  
Seeds: `tests/fixtures/semantic/semantic-snake-*-seed.dsl`  
Oracle: `tests/benchmarks/snake-semantic-contract.json` + `snake-semantic-benchmark.js`

## Success modes

| Mode | Meaning |
|------|---------|
| freeze plan | `planDsl` supplied; no planner model call |
| free plan | planner emits `plan-task` / `plan-complete` |
| runtimeOk | Runtime completed Source |
| oracleOk | Contract delta / preserve / required ops |

Never report only one of runtimeOk/oracleOk as “passed”.

## Protocol pins

- Planner: `semantic-planner-prompt-v24`
- Executor: `semantic-executor-prompt-v30`
- Language: `semantic-dsl-v9`

## Maintenance rules

1. Context wrong first, then prompt, then feedback — model last.  
2. Delete false docs/scripts; update live gates with code.  
3. Revision board: no `game` in FORMS; work-order uses **Add** not Create.  
4. PowerShell: no `&&`.
