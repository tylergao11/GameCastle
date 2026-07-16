# Semantic Engine Terra Handoff

## Current truth

The semantic engine is rebuilt from a pinned GDevelop source checkout. There is one semantic document path and no compatibility reader or fallback route.

`packages/gdjs/generated/capability-universe.json` is generated from every GDevelop no-code extension declaration. It contains 2,481 capabilities plus 19 declared object types and 27 declared behavior types, with source evidence, aliases, families, and runtime declaration facts.

`packages/gdjs/generated/official-capability-bindings.json` records runtime availability without guessing: 2,441 capabilities are executable on the pinned GDJS runtime; 39 are unavailable source declarations and one is explicitly codegen-inoperable. Source/runtime metadata mismatches are not promoted into executable bindings.

`packages/gdjs/generated/event-grammar.json` is generated from the official event registration plus each event class declaration and serializer. It contains all nine registered event types, official descriptions, execution/subevent/variable/list capabilities, source-verified serialization parameters, emission rules, defaults, and evidence hashes.

`packages/semantic/generated/capability-semantic-index.json` is the generated GDJS Semantic Dictionary and the only production GDJS capability/event truth input. Every entry has a deterministic semantic reference, official explanation, source evidence, parameter contract, event role, and explicit runtime status. Executable parameter contracts follow official runtime order and carry value kind, optionality, exact default, generated normalization, and token vocabulary. Component snapshots are inputs to extraction and drift checks, not parallel production inputs. Facts unavailable in the official declaration are represented as `not-declared-by-capability-metadata`; they are never inferred.

`dictionarySource` also pins the semantic-layout dictionary hash. A source document therefore cannot silently assemble against a changed layout vocabulary.

## Architecture boundary

Director Planner owns cross-domain scheduling but not domain design. Its default LangGraph path freezes the canonical `director-dsl-v1` sequence `semantic.design → asset.realize → assembly.verify` locally and makes no model call. Within semantic design, Semantic Planner first emits one complete stream of typed `plan-*` commands; Runtime derives required built-in catalogs from target commands, validates the result, and freezes that TaskPlan. The DSL Executor emits one canonical function-shaped Draft-write batch for the active task. Runtime validates and assembles the final Source and completes the run deterministically. `fact(...)`, `list(...)`, and `record(...)` own model-visible context and composite values in the model wire language. TaskPlan is the semantic domain's only mutation scope. The prompts contain no examples and provider requests use no response schema or alternate response format.

Provider and model selection are injected through the Semantic Model Port. The current local provider is pinned CUDA llama.cpp serving `Qwen/Qwen3.5-9B` on port `8002`; Planner and Executor share that resident model while keeping separate role requests. Every call disables provider-visible thinking and carries a phase-specific GBNF generated from the same `semantic-dsl-v9` syntax registry. The grammar fixes command names, declared field order and types, composite value shapes, and quoted text; Parser, TaskPlan, Draft, Dictionary, and Runtime checks remain the semantic authority. The semantic model protocol is DSL-only even though the private HTTP transport uses a JSON request envelope. Calls reserve the explicit 8196-token output ceiling for the complete DSL batch. The semantic run has one hard 300-second deadline; Planner and task calls receive only the remaining shared budget, with no phase-specific model deadlines and no model finalization call. State-machine progress replaces fixed rounds.

The Director model port is deliberately separate. `Qwen/Qwen3-4B-Instruct-2507` and port `8001` are configuration reservations for explicit `dynamicPlanning: true`; that model is not resident or required in the current 8 GB single-GPU deployment. Ollama is not a Semantic fallback and remains scoped to Spatial vision configuration.

The generated GDJS Semantic Dictionary is the total runtime truth. `packages/semantic/src/semantic-event-algebra.js` is a dictionary-validated semantic projection: it owns names and composition such as `object.collides`, `state.number.add`, and `text.display-number`, while the dictionary alone decides whether each exact capability, kind, parameter contract, object type, behavior type, and event type exists and is executable.

Everything after LLM2 is deterministic compilation:

```text
ProductDeliveryOrchestrator + persisted ProductDeliveryRun
  -> initial GameSemanticSource / source-bound GameSemanticRevision
  -> Semantic Compiler -> GDJS event graph
  -> Asset Requirement Compiler -> asset requests
  -> Layout Compiler -> layout intent + reservation
  -> RuntimeLinker -> spatial assembly request + libGD-validated project seed
  -> complete accepted AssetWorld v4 -> source-hash-checked GDJS resource binding seed
  -> assembly-time native geometry facts + GDJS scene-canvas + pinned coordinate evidence
  -> Spatial Planner visual candidate -> Runtime validation -> GDJS candidate preview
  -> later ACCEPT -> canonical spatial resolution -> final GDJS projection
  -> official libGD HTML export -> tokenized loopback HTTP -> real browser capture
  -> independent assembly review bound to exact build and screenshot hashes
  -> accepted product

Rejected assembly
  -> exact-target source-bound factual FeedbackBatch
  -> LLM2 Revision through a new frozen TaskPlan
  -> new source hash clears all downstream artifacts
  -> rerun AssetWorld, spatial projection, capture, and review
```

Asset, layout, and runtime assembly are peers that consume one semantic source. None is allowed to choose gameplay, components, templates, numbers, or asset meaning after LLM2.

The current RuntimeLinker produces the source-bound assembly manifest, a spatial assembly request, and a project seed compiled by pinned official libGD. `packages/gdjs/src/gdjs-project-asset-binder.js#bindResources` accepts only an accepted `semantic-asset-world` with the exact source hash and materializes its verified resource through official libGD, returning an asset-bound seed rather than a falsely completed layout. `packages/gdjs/contracts/gdjs-asset-binding-dictionary.json` explicitly covers all 19 official executable object configurations: 15 declare the exact resource kind, accepted formats, and official configuration operation; 4 explicitly declare that they consume no external resource. PNG production satisfies `image` slots through its pixel/vision closed loop. Font, video, model3D, Spine, and JSON slots use a separate accepted-local-resource closed loop: kind, format, file hash, source hash, and official libGD compilation are all required; no image-model fallback exists. `packages/semantic/contracts/semantic-layout-dictionary.json` owns explainable layout intent. `packages/spatial/contracts/spatial-engine-contract.json` requires accepted native geometry, GDevelop coordinate-model evidence, and the exact GDJS scene canvas before the visual Spatial Planner can propose a candidate. Runtime validates the candidate rather than designing it; only a later accepted preview becomes canonical spatial truth.

## Feedback boundary

`packages/semantic/src/semantic-feedback-contract.js` owns the only feedback document accepted by LLM2: `semantic-feedback-batch`.

Each entry is a source-bound observed fact:

- `feedbackId`, `kind`, and exact semantic targets;
- `observation.code`, plain-language `description`, and scalar `evidence` values;
- exact `baseSourceHash` and `baseStructureHash` for an existing world, or explicit `null` hashes for first-turn feedback.

The contract rejects routing, repair-decision, `changeScope`, `maxRounds`, and other execution-control fields. Feedback is provided to LLM2 as context; LLM2 alone decides the next design change through a newly frozen TaskPlan. Deterministic layers apply DSL, report facts, or reject invalid artifacts.

## Incremental semantic boundary

`packages/semantic/src/semantic-event-algebra.js` is the single owner of foundation game semantics. Its stable entity kinds, behavior kinds, event kinds, conditions, actions, and expressions generate the foundation prompt. One semantic action may expand into multiple ordered dictionary invocations; `text.display-number` is defined as replace-text followed by append-number-expression. This composition is an executable algebra definition, not a prompt example.

`packages/semantic/src/semantic-reference-runtime.js` resolves that algebra through the generated dictionary, normalizes entity/member/behavior references, routes state members to scene variables or object variables, serializes semantic text and numbers into the correct GDJS expression forms, lowers booleans/operators into official tokens, and expands selected extension groups. Compact `x*`, `xo*`, `xb*`, and `xe*` handles expose exact retrieved operations and types; foundation forms remain the direct vocabulary. Layout, asset-family, style, and extension-group slots retain compact handles. Internal references remain runtime-only.

`packages/semantic/src/semantic-draft.js` owns local left-to-right Draft execution. It injects `dictionarySource`, applies component instances, normalizes fixed and named component bindings, builds nested events through `event.parent`, fills dictionary-declared event parameters and locals, accepts open `when/then` operations, expands semantic multiplication, persists semantic use/operation/part/size plus channel/inversion/await provenance, replaces a whole expansion group as one operation, and materializes strict Source v6 or Revision documents. Internal `gdjs://...` and `gc-component://...` references remain server-side. Recursive member and event-local values materialize through one official number/string/boolean/structure/array serializer.

Draft event metadata and event logic remain separate Runtime forms. Executor selects event metadata, condition, and action slots; Runtime resolves them into the internal event, condition, action, and parent addresses before Draft execution. JSON compatibility is outside the protocol.

The component expander resolves inherited dictionary blueprints, target members, configuration-selected branches, repeated transition events, and semantic bindings into private compilation material. Its public evidence contains hashes and generated IDs rather than a second `game-semantic-source`. Action Button, Virtual Joystick, Cooldown Skill, and State Machine are the public coarse components; their visual variants, effects, triggers, states, and transitions remain configuration or bindings. Control surfaces use centered drawing and dictionary safe-area placements. The event compiler then emits serializer-derived event envelopes, instruction-list channels including `whileConditions`, exact event parameter defaults/emission, local-variable keys, and subevent emission. Only Source v6 with normalized parameter values, complete component collections, valid expansion groups and the current event shape is accepted.

`packages/semantic/src/semantic-run-state-machine.js` is the only run-state and fuse owner. Its immutable hash-chained events project the legal mode, frozen plan hash/task order, active task, completed task receipts, deterministic retrieval receipts, final Source hash, and one consecutive-identical-failure signature. A Draft-write executes on a fork; any failure discards the whole candidate and records equal before/after hashes. Only a verified task receipt advances the active task. Terminal completion, fuse, and expiry are ledger projections, not mutable side fields.

`packages/semantic/src/semantic-llm2-runtime.js` seals the plan, performs declared extension lookup deterministically, enforces one write batch per active task, then revalidates, assembles, and completes the final Source without another model call. It emits ordered `runTrace` evidence through `onSemanticEvent`; observer failures are diagnostics and cannot change semantic state. Planner and Executor stable-prefix hashes, bytes, cache usage, latency, outputs, and deterministic outcomes are recorded per model call.

## Product execution boundary

`apps/api/src/server.js` exposes the current product service on authenticated loopback HTTP (default `127.0.0.1:3030`; `PRODUCT_ENGINE_TOKEN` is mandatory; `npm run product:serve`). `POST /product/deliver` accepts only delivery/project identity and the initial user request, then delegates to `packages/product/src/product-delivery-orchestrator.js`, the only complete-product coordinator. Semantic design creates the normal initial Source; only the internal programmatic orchestrator may receive one fully validated Source for trusted bootstrap or resume. Product composition owns storage paths, dictionary, budgets, semantic settings, Asset/Spatial policy, capture authority, and reviewer; none are HTTP request fields. `ProductDeliveryRun` persists the source hash, stage attempts, budgets, artifact hashes, observation fuse, and terminal state. The orchestrator owns `Source/Revision -> official Asset LangGraph -> complete AssetWorld -> asset-bound seed -> native geometry -> official Spatial LangGraph -> accepted spatial projection -> real-browser capture -> independent assembly review`. Only classified semantic quality observations become source-bound FeedbackBatch entries; provider, contract, evidence, filesystem, and runtime failures block as system faults.

An accepted assembly returns the hash-bound product. Its browser evidence is issued only by the product capture authority, HMAC-signed, and independently checked against the libGD build manifest, loopback response build hash, PNG bytes, viewport, and runtime/network/console error set. A rejected assembly with exact semantic targets returns facts to LLM2. A valid Revision activates a new source hash and clears every prior AssetWorld, bound seed, geometry fact set, spatial resolution/projection, browser capture, assembly review, and AssetCard projection before all downstream stages run again. AssetCard is inspection-only and cannot mutate or replace Source, AssetWorld, accepted spatial truth, or ProductDeliveryRun.

One cross-process lease serializes a delivery. Provider calls use a collision-resistant delivery namespace and atomically persisted receipts; recovery reconciles their settled cost before any new work. Semantic budget is authorized before invoking LLM2. Recovery of a nonterminal interrupted run keeps all usage and fuse counters, clears downstream references, and reruns from the persisted hash-addressed active Source. One second assembly attempt exists only to complete a single interrupted full rerun; an assembly failure itself is never retried locally.

`POST /semantic/execute` calls `packages/semantic/src/semantic-product-executor.js` only as a strict deterministic Source/Revision compilation sub-boundary. It accepts `requestId`, one complete `GameSemanticSource`, and an optional source-hash-checked `GameSemanticRevision`; unknown fields are rejected. It returns a libGD-validated project seed. It accepts no AssetWorld and does not call a model, run providers, write assets, perform spatial assembly, capture a browser, review assembly, or decide a repair.

Layout realization, local LLM2 revisions, and seven game-family semantic assembly coverage are required gates. The family coverage proves architecture compatibility and does not claim empty samples are playable games.

## Client boundary

The checked-in web application is currently a static shell; it does not yet call
the Product Engine API or consume accepted delivery products. The API remains
the only supported future integration boundary. `AssetLibrary` is the only
cross-project asset reuse and publication boundary, and remains server-side;
the frontend cannot submit AssetWorld, stage state, feedback routing, or
storage credentials.

## Gate

Run:

```powershell
npm run check:semantic-engine
npm run check:semantic-loop
npm run check:product-loop
npm run check:project
npm run product:serve
```

The gates verify source snapshots, runtime bindings, event grammar, full dictionary coverage, event-algebra dictionary closure, frozen TaskPlan feasibility, deterministic task retrieval, authoritative Draft slicing, atomic write receipts/rollback, the single semantic state/fuse ledger, prompt-cache hashes, six-task offline record/replay parity, complete AssetWorld acceptance, ProductDeliveryRun invalidation, native geometry and spatial acceptance, real-browser capture integrity, independent assembly review, factual feedback-to-Revision rerun, and both HTTP boundaries.
