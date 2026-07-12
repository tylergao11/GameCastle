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
  recovery?: { kind: string; title: string; message: string; actions: string[] }
}

export interface RunSnapshot {
  schemaVersion: 1
  projectId: string | null
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
