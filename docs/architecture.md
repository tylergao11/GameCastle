# GameCastle architecture

## Design ownership

LLM1 supplies creative language. LLM2 is the only design authority: it emits a complete `GameSemanticSource`, a source-hash-checked `GameSemanticRevision`, or a dictionary query. It may use normal numeric values. Relative edits are evaluated against the Source policy, so iteration does not require exposing a full runtime-value dump.

Everything after LLM2 is deterministic. Compilers and runtime layers cannot invent gameplay, choose templates, select components, or route a repair to a downstream owner.

## Deterministic graph

```text
Pinned GDevelop source
  -> capability universe + official bindings + event grammar + object configuration truth
  -> GDJS Semantic Dictionary
  -> GameSemanticSource / GameSemanticRevision
  -> event compiler + asset requirement compiler + layout compiler
  -> RuntimeLinker + official libGD project seed
  -> accepted AssetWorld
  -> GDJS asset binder + official libGD bound project
```

The dictionary records every declaration with source evidence and runtime availability. Source-only declarations remain queryable but cannot be emitted into a project.

## Source and feedback contracts

`GameSemanticSource` is strict and dictionary-pinned. Event calls use a semantic reference plus named dictionary arguments. Layout intents reference the layout dictionary. Asset intents are compiled from the same Source as events and layout.

`semantic-feedback-batch` contains source-bound observations, evidence, and descriptions. It has no owner route, repair instruction, or autonomous decision field. LLM2 receives those facts and decides the next Source or Revision.

## Asset contracts

The binding dictionary enumerates every official object configuration. Each record either declares no external resource or declares one exact resource kind, accepted formats, and official configuration operation.

- `image` resources use the image production and review loop.
- `font`, `video`, `model3D`, `spine`, and `json` resources require an accepted local artifact with matching kind, format, file hash, and source hash.
- No resource type is converted into another type as a fallback.

## Execution boundary

`POST /semantic/execute` is implemented by `server/semantic-engine-api.js`. It takes a complete Source, optional Revision, and optional accepted AssetWorld. It returns either `gdjs-project-seed` or `gdjs-bound-project`. Unknown fields are rejected.

The WebSocket multiplayer server is independent of this boundary. It is responsible only for rooms, signaling, and synchronization after a game runtime exists.

## Verification

`npm run check:semantic-engine` verifies the generated truth snapshots, full dictionary coverage, Source/Revision rules, fact-only feedback, asset binding, non-image resource ingestion, product execution API, seven family architecture coverage, and asset production contracts.
