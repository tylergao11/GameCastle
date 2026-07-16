# Semantic module

`@gamecastle/semantic-module` is the narrow public boundary for deterministic
semantic compilation. It owns no second dictionary, validator, revision path,
or compiler implementation: each call uses one pinned generated GDJS Semantic
Dictionary snapshot and delegates to the canonical semantic compilers.

## Public API

The package exports exactly four top-level members:

- `dictionary`: a frozen snapshot of the generated GDJS Semantic Dictionary.
  Use `dictionary.source` as `GameSemanticSource.dictionarySource`.
- `validate(source)`: validates and returns a cloned `GameSemanticSource`.
- `applyRevision(source, revision)`: applies a source-hash-checked
  `GameSemanticRevision` and returns the validated next source.
- `compileSemanticAssembly(source)`: returns the deterministic
  `SemanticAssembly`, including component-expansion evidence, the event graph,
  asset requirements, and the layout plan.

The source and revision schemas are intentionally strict. The module accepts
no caller-supplied dictionary/index override, compatibility document, or test
adapter. Semantic assembly deliberately stops before spatial assembly and
libGD project generation, so it is independently verifiable with Node alone.
Each returned assembly also contains the validated input `source` and its
hash-bound component-expanded `realizedSource`. `realizedSource` is compiler
evidence for the same assembly, not an alternate editable input path.

## Minimal deterministic flow

Run the executable example from the repository root:

```powershell
node packages/semantic-module/examples/game-semantic-source-to-semantic-assembly.js
```

The example constructs a complete `GameSemanticSource` with
`semantic.dictionary.source`, validates it, and compiles one source-bound
assembly without a spatial or libGD dependency.

For the focused module check:

```powershell
node tests/modules/check-semantic-module.js
```
