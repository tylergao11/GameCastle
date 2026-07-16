# Module boundaries and truth audit

## Audit conclusion

The underlying delivery authorities are singular within each accepted path:

| Concern | Canonical source of truth | Acceptance boundary |
| --- | --- | --- |
| GDJS capabilities | generated GDJS Semantic Dictionary | `GameSemanticSource.dictionarySource` fingerprint |
| Game meaning | validated `GameSemanticSource` and source-bound revision | `SemanticAssembly` source and realized-source hashes |
| Asset acceptance | canonical Asset LangGraph records and `semantic-asset-world` v4 | complete production-set, work-item, and review receipts |
| GDJS resources | pinned GDJS assembler and resource binder | source hash + AssetWorld content hash |
| Geometry and coordinates | generated GDJS coordinate truth plus canonical geometry producer | `spatial-assembly-input` |
| Full product acceptance | `ProductDeliveryRun` | exact build, capture, review, and feedback evidence |

There is one important migration distinction that must not be hidden. The
existing `ProductDeliveryOrchestrator` and semantic executor still use
`semantic-runtime-linker`, which constructs a `semantic-runtime-assembly` and
its seed identity. The public workspaces construct a `semantic-assembly` and
adapt it to a public seed identity. Both paths delegate to the same generated
dictionary, Source validation, compilers, GDJS binder, AssetWorld, and spatial
owners; their semantic, seed, asset-binding, and spatial projections are
covered by an executable compatibility check. Their assembly and seed hashes
are deliberately different today, however, so the public path is not yet the
sole product-delivery path and must not be substituted for persisted legacy
runs without an explicit identity migration.

The legacy implementation packages also retain cross-package imports and are
not yet an acyclic publishable graph. The three public workspaces are therefore
a safe boundary extraction rather than a duplicated rewrite. They do not
introduce another dictionary, AssetWorld, GDJS compiler/binder, or geometry
producer, but they remain focused façades until the product migration lands.

Runtime preparation is also an evidence boundary: the pinned GDevelop source
and libGD binary must be checksum-verified. See [Pinned GDJS runtime
assets](gdevelop-runtime.md); do not treat a mutable `master/latest` download
as source-pinned evidence.

## Three public modules

### 1. Asset Engine - `@gamecastle/asset-engine`

Production entry: `runProduction(input)` delegates to the canonical Asset
LangGraph unchanged. `createOfflineRequirementSet({ semanticAssembly,
projectId })` is the explicit public semantic-to-asset bridge for the
constrained offline path: it recompiles the supplied source, requires a
single-resource image intent that permits PNG, and rejects forged, animated,
non-image, or no-PNG input. Its focused examples use `runOffline(requirementSet)` to
verify the public requirement/receipt/AssetWorld contract without ComfyUI,
CLIP, or a cloud library. It supports static PNG requirements only and fails
closed for formats, resource types, or artifact types outside that constrained
conformance environment.

```powershell
node packages/asset-engine/examples/deterministic-offline.js
node packages/asset-engine/examples/from-semantic-assembly.js
npm run check:asset-module
```

For a downstream GDJS binding example, pass an absolute `assetDir`; the module
materializes verified PNG bytes and rebuilds the returned AssetWorld so the
hash binds the actual path.

### 2. Semantic Module - `@gamecastle/semantic-module`

The module exports only the generated dictionary, Source validation, Revision
application, and deterministic `compileSemanticAssembly`. The result contains
the validated editable source, a component-expanded realized source, their two
hashes, event graph, asset requirements, and layout plan. It intentionally
does not create a project seed or spatial request, so it can be tested with
Node alone.

```powershell
node packages/semantic-module/examples/game-semantic-source-to-semantic-assembly.js
npm run check:semantic-module
```

### 3. Assembly Module - `@gamecastle/assembly-module`

This is the only new public consumer of both other workspaces. It verifies a
`SemanticAssembly`, validates an accepted AssetWorld against the same source
hash, then delegates project generation, resource binding, geometry facts, and
spatial handoff to their canonical internal owners. It never accepts
caller-supplied geometry and does not call `semantic-runtime-linker`.

```powershell
npm run runtime:prepare
$env:GAMECASTLE_LIBGD_PATH = (Resolve-Path '.gamecastle/cache/gdevelop/codegen/libGD.js')
node packages/assembly-module/examples/semantic-assembly-to-project-seed.js
npm run check:assembly-module
```

The assembly check proves this specific public chain:

```text
SemanticAssembly -> GDJS project seed -> AcceptedAssetWorld binding
                 -> canonical geometry facts -> spatial assembly input
```

## Verification commands

```powershell
npm install
npm run check:semantic-module
npm run check:asset-module
npm run check:assembly-module
npm run check:modules
```

`npm run check:project` additionally includes these module checks alongside the
existing full semantic, asset, product, provider, and network acceptance gate.
The module checks establish the three boundary contracts; only the project gate
establishes complete product acceptance.

`tests/modules/check-legacy-public-assembly-compatibility.js` is the migration
gate. It proves that the legacy linker and public facades produce equal semantic
compiler evidence, spatial requests, executable GDJS seed projection, and
asset-bound seed projection for a component-bearing source and a source
revision. It also asserts that their current assembly/seed identities differ.
Before the public path replaces the legacy product entry, that identity
difference needs a persisted-run migration plan and a shared compiler-core
change, followed by this gate and the complete project gate.
