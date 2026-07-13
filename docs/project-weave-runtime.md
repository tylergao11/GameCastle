# WP0 Project Weave Runtime

`ai/project-weave-runtime.js` is the only live Project Weave entry. Its port is
`create`, `continue`, `resume`, and `cancel`. It owns project lifecycle,
checkpointing and owner routing only; it calls the existing Semantic, Asset,
GDJS, HTML, ProjectWorld and playtest owners rather than duplicating their
logic.

Each run is isolated under `.gamecastle/projects/<projectId>/runs/<runId>/`.
The checkpoint is durable after every graph node. A resumed run reuses completed
nodes, so an accepted AssetWorld is not resolved again. The runtime writes the
following local evidence:

- `asset-world.json`, `project-world.json`, and `execution-ledger.json`;
- `runtime/project.json`, generated runtime files, `index.html`, and HTML manifest;
- `checkpoint.json` during execution and `project-run.json` on completion.

`ProjectWeaveRuntime` is the only natural-language build entry. Its default
SemanticPort calls LLM1 and LLM2 through the governed DeepSeek Flash provider,
then returns the immutable BuildContract and compiled Intent artifact. An
explicit `intentDslText` input is reserved for isolated offline tests; it is not
available from the product runtime.

The aggregate gate is `npm run check:project`. It proves create, continue,
checkpoint/resume without re-running the checkpointed asset node, an
owner-routed asset debt, graph order, and isolated playable files.
