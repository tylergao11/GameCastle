# Tests

`npm run check:project` is the only complete repository acceptance gate. Its owner is `tests/run-project-gate.js`.

The domain folders contain the gate's executable evidence:

- `semantic/`: LLM2 planning, Source/Revision, compiler, official capability truth, and semantic benchmarks.
- `asset/`: Asset LangGraph, production, derivation, library, style, binding, and local raster checks.
- `product/`: delivery orchestration, AssetCard projection, browser capture, assembly review, and feedback reruns.
- `provider/`: provider governance, transports, receipts, and cache observations.
- `network/`: multiplayer runtime, signaling, replay, persistence, and end-to-end bridge checks.
- `fixtures/`: reusable test-only ports and semantic seed documents. Production modules must not import this directory.
- `benchmarks/`: benchmark definitions consumed by the canonical semantic suites; it is not a second test entrypoint.
- `live/`: explicitly authorized external probes. These are not part of offline project acceptance.

Narrower npm suites are diagnostic slices only. They do not establish project acceptance. Do not add test entrypoints under `apps/`, `packages/`, `scripts/`, or `tests/benchmarks/`.
