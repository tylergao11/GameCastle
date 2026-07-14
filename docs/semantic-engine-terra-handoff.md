# Semantic Engine Terra Handoff

## Current truth

The semantic engine is rebuilt from a pinned GDevelop source checkout. There is one semantic document path and no compatibility reader or fallback route.

`ai/gdevelop-truth/capability-universe.json` is generated from every GDevelop no-code extension declaration. It contains 2,481 capabilities plus 19 declared object types and 27 declared behavior types, with source evidence, aliases, families, and runtime declaration facts.

`ai/gdevelop-truth/official-capability-bindings.json` records runtime availability without guessing: 2,442 capabilities are executable on the pinned GDJS runtime; 39 are source-only and remain visible as such.

`ai/gdevelop-truth/event-grammar.json` is generated from the official event registration and event class headers. It currently contains all nine registered event types and their official descriptions, execution/subevent/variable/list capabilities, and source evidence.

`ai/semantic-mapping/capability-semantic-index.json` is the generated GDJS Semantic Dictionary. Every entry has a deterministic semantic reference, official explanation, source evidence, parameter contract, event role, and explicit runtime status. Facts unavailable in the official declaration are represented as `not-declared-by-capability-metadata`; they are never inferred.

`dictionarySource` also pins the semantic-layout dictionary hash. A source document therefore cannot silently assemble against a changed layout vocabulary.

## Architecture boundary

LLM1 owns only creative language. LLM2 is the final design decision maker. LLM2 writes either a complete `GameSemanticSource`, an incremental `GameSemanticRevision`, or a `semantic-context-request`.

Everything after LLM2 is deterministic compilation:

```text
GameSemanticSource / GameSemanticRevision
  -> Semantic Compiler -> GDJS event graph
  -> Asset Requirement Compiler -> asset requests
  -> Layout Solver -> layout realization
  -> RuntimeLinker -> source-bound assembly manifest + libGD-validated project seed
  -> accepted AssetWorld -> source-hash-checked GDJS asset binding
  -> layout realization -> final project artifact
```

Asset, layout, and runtime assembly are peers that consume one semantic source. None is allowed to choose gameplay, components, templates, numbers, or asset meaning after LLM2.

The current RuntimeLinker produces the source-bound assembly manifest and a project seed compiled by pinned official libGD. `ai/gdjs-project-asset-binder.js` accepts only an accepted `semantic-asset-world` with the exact source hash and materializes its verified resource through official libGD. `shared/gdjs-asset-binding-dictionary.json` explicitly covers all 19 official executable object configurations: 15 declare the exact resource kind, accepted formats, and official configuration operation; 4 explicitly declare that they consume no external resource. PNG production satisfies `image` slots through its pixel/vision closed loop. Font, video, model3D, Spine, and JSON slots use a separate accepted-local-resource closed loop: kind, format, file hash, source hash, and official libGD compilation are all required; no image-model fallback exists. `shared/semantic-layout-dictionary.json` owns explainable layout anchors; the project assembler resolves a declared `layoutRef` into a GDJS scene instance using the official project dimensions, then libGD validates it.

## Feedback boundary

`ai/semantic-feedback-contract.js` owns the only feedback document accepted by LLM2: `semantic-feedback-batch`.

Each entry is a source-bound observed fact:

- `feedbackId`, `kind`, and semantic subjects;
- `observation.code`, plain-language `description`, and scalar `evidence` values;
- exact `baseSourceHash` and `baseStructureHash` for an existing world, or explicit `null` hashes for first-turn feedback.

The contract rejects routing and repair-decision fields. Feedback is provided to LLM2 as context; LLM2 alone decides whether to write a complete source, a revision, or an exact dictionary query. Deterministic layers only report facts or reject invalid artifacts.

## Dictionary query boundary

`ai/semantic-context-provider.js` is the only current dictionary read service for LLM2. It executes only explicit requests:

- `list_semantic_owners`
- `list_semantic_members`
- `describe_semantic_member`
- `list_semantic_operations`
- `resolve_semantic`
- `search_semantic_members`
- `list_event_types`
- `describe_event_type`
- `list_object_types`
- `describe_object_type`
- `list_behavior_types`
- `describe_behavior_type`
- `list_layout_relations`
- `describe_layout_relation`

It fails on an unknown operation, unknown owner/member/event, missing search limit, duplicate query ID, or unknown field. It does not interpret creative text or choose targets.

## Product execution boundary

`ai/semantic-product-executor.js` is the deterministic product boundary. It accepts one complete `GameSemanticSource`, an optional source-hash-checked `GameSemanticRevision`, and an optional accepted `semantic-asset-world`; it returns either a libGD-validated project seed or a source-hash-checked bound project. `server/semantic-engine-api.js` exposes the same boundary as `POST /semantic/execute` (default port `3030`; `npm run semantic:serve`). It rejects unknown fields, including legacy feedback and routing fields. It does not call LLM1/LLM2, select a component, or decide a repair.

Layout realization, local LLM2 revisions, and seven game-family semantic assembly coverage are required gates. The family coverage proves architecture compatibility and does not claim empty samples are playable games.

## Removed legacy boundary

Retired assembly, product-composition, cloud-library, local-runtime client, studio, and owner-routed feedback paths have been removed. The product boundary is the independent semantic execution API; the frontend does not call any retired runtime endpoint.

## Gate

Run:

```powershell
npm run check:semantic-engine
npm run check:project
npm run semantic:serve
```

The gate verifies source snapshots, runtime bindings, event grammar, full dictionary coverage, fail-closed context reads, non-image resource ingestion, deterministic product execution, and the HTTP product boundary.
