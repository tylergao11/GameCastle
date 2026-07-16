# Core packages

`packages/` contains the reusable product capabilities. Applications may compose these packages, but package code must not import from `apps/`, `tests/`, or `scripts/`.

| Package | Authority |
| --- | --- |
| `semantic` | LLM2 TaskPlan loop, semantic DSL, Source/Revision validation, component expansion, compilation, and the generated semantic dictionary. |
| `assets` | Official Asset LangGraph, AssetWorld, deterministic derivation, review, library publication, contracts, and pinned workflows. |
| `spatial` | Visual Planner LangGraph, candidate validation, deterministic spatial runtime, and the sole accepted spatial resolution. |
| `product` | ProductDeliveryRun and the complete asset → spatial → browser assembly → factual feedback → LLM2 Revision loop. |
| `providers` | Provider governance, model transports, authorization, receipts, and runtime adapters. |
| `gdjs` | Pinned GDevelop truth, libGD compilation, resource binding, spatial projection, HTML export, and browser capture. |
| `network` | Multiplayer client/runtime synchronization, protocol contract, and generated network templates. |

Each contract, generated truth, component manifest, workflow, and template is colocated with its owning package. There is no repository-level `shared`, `runtime`, `contracts`, or `generated` truth directory.

## Dependency direction

```text
semantic ─┬─> gdjs
          └─> providers

assets ───┬─> providers
          └─> gdjs

spatial ──> gdjs

product ──> semantic + assets + spatial + providers + gdjs

network is independent of product creation
```

Semantic, Asset, and Spatial orchestration continue to use their official LangGraph implementations. Product composition coordinates their accepted outputs; it does not duplicate their internal control authority.
