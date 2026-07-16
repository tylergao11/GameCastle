# Pinned GDevelop runtime assets

`.gamecastle/cache/gdevelop/runtime/` and `.gamecastle/cache/gdevelop/codegen/` are local, generated caches of the pinned official GDevelop/GDJS runtime and libGD compiler. They are not hand-maintained runtime shims and are intentionally ignored by Git.

Prepare them from the pinned source setup:

```powershell
npm run runtime:prepare
```

The preparation and truth-extraction scripts use one source resolver: `GAMECASTLE_GDEVELOP_SOURCE_DIR` when set, otherwise the repository-relative `../GDevelop-master`. The semantic gate uses the libGD compiler to validate generated project seeds and bound projects.

Do not edit generated runtime files manually. Refresh the cache through the preparation scripts, then rerun `npm run check:semantic-engine`.
