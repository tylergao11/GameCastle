# Semantic Engine Terra Handoff

## Current truth

The semantic engine is rebuilt from a pinned GDevelop source checkout. There is one semantic document path and no compatibility reader or fallback route.

`ai/gdevelop-truth/capability-universe.json` is generated from every GDevelop no-code extension declaration. It contains 2,481 capabilities plus 19 declared object types and 27 declared behavior types, with source evidence, aliases, families, and runtime declaration facts.

`ai/gdevelop-truth/official-capability-bindings.json` records runtime availability without guessing: 2,441 capabilities are executable on the pinned GDJS runtime; 39 are unavailable source declarations and one is explicitly codegen-inoperable. Source/runtime metadata mismatches are not promoted into executable bindings.

`ai/gdevelop-truth/event-grammar.json` is generated from the official event registration plus each event class declaration and serializer. It contains all nine registered event types, official descriptions, execution/subevent/variable/list capabilities, source-verified serialization parameters, emission rules, defaults, and evidence hashes.

`ai/semantic-mapping/capability-semantic-index.json` is the generated GDJS Semantic Dictionary and the only production GDJS capability/event truth input. Every entry has a deterministic semantic reference, official explanation, source evidence, parameter contract, event role, and explicit runtime status. Executable parameter contracts follow official runtime order and carry value kind, optionality, exact default, generated normalization, and token vocabulary. Component snapshots are inputs to extraction and drift checks, not parallel production inputs. Facts unavailable in the official declaration are represented as `not-declared-by-capability-metadata`; they are never inferred.

`dictionarySource` also pins the semantic-layout dictionary hash. A source document therefore cannot silently assemble against a changed layout vocabulary.

## Architecture boundary

LLM1 owns creative direction. LLM2 is the final design decision maker and writes one batch of canonical function-shaped semantic DSL from positive fill-in forms. The prompt contains no examples. The LLM2 provider request has no JSON schema or JSON response format. The local runtime incrementally applies `name(...)` commands and materializes either a complete `GameSemanticSource` or an incremental `GameSemanticRevision`.

Both roles use DeepSeek V4 Flash with thinking enabled. LLM1 uses medium reasoning and temperature `1.5`; LLM2 uses high reasoning and temperature `0`. Production LLM2 allows at most eight rounds and 120 seconds. `scripts/debug-snake-real-llm.js` defaults to one round and 120 seconds for atomic inspection; callers explicitly select the phase count needed by the test.

The generated GDJS Semantic Dictionary is the total runtime truth. `ai/semantic-event-algebra.js` is a dictionary-validated semantic projection: it owns names and composition such as `object.collides`, `state.number.add`, and `text.display-number`, while the dictionary alone decides whether each exact capability, kind, parameter contract, object type, behavior type, and event type exists and is executable.

Everything after LLM2 is deterministic compilation:

```text
GameSemanticSource / GameSemanticRevision
  -> Semantic Compiler -> GDJS event graph
  -> Asset Requirement Compiler -> asset requests
  -> Layout Compiler -> layout intent + reservation
  -> RuntimeLinker -> spatial assembly request + libGD-validated project seed
  -> accepted AssetWorld -> source-hash-checked GDJS resource binding seed
  -> assembly-time native geometry facts + GDJS scene-canvas + pinned coordinate evidence
  -> Spatial Planner visual candidate -> Runtime validation -> GDJS candidate preview
  -> later ACCEPT -> canonical spatial resolution -> final GDJS project artifact
```

Asset, layout, and runtime assembly are peers that consume one semantic source. None is allowed to choose gameplay, components, templates, numbers, or asset meaning after LLM2.

The current RuntimeLinker produces the source-bound assembly manifest, a spatial assembly request, and a project seed compiled by pinned official libGD. `ai/gdjs-project-asset-binder.js#bindResources` accepts only an accepted `semantic-asset-world` with the exact source hash and materializes its verified resource through official libGD, returning an asset-bound seed rather than a falsely completed layout. `shared/gdjs-asset-binding-dictionary.json` explicitly covers all 19 official executable object configurations: 15 declare the exact resource kind, accepted formats, and official configuration operation; 4 explicitly declare that they consume no external resource. PNG production satisfies `image` slots through its pixel/vision closed loop. Font, video, model3D, Spine, and JSON slots use a separate accepted-local-resource closed loop: kind, format, file hash, source hash, and official libGD compilation are all required; no image-model fallback exists. `shared/semantic-layout-dictionary.json` owns explainable layout intent. `shared/spatial-engine-contract.json` requires accepted native geometry, GDevelop coordinate-model evidence, and the exact GDJS scene canvas before the visual Spatial Planner can propose a candidate. Runtime validates the candidate rather than designing it; only a later accepted preview becomes canonical spatial truth.

## Feedback boundary

`ai/semantic-feedback-contract.js` owns the only feedback document accepted by LLM2: `semantic-feedback-batch`.

Each entry is a source-bound observed fact:

- `feedbackId`, `kind`, and semantic subjects;
- `observation.code`, plain-language `description`, and scalar `evidence` values;
- exact `baseSourceHash` and `baseStructureHash` for an existing world, or explicit `null` hashes for first-turn feedback.

The contract rejects routing and repair-decision fields. Feedback is provided to LLM2 as context; LLM2 alone decides the next design change. Deterministic layers apply DSL, report facts, or reject invalid artifacts.

## Incremental semantic boundary

`ai/semantic-event-algebra.js` is the single owner of foundation game semantics. Its stable entity kinds, behavior kinds, event kinds, conditions, actions, and expressions generate the foundation prompt. One semantic action may expand into multiple ordered dictionary invocations; `text.display-number` is defined as replace-text followed by append-number-expression. This composition is an executable algebra definition, not a prompt example.

`ai/semantic-reference-runtime.js` resolves that algebra through the generated dictionary, normalizes entity/member/behavior references, routes state members to scene variables or object variables, serializes semantic text and numbers into the correct GDJS expression forms, lowers booleans/operators into official tokens, and expands selected extension groups. Compact `x*`, `xo*`, `xb*`, and `xe*` handles expose exact retrieved operations and types; foundation forms remain the direct vocabulary. Layout, asset-family, style, and extension-group slots retain compact handles. Internal references remain runtime-only.

`ai/semantic-draft.js` owns local left-to-right Draft execution. It injects `dictionarySource`, applies component instances, normalizes fixed and named component bindings, builds nested events through `event.parent`, fills dictionary-declared event parameters and locals, accepts open `when/then` operations, expands semantic multiplication, persists semantic use/operation/part/size plus channel/inversion/await provenance, replaces a whole expansion group as one operation, and materializes strict Source v6 or Revision documents. Internal `gdjs://...` and `gc-component://...` references remain server-side. Recursive member and event-local values materialize through one official number/string/boolean/structure/array serializer.

The component expander resolves inherited dictionary blueprints, target members, configuration-selected branches, repeated transition events, and semantic bindings into private compilation material. Its public evidence contains hashes and generated IDs rather than a second `game-semantic-source`. Action Button, Virtual Joystick, Cooldown Skill, and State Machine are the public coarse components; their visual variants, effects, triggers, states, and transitions remain configuration or bindings. Control surfaces use centered drawing and dictionary safe-area placements. The event compiler then emits serializer-derived event envelopes, instruction-list channels including `whileConditions`, exact event parameter defaults/emission, local-variable keys, and subevent emission. Source v6 rejects raw capability IDs, malformed expansion groups, unnormalized parameter values, expression-kind mismatches, missing component collections, v4 documents, and legacy event shapes rather than translating them.

`ai/semantic-run-ledger.js` owns incremental feedback. Every successful command records a compact applied boundary in `[task-ledger]`; the updated Draft owns the applied semantic structure. Extension results accumulate in `[retrieve]`; parse, validation, assembly, parameter, and `complete()` failures become value-safe `[errs]` facts. Empty WORLD sections are omitted. The next LLM2 round receives the same task plus the updated Draft and completes the remaining work. A repeated normalized failure fuses on its second occurrence.

`ai/semantic-llm2-runtime.js` enforces separate extension-read, Draft-write, and `complete()` batches, keeps the complete existing Source server-side, and emits ordered `runTrace` entries through `onSemanticRound` for durable diagnosis.

## Product execution boundary

`ai/semantic-product-executor.js` is the deterministic product boundary. It accepts one complete `GameSemanticSource`, an optional source-hash-checked `GameSemanticRevision`, and an optional accepted `semantic-asset-world`; it returns either a libGD-validated project seed or a source-hash-checked asset-bound project seed. `server/semantic-engine-api.js` exposes the same boundary as `POST /semantic/execute` (default port `3030`; `npm run semantic:serve`). It rejects unknown fields, including legacy feedback and routing fields. It does not call LLM1/LLM2, select a component, or decide a repair.

Layout realization, local LLM2 revisions, and seven game-family semantic assembly coverage are required gates. The family coverage proves architecture compatibility and does not claim empty samples are playable games.

## Retired legacy boundary

Retired assembly, product-composition, local-runtime client, studio, owner-routed feedback, and the former semantic-asset cache paths have been removed. The current `AssetLibrary` is the only cross-project asset reuse and publication boundary; the frontend does not call it directly.

## Gate

Run:

```powershell
npm run check:semantic-engine
npm run check:project
npm run semantic:serve
```

The gate verifies source snapshots, runtime bindings, event grammar, full dictionary coverage, event-algebra dictionary closure, extension retrieve, local Draft execution, incremental run-ledger feedback, non-image resource ingestion, deterministic product execution, and the HTTP product boundary.
