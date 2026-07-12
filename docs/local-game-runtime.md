# Local Game Runtime Boundary

The Local Game Runtime is the only product boundary between the browser UI and
the existing GameCastle engine. It turns one active local project into a stable
runtime contract without teaching React about child processes, repository paths,
pipeline logs, or generated files.

## Ownership

```text
platform UI
  -> /api/runtime contract
  -> RunCoordinator
  -> PipelineRunner
  -> ai/pipeline.js
  -> transient engine transaction workspace
  -> ProjectStore immutable ProjectVersion
  -> verified immutable release
  -> ArtifactStore
  -> isolated localhost /play/* origin
  -> iframe
```

- `platform/` owns intent entry, progress presentation, errors, and the iframe.
- `server/local-runtime/` owns the single-run lifecycle, stable status model,
  process adapter, workspace transaction, and artifact publication.
- `ai/` remains the engine owner. The boundary invokes its public CLI and does
  not import or duplicate Intent, compiler, bridge, or semantic-playtest logic.
- `output/` is only a transient engine transaction workspace. Project truth is
  `.gamecastle/projects/<projectId>/versions/<versionId>`; browsers never read
  it directly. Playable files are allowlisted from the HTML export manifest and
  atomically committed under `.gamecastle/releases/<version>/`.

## Product model

The Runtime accepts one local build at a time, while ProjectStore owns many
local projects. `create` starts or updates the supplied `projectId`; `continue`
materializes that project's active immutable version into the transient engine
workspace. There is no global active-project truth, cloud workspace, or dual
runtime path.

The coordinator persists its last snapshot under `.gamecastle/`. Before a run,
it snapshots `output/`. Success is published only when all of these artifacts
exist:

- `game.html`
- `project.json`
- `project-world.json`
- `asset-world.json`
- `execution-ledger.json`
- `html-export-manifest.json`

Failure or process interruption restores the previous output snapshot while the
previous immutable release remains playable. While a run is active, a second request receives `RUN_BUSY` instead of racing the
engine's fixed output directory.

## HTTP contract

### `GET /api/runtime`

Returns the current `RunSnapshot`.

### `POST /api/runtime/runs`

```json
{
  "projectId": "my-night-market",
  "intent": "Make a mobile platformer with coins and enemies.",
  "mode": "create"
}
```

`mode` is `create` or `continue`. The response is `202` with the running
snapshot. Invalid intent is `400`; a busy runtime or missing iteration state is
`409`.

Mutation requests require `application/json` and the exact GameCastle UI
`Origin`. The isolated playable origin cannot create or cancel a run.

### `GET /api/projects` and `POST /api/projects/:projectId/rollback`

Returns the local project index or changes only a project's active-version
pointer to an existing immutable ProjectVersion. The browser never owns or
receives project files.

### `GET /api/runtime/runs/:runId/events`

Server-sent events named `snapshot`. Pipeline stdout is normalized at the
server boundary into stable stages; the UI never parses log text.

### `POST /api/runtime/runs/:runId/cancel`

Stops the active pipeline process tree and restores the exact pre-run mutable
workspace before returning a `cancelled` snapshot. Only the currently running
run can be cancelled.

### `GET http://localhost:4183/play/:artifactVersion/*`

Serves only `game.html` plus files explicitly declared by the committed HTML
export manifest. It uses real-path traversal protection, exposes no engine
state JSON or logs, and never reads the mutable `output/` workspace. The
browser UI and API use `127.0.0.1`; the playable iframe uses `localhost`. API
routes reject the playable Host, and play routes reject the API Host. The iframe
can therefore use same-origin GDJS storage without gaining access to the Runtime
API through a hostname swap.

## Run state

```text
idle -> running/queued
     -> running/understanding
     -> running/directing
     -> running/compiling
     -> running/building
     -> running/runtime
     -> running/packaging
     -> running/playtesting
     -> succeeded/complete
     -> failed/failed
     -> cancelling -> cancelled

persisted running + recovery journal
     -> kill recorded writer -> restore exact output snapshot -> failed/ready
persisted running without recovery journal
     -> failed/unhealthy
```

The engine may skip stages for a no-op continuation or a different provider.
The stable contract is status plus the most recent known stage, not a promise
that every stage appears.

There is no legacy-output bootstrap path. A fresh runtime starts without a
playable artifact and only exposes a release committed by a successful runtime
run.

## Local development

`npm run dev` starts both the runtime server on `127.0.0.1:4183` and the Vite
frontend. Vite proxies `/api` to the runtime, so production UI code always uses
relative runtime URLs.

Natural-language creation still requires the engine's configured LLM endpoint
(`LLM_ENDPOINT`, default `http://127.0.0.1:18081/v1`) to be listening. If it is
unavailable, the run terminates as failed, the UI shows the failure, the mutable
workspace rolls back, and the last committed release remains playable.
