# GameCastle AI Intent Engine

`ai/` owns the AI-first intent engine. It converts natural game intent into runnable GDevelop/GDJS output through typed intermediate contracts, deterministic runtime owners, semantic playtest evidence, and owner-routed repair.

The live LLM2 product surface is Intent DSL. Internal target instructions are compiler/runtime-owned only. LLM2 must not see or produce coordinates, component ids, GDJS event details, runtime adapter ids, internal command fields, or `project.json` edits as its normal product language.

## Closed Loop

```text
user request
  -> RequirementModel / LLM1 creative brief
  -> IntentWorldView + safe capability summaries + semantic evidence
  -> IntentAgent / LLM2 natural Intent DSL
  -> Intent parser and typed Intent Graph
  -> placement resolver, component compiler, GDJS bridge
  -> runtime executor and HTML export
  -> ProjectWorld + ExecutionLedger + ExecutionReport
  -> Semantic Playtest + SemanticFeedback
  -> Decision Runtime / Context Provider / Repair Intent
```

The loop is intentionally AI-first but not AI-owned end to end. AI proposes natural intent; engine owners lower, validate, execute, and diagnose. When a failure is past the parser/surface boundary, the corresponding owner fixes or rejects it instead of asking LLM2 to write target commands.

## Key Owners

| File / Area | Responsibility |
|-------------|----------------|
| `pipeline.js` | CLI and orchestration for create, continue, approval, execution, output writes, and semantic post-processing. |
| `agent-workflow.js` | Model/role registry for requirement, Intent DSL, Intent repair, image, and vision roles. |
| `intent-agent.js` | Intent Commander prompt, natural Intent DSL generation, and surface-level Intent repair. |
| `intent-dsl.js` | Natural Intent DSL parser and surface validation. |
| `intent-compiler.js` | Typed Intent Graph creation and aggregate compile contract production. |
| `placement-resolver.js` | Semantic placement resolution without exposing coordinates to LLM2. |
| `gdjs-bridge.js` | Bridge from typed intent/component facts to internal runtime target facts. |
| `intent-runtime-codegen.js` | Runtime adapter requirement lowering into `GameCastleIntentRuntime`. |
| `project-world.js` | Stable gameplay/world summary derived from generated project output and execution evidence. |
| `intent-world-view.js` | LLM2-safe gameplay context built from ProjectWorld, playtest evidence, and semantic iteration memory. |
| `semantic-playtest-agent.js` | Play policy generation, tick-runner execution, LLM/user reports, and repair Intent output. |
| `semantic-feedback.js` | Semantic issue normalization and safe repair Intent line generation. |
| `llm2-context-cache-router.js` | DeepSeek text KV prefix-cache routing for stable prefix and dynamic gameplay tail. |
| `llm2-context-provider.js` | Focused safe context responses for `request_context` decisions. |
| `llm2-decision-runtime.js` | Verified `apply_intent`, `request_context`, `no_op`, and `reject` decisions. |
| `llm2-decision-loop-runner.js` | Replayable decision loop around router, provider, runtime, pipeline execution, and memory writeback. |
| `llm2-semantic-eval-loop.js` | Batch benchmark loop for natural creation and feedback turns. |
| `llm2-deepseek-decision-provider.js` | Narrow real-model entry point behind the same verifier and cache gates. |
| `contracts/schema.json` | Multi-agent contract truth source for build, asset, assembly, and validation reports. |
| `intent-routing-rules.json` | Machine-checkable owner routing and prohibited AI-surface patterns. |
| `gdevelop-truth.js` | Single runtime truth entry for official GDevelop/GDJS types, fields, and includes. |

## Canonical State

The AI continuation interface is complete Intent iteration state, not a standalone runtime artifact:

- `output/project.json`: GDJS runtime output.
- `output/project-world.json`: stable gameplay/world summary.
- `output/execution-ledger.json`: append-only execution evidence.
- `output/intent-world-view.json`: LLM2-safe decision context.
- `output/semantic-playtest-*.json`: semantic playtest reports and repair evidence.
- `output/*.intent.dsl`: offline fixture or generated repair Intent artifacts.

`--continue` must load enough state to know what was already applied and what semantic evidence exists. A bare `project.json` is insufficient.

## Repair Rules

- Parser/surface failures can ask LLM2 to rewrite natural Intent DSL.
- Resolver, bridge, runtime, GDevelop truth, HTML export, and semantic playtest failures route to the owning layer.
- Decision candidates are consolidated around semantic repair intent. `no_op`, `request_context`, and `reject` are decision outcomes, not expanding action-command families.
- Runtime command evidence may exist in full audit artifacts, but LLM2-visible views must carry semantic summaries and owner routes instead of target command fields.
- Intent Engine entry points keep one canonical shape per owner path.

## Checks

Run the full gate with the local GDevelop checkout:

```bash
set GAMECASTLE_GDEVELOP_SOURCE_DIR=D:\GDevelop-master
npm run check:ai
```

Focused checks that protect the AI-first boundary:

```bash
node ai/check-ai-visible-boundary.js
node ai/check-intent-doc-boundary.js
node ai/check-intent-routing-rules.js
node ai/check-intent-growth-control.js
node ai/check-intent-diagnostic-router.js
node ai/check-intent-repair-routing.js
```

Decision and semantic-loop checks:

```bash
node ai/check-intent-world-view.js
node ai/check-llm2-context-cache-router.js
node ai/check-llm2-context-provider.js
node ai/check-llm2-decision-runtime.js
node ai/check-llm2-decision-loop-runner.js
node ai/check-llm2-semantic-eval-loop.js
node ai/check-full-creative-loop.js
```

## Fixture Entry

```bash
node ai/pipeline.js --intent-fixture-file ai/fixtures/intent-mobile-platformer.dsl
```

`--intent-fixture-file` accepts only offline fixtures under `ai/fixtures/intent-*.dsl` or generated repair artifacts under `output/*.intent.dsl`. It is not a general external command-file path.
