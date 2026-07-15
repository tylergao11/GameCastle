# Asset library and creation loop

`AssetLibrary` is the asset engine's durable acceleration boundary. It is not a template selector, a compatibility cache, or a semantic decision-maker.

## Two linked chains

```text
complete AssetRequirement
  -> AssetLibrary lookup
  -> verified reuse or master-image creation
  -> deterministic static/FrameSet derivation and acceptance
  -> project-local AssetWorld
  -> idempotent AssetLibrary publication
```

The creation chain is orchestrated by `ai/asset-engine-langgraph.js`. Its ordered stage list is owned by `shared/asset-engine-contract.json`; the code rejects a graph whose handlers do not exactly match that list. The accumulation chain is owned by `shared/asset-library-contract.json` and requires `lookup`, `materialize`, and `publish` ports.

## Cloud implementation

The sole production port is `ai/asset-library-supabase-port.js`. It adapts the pinned [Supabase Storage source](../vendor/supabase-storage) at commit `afcfbfdd507a00f52abfab35074772a6fd2b9c18`, rather than reimplementing an object store or metadata database. Supabase Storage owns PostgreSQL metadata, object atomicity and S3/MinIO persistence; GameCastle owns only requirement fingerprints, accepted-revision validation and project-local materialization. Its official JavaScript client is pinned as `@supabase/storage-js@2.110.5`.

The stack definition is [infra/asset-library/compose.yml](../infra/asset-library/compose.yml). It uses the pinned official `ghcr.io/supabase/storage-api` image digest from `.env.local`; the checked-in [Supabase Storage source](../vendor/supabase-storage) remains the audited source truth. It has no browser credential: only the server-side `GAMECASTLE_ASSET_LIBRARY_SERVICE_KEY` can call the private bucket. `GAMECASTLE_ASSET_LIBRARY_URL`, `GAMECASTLE_ASSET_LIBRARY_SERVICE_KEY` and `GAMECASTLE_ASSET_LIBRARY_BUCKET` are the runtime inputs; the remaining storage-stack values live in `.env.local` following `.env.local.example`.

Bootstrap a local stack after installing Docker:

```powershell
node scripts/generate-asset-library-dev-secrets.js 365
# Copy the two printed values into .env.local, then:
docker compose --env-file .env.local -f infra/asset-library/compose.yml up --build -d
```

The app never talks to PostgreSQL or MinIO directly. It speaks only to the private Supabase Storage endpoint through the pinned client.

After the stack is healthy and local ComfyUI is available, run the true creation-and-reuse probe:

```powershell
node scripts/run-with-local-env.js ai/asset-engine-cloud-library-live-smoke.js
```

It performs real ComfyUI master generation for one static asset and one FrameSet, deterministically derives both accepted revisions, drains their outbox entries, then runs the identical requirements for a second project. The second run must materialize both revisions from the cloud library, publish nothing, preserve the static SHA-256, and preserve the FrameSet content hash. It is intentionally not part of ordinary CI because it requires the local model and running cloud stack.

## Truth and compatibility rules

- A library record is reusable only when its requirement fingerprint exactly matches the complete reusable requirement.
- A materialized file must match the published revision ID, SHA-256, kind, and format before project use.
- Only an accepted revision can be published. Publication is idempotent for the same requirement fingerprint and revision.
- The library record is cross-project truth; `semantic-asset-world` is the source-hash-bound project projection.
- The browser consumes only project-bound resources after final assembly. It never calls the library or a model provider.

## Animation extension

`FrameSetRevision` is the accepted animation truth defined by `shared/frame-set-contract.json`. Animation states and timing come from `GameSemanticSource.assetIntents[].animation`; the style dictionary does not invent gameplay states. `AssetDerivationPipeline` prepares one deterministic static base from the transient master image, derives every configured frame through `LocalDerivationKernel`, verifies immutable frame hashes, and issues the accepted revision. It is materialized through the same `AssetLibrary` port as a single payload, while its frame paths remain the project projection. Paths and receipts are excluded from `contentHash`: identity comes only from frame content, canvas, anchor, state order, and timing. A sprite sheet is a runtime projection, never the library's animation truth.

The GDJS Sprite projection is verified through official `libGD`: it creates one Sprite animation per frame-set state and binds each immutable frame as an official Sprite frame. The adapter permits only one uniform duration within a state, because the official direction API exposes one `timeBetweenFrames` value. A variable-duration state is rejected rather than approximated. Anchor data remains in the projection metadata until a separately verified GDJS anchor adapter exists; it is never discarded.

Animation intents use a pinned `frame-set` production recipe. LangGraph first searches `AssetLibrary`; on a miss, the same master-image provider and deterministic derivation pipeline used by static assets create the FrameSet. The accepted FrameSet follows the same outbox publication path as a static resource and becomes an `AssetWorld` slot without flattening frames.
