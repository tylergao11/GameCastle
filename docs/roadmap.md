# GameCastle Roadmap

The authoritative whole-product completion program is now
`shared/project-completion-contract.json`, with implementation order in
`docs/project-completion-terra-roadmap.md`. This document remains the Intent Engine
roadmap and must not be used to mark Project Weave, publishing, project cloud,
multiplayer, or operations complete.

This roadmap tracks the live AI-first Intent Engine.

## Current Intent Loop

- User request becomes a natural creative brief.
- LLM2 writes natural Intent DSL only.
- Intent Compiler, Resolver, Bridge, Runtime, GDevelop truth, and Semantic Playtest own lowering, validation, execution, and diagnostics.
- ProjectWorld, ExecutionLedger, IntentWorldView, and Semantic Iteration Memory preserve enough state for continued iteration.
- Repair uses owner-routed diagnostics or safe semantic repair Intent.

## Active Priorities

- Finish moving the remaining GDJS execution helpers out of `ai/pipeline.js` into dedicated owners.
- Keep the LLM2 surface small: natural intent, semantic evidence, owner routes, and safe requested context slots.
- Continue strengthening semantic playtest coverage for creation and follow-up iteration.
- Expose current module, generation step, and playable version state in the platform UI.
- Keep generated artifacts out of review noise unless the command explicitly asks to refresh them.
- Build the Visual Asset Loop before wiring image providers: local drawing/upload, cloud reuse,
  deterministic variants, controlled image edit/generation, and bounded vision review must use one
  conditional Asset Weave graph. See [Visual Asset Loop](visual-asset-loop.md),
  [boundaries](visual-asset-boundaries.md), and the [test matrix](visual-asset-test-matrix.md).

## Boundary Rules

- LLM2 has one product surface: natural Intent DSL.
- Intent Engine entry points use one canonical shape per owner path.
- Prompt examples and fixtures use current Intent DSL and semantic evidence.
- No broad action-command list growth; action instructions are consolidated through semantic repair intent and verified decision outcomes.
- No visual asset node may bypass `local -> cloud -> deterministic variant -> model edit -> new generation`.
  Placeholder assets remain explicit non-publishable debt.
