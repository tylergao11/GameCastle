# WP3 Project Workspace and Version Lifecycle

`ai/project-store.js` is the local `ProjectStorePort` implementation. Its root
is `.gamecastle/projects/<projectId>`; project index, active-version pointer,
run checkpoints and immutable versions are project-local. `output/` is not a
ProjectStore truth source.

When `ProjectWeaveRuntime.create` or `.continue` reaches `playable`, it commits
exactly one immutable `ProjectVersion`. The version includes the GDJS project,
runtime export, ProjectWorld, AssetWorld, execution ledger, parent version ID,
world hashes and content hash. A failed or debt run never changes the active
version.

`continue` loads the current active version automatically. `rollback` changes
only the active-version pointer and returns a receipt; it never copies mutable
files over a version. A fresh ProjectStore process uses that pointer to recover
the exact continue context after restart.

The WP3 gate is `npm run check:project`. It proves two-project isolation,
automatic immutable commits, continue lineage, failed-run safety, rollback and
restart recovery.
