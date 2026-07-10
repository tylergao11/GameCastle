# GameCastle

GameCastle is an AI-first game creation runtime. Its product path is not "generate a disposable mini game from one prompt"; it is "keep shaping a playable game project through natural intent, semantic evidence, and owner-routed execution."

Current AI-first boundary: LLM2 writes natural Intent DSL only. Engine facts such as coordinates, component ids, GDJS objects, runtime adapters, internal target commands, and GDevelop `project.json` mutations belong to compiler, bridge, runtime, and validation owners.

## Goal

GameCastle is building a closed loop:

```text
user intent / iteration request
  -> LLM1 creative brief
  -> safe IntentWorldView + semantic playtest evidence
  -> LLM2 natural Intent DSL
  -> typed Intent Graph
  -> Resolver / Bridge / Runtime execution
  -> ProjectWorld + ExecutionReport
  -> Semantic Playtest
  -> owner-routed repair or next natural intent
  -> project.json + browser game output
```

The important property is ownership. AI decides in natural game terms; deterministic owners lower that intent into executable facts; semantic playtest turns runtime behavior back into gameplay evidence; repair is routed to the owner that can actually fix the failure.

## Current Architecture

| Area | Responsibility |
|------|----------------|
| `ai/` | Intent engine, pipeline CLI, graph runners, LLM boundaries, semantic playtest, decision loop, contracts, and checks. |
| `ai/components/` | AI-safe component cards plus compiler manifests for bindings, placement policy, runtime requirements, and target metadata. |
| `ai/product-modules/` | Product capability truth source. Modules are selected through natural intent, not by exposing module ids as the product language. |
| `ai/gdevelop-truth/` | Extracted GDevelop/GDJS runtime truth from `D:\GDevelop-master`; project emission must validate against this snapshot. |
| `ai/assets/` | Seed local/cloud asset repository manifests for runtime asset resolution. |
| `engine/` | Cached official GDJS browser runtime used by HTML export. |
| `platform/` | React/Vite product shell for creation, iteration, playtest, and future publishing/multiplayer surfaces. |
| `docs/` | Longer architecture notes, roadmap, and bridge/runtime design records. |
| `output/` | Generated artifacts: `project.json`, `game.html`, `project-world.json`, `execution-ledger.json`, semantic reports, and intent artifacts. |

## Engine Boundaries

- The live product language is natural Intent DSL.
- `project.json` is a GDevelop/GDJS runtime artifact, not the AI continuation interface.
- Continue mode requires complete Intent iteration state: generated project output, `ProjectWorld`, and `ExecutionLedger`.
- Parser and surface errors may ask LLM2 to rewrite natural Intent DSL.
- Resolver, bridge, runtime, GDevelop truth, semantic playtest, and cache failures route to their owning system layer.
- Action candidates are consolidated as semantic repair intent, not allowed to grow into a large list of low-level action types.
- Deprecated inputs and compatibility aliases should be removed, not disabled or preserved.

## Main Commands

```bash
# Full AI gate. Use the local GDevelop checkout as runtime truth source.
set GAMECASTLE_GDEVELOP_SOURCE_DIR=D:\GDevelop-master
npm run check:ai

# Generate an offline Intent fixture into output/.
npm run gen

# Continue the current complete Intent iteration state.
node ai/pipeline.js --continue "加入一个 Boss，并让金币更密集"

# Run the deterministic AI test suite.
npm run test:ai

# Refresh/check extracted GDevelop runtime truth.
npm run truth:extract
npm run truth:check

# Prepare the cached browser GDJS runtime on a fresh checkout.
npm run runtime:prepare
```

`--intent-fixture-file` is only an Intent artifact entry. Offline fixtures must live under `ai/fixtures/intent-*.dsl`; generated repair artifacts must live under `output/*.intent.dsl`.

Frontend dependencies live under `platform/`:

```bash
npm --prefix platform install
npm run dev
```

## Runtime Truth

GameCastle does not hand-maintain GDevelop object types, behavior types, object data fields, or extension includes. `scripts/extract-gdevelop-truth.js` extracts the supported runtime surface from `D:\GDevelop-master` into `ai/gdevelop-truth/runtime-truth.json`.

`ai/gdevelop-truth.js` is the single in-repo entry for those facts. HTML export reads from the same truth snapshot and fails fast on unsupported runtime types.

## Useful Docs

- [Architecture](docs/architecture.md)
- [AI-first Intent Runtime Bridge](docs/ai-first-intent-runtime-bridge.md)
- [Module Composition](docs/module-composition.md)
- [Roadmap](docs/roadmap.md)
