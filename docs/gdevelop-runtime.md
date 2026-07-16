# Pinned GDevelop runtime assets

`.gamecastle/cache/gdevelop/runtime/` and `.gamecastle/cache/gdevelop/codegen/` are local, generated caches of the pinned official GDevelop/GDJS runtime and libGD compiler. They are not hand-maintained runtime shims and are intentionally ignored by Git.

Prepare them from an explicitly pinned GDevelop source and an explicitly
checksum-verified libGD binary pair:

```powershell
$env:GAMECASTLE_GDEVELOP_SOURCE_DIR = 'C:\src\GDevelop'
$env:GAMECASTLE_LIBGD_SOURCE_DIR = 'C:\toolcache\gdevelop-codegen'
npm run runtime:prepare
```

`GAMECASTLE_GDEVELOP_SOURCE_DIR` defaults to the repository-relative
`../GDevelop-master`, but setting it explicitly is required for a reproducible
machine setup. The directory must match the generated source fingerprints.

`GAMECASTLE_LIBGD_SOURCE_DIR` is optional only when the checked-in expected
libGD checksum still matches the official download. When supplied, it must
contain `libGD.js` and `libGD.wasm`; the preparation script verifies both
SHA-256 values before copying them into the ignored cache. For a one-off gate
run, `GAMECASTLE_LIBGD_PATH` may point directly at a `libGD.js` file; runtime
code generation rechecks both that file and its sibling `libGD.wasm` against
the same pinned binary contract before use.

The semantic gate uses the libGD compiler to validate generated project seeds
and bound projects. Do not use an arbitrary `master/latest` binary as evidence
of a pinned source revision.

Do not edit generated runtime files manually. Refresh the cache through the preparation scripts, then rerun `npm run check:semantic-engine`.
