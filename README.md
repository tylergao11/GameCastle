# GameCastle

GameCastle is an AI-first game creation runtime. Its product path is not "generate a disposable mini game from one prompt"; it is "keep shaping a playable game project through natural intent, semantic evidence, and owner-routed execution."

Current AI-first boundary: LLM2 fills a closed Intent slot packet only. A deterministic slot renderer owns natural Intent DSL generation. Engine facts such as coordinates, component ids, GDJS objects, runtime adapters, internal target commands, and GDevelop `project.json` mutations belong to compiler, bridge, runtime, and validation owners.

## Goal

GameCastle is building a closed loop:

```text
user intent / iteration request
  -> LLM1 unrestricted CreativeVision
  -> safe IntentWorldView + semantic playtest evidence
  -> LLM2 command kinds + declared slots
  -> deterministic natural Intent DSL renderer
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
| `ai/gdevelop-truth/` | Extracted GDevelop/GDJS runtime truth from `C:\Ai\GDevelop-master`; project emission must validate against this snapshot. |
| `engine/` | Cached official GDJS browser runtime used by HTML export. |
| `platform/` | React/Vite product shell for creation, iteration, playtest, and future publishing/multiplayer surfaces. |
| `server/local-runtime/` | Single-project boundary for real pipeline runs, status events, rollback, and playable artifacts. |
| `docs/` | Longer architecture notes, roadmap, and bridge/runtime design records. |
| `output/` | Generated artifacts: `project.json`, `game.html`, `project-world.json`, `execution-ledger.json`, semantic reports, and intent artifacts. |

## Engine Boundaries

- LLM1 owns unrestricted creative imagination in natural text.
- LLM2 owns semantic recognition and fills the closed Intent slot packet.
- The deterministic renderer owns natural Intent DSL.
- `project.json` is a GDevelop/GDJS runtime artifact, not the AI continuation interface.
- Continue mode requires complete Intent iteration state: generated project output, `ProjectWorld`, and `ExecutionLedger`.
- Slot validation errors return to LLM2 with the declared slot meanings for a corrected packet.
- Resolver, bridge, runtime, GDevelop truth, semantic playtest, and cache failures route to their owning system layer.
- Action candidates are consolidated as semantic repair intent, not allowed to grow into a large list of internal target action types.
- The Intent Engine keeps one live owner path for each product surface.

## Main Commands

```bash
# Start the Local Game Runtime and the frontend together.
npm run dev

# Asset/provider gate.
set GAMECASTLE_GDEVELOP_SOURCE_DIR=C:\Ai\GDevelop-master
npm run check:ai

# WP0 Project Weave gate: graph ownership, create/continue, checkpoint resume,
# owner-routed debt, and isolated playable artifacts.
npm run check:project

# Whole-product design contract (WP0-WP8).
npm run check:project-design

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
npm --prefix platform run build
```

## Runtime Truth

GameCastle does not hand-maintain GDevelop object types, behavior types, object data fields, or extension includes. `scripts/extract-gdevelop-truth.js` extracts the supported runtime surface from `C:\Ai\GDevelop-master` into `ai/gdevelop-truth/runtime-truth.json`.

`ai/gdevelop-truth.js` is the single in-repo entry for those facts. HTML export reads from the same truth snapshot and fails fast on unsupported runtime types.

## Useful Docs

- [Architecture](docs/architecture.md)
- [Local Game Runtime Boundary](docs/local-game-runtime.md)
- [AI-first Intent Runtime Bridge](docs/ai-first-intent-runtime-bridge.md)
- [Module Composition](docs/module-composition.md)
- [Roadmap](docs/roadmap.md)
- [Visual Asset Loop](docs/visual-asset-loop.md)
- [Visual Asset Boundaries](docs/visual-asset-boundaries.md)
- [Visual Asset Test Matrix](docs/visual-asset-test-matrix.md)
- [Local Asset Studio](docs/local-asset-studio.md)
- [Project Completion Architecture](docs/project-completion-architecture.md)
- [Project Completion Boundaries](docs/project-completion-boundaries.md)
- [Terra Project Roadmap](docs/project-completion-terra-roadmap.md)
- [Project Completion Test Matrix](docs/project-completion-test-matrix.md)
- [Project Store and Version Lifecycle](docs/project-store.md)
- [Creator Experience](docs/creator-experience.md)
