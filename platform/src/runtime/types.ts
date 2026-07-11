export type RuntimeStatus = 'idle' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled'
export type RuntimeMode = 'create' | 'continue'

export interface RuntimeStage {
  id: string
  label: string
  message: string
}

export interface RuntimeArtifact {
  version: string
  playUrl: string
  worldVersion: number | null
  semanticHash: string | null
}

export interface RuntimeError {
  code: string
  message: string
  detail: string | null
}

export interface RunSnapshot {
  schemaVersion: 1
  projectId: 'active-local-project'
  sequence: number
  health: 'ready' | 'unhealthy'
  runId: string | null
  mode: RuntimeMode | null
  intent: string | null
  status: RuntimeStatus
  outcome: 'committed' | 'no_change' | null
  stage: RuntimeStage
  startedAt: string | null
  finishedAt: string | null
  error: RuntimeError | null
  artifact: RuntimeArtifact | null
}
