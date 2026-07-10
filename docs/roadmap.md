# GameCastle Roadmap

This roadmap tracks the live AI-first Intent Engine, not migration history.

## Current Intent Loop

- User request becomes a natural creative brief.
- LLM2 writes natural Intent DSL only.
- Intent Compiler, Resolver, Bridge, Runtime, GDevelop truth, and Semantic Playtest own lowering, validation, execution, and diagnostics.
- ProjectWorld, ExecutionLedger, IntentWorldView, and Semantic Iteration Memory preserve enough state for continued iteration.
- Repair uses owner-routed diagnostics or safe semantic repair Intent.

## Active Priorities

- Split `ai/pipeline.js` into clearer design, compile, execute, state, and provider owners.
- Keep the LLM2 surface small: natural intent, semantic evidence, owner routes, and safe requested context slots.
- Continue strengthening semantic playtest coverage for creation and follow-up iteration.
- Expose current module, generation step, and playable version state in the platform UI.
- Keep generated artifacts out of review noise unless the command explicitly asks to refresh them.

## Boundary Rules

- LLM2 has one product surface: natural Intent DSL.
- Intent Engine entry points use one canonical shape per owner path.
- Prompt examples and fixtures use current Intent DSL and semantic evidence.
- No broad action-command list growth; action instructions are consolidated through semantic repair intent and verified decision outcomes.
