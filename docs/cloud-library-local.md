# Local cloud library

The local cloud-library boundary has one owner per concern:

- PostgreSQL with pgvector stores asset and module metadata, immutable revisions, derivation receipts, and audit receipts.
- MinIO stores immutable content-addressed bytes at `assets/<sha256>.<extension>`.
- `ai/cloud-library-repository.js` is the asynchronous PostgreSQL Repository Port.
- `ai/asset-persistence-bridge.js` persists only accepted, materialized ComfyUI candidates. It requires workflow, model, license, job, and SHA-256 provenance before writing an AssetRevision and DerivationReceipt.
- `ai/module-persistence-bridge.js` persists only verified ModuleCandidates with a matching approved promotion receipt and origin receipt.
- `ai/composition-persistence-bridge.js` persists a Blueprint-pinned module plan only after every referenced ModuleRevision is approved and its full manifest SHA-256 matches.

## Local startup

Copy `.env.local.example` to `.env.local` and set only local credentials. Then run:

```powershell
npm run local:infra
```

This starts PostgreSQL/pgvector, MinIO, and creates the `gamecastle-assets` and `gamecastle-artifacts` buckets. Stop the stack with `npm run local:infra:down`.

`npm run local:infra:ready` waits for PostgreSQL and MinIO, runs the one-shot bucket initializer, then verifies pgvector, all three migrations, MinIO health, and both buckets. `npm run local:all` performs that real-stack verification, runs the cloud-library contract gate, then starts the local game runtime and platform development server.

The checked-in bridge tests do not need Docker. Run them with:

```powershell
npm run check:cloud-library
```

They use injected ports to prove content-addressed object keys, SHA-256 rejection, AssetRevision, DerivationReceipt, ModuleRevision, origin receipt, promotion receipt, and audit receipt behavior. A successful injected test is not evidence that a local Docker daemon, PostgreSQL, or MinIO is running; real-stack verification is a separate deployment gate.

## Runtime integration

Persistence is explicit, never an implicit side effect of a playable local run. The project-local asset
and its Runtime Binding are the result of generation; a shared-library write is a later promotion concern:

- Do not treat `persistAcceptedGeneratedAssets` as publication. It is a verification/staging adapter only and must never be enabled by a normal ProjectWeave request. Shared-library publication requires an explicit promotion queue, share consent, accepted receipt, and bound Runtime receipt.
- `CloudAssetEngine` requires injected production ports and has no file-system fallback. Tests may inject process-local fake ports, but these are never production evidence.
- Pass `services.compositionPersistenceBridge` to ProjectWeave to persist its official `ModuleCompositionPlan`. The bridge rejects a plan unless its pinned Blueprint and every approved module revision/hash resolve in the repository.
- Foundry promotion stays offline. `module-persistence-bridge` is the only path from a verified candidate and matching promotion/origin receipts to a ModuleRevision.

## Rollback and retention

Asset and module revisions are immutable. `module_candidate`, `module_promotion_receipt`, and `module_composition_plan` retain the Foundry and planner evidence that produced a revision. `module_release_event` is append-only: rollback records a new channel selection pointing to an earlier approved revision and the prior event, rather than mutating bytes or rewriting a receipt. Unreferenced object bytes are not publishable and may be collected only by a retention process that first proves no asset revision references their object key.

GDJS/GDevelop test-corpus bytes remain prohibited from this storage path. They can contribute structural TemplateIR evidence only.

## CI and immutable module artifacts

`.github/workflows/gamecastle-gates.yml` runs WP2, cloud-library, ComfyUI contract, ProjectWeave, and module-artifact gates on pull requests and `main`. It publishes a GHCR module-catalog image only after those gates pass on `main`.

`npm run artifact:modules` builds the catalog. It includes only modules with an accepted internal origin receipt and writes all other locally usable modules to `unpublishedModules` with `origin-receipt-missing`; an unreceipted module can never enter the GHCR artifact by accident.
