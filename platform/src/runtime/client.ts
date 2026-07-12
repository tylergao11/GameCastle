import type { RunSnapshot, RuntimeArtifact, RuntimeMode } from './types'

type ErrorEnvelope = { error?: { code?: string; message?: string } }

export class LocalRuntimeError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LocalRuntimeError'
    this.code = code
  }
}

async function readSnapshot(response: Response): Promise<RunSnapshot> {
  const body = await response.json() as RunSnapshot | ErrorEnvelope
  if (!response.ok) {
    const error = (body as ErrorEnvelope).error
    throw new LocalRuntimeError(error?.code ?? 'RUNTIME_REQUEST_FAILED', error?.message ?? `Runtime request failed with ${response.status}`)
  }
  return body as RunSnapshot
}

export async function getRuntimeSnapshot(): Promise<RunSnapshot> {
  return readSnapshot(await fetch('/api/runtime', { cache: 'no-store' }))
}

export type ProjectSummary = { projectId: string; name: string; activeVersionId: string | null; updatedAt: string }
export type ProjectVersionCard = { versionId: string; parentVersionId: string | null; semanticHash: string; assetSemanticHash: string; createdAt: string; releaseCandidateId: string | null }
export type ProjectWorkspace = { project: ProjectSummary; activeVersion: ProjectVersionCard | null; artifact: RuntimeArtifact | null; versions: ProjectVersionCard[] }

export async function listRuntimeProjects(): Promise<ProjectSummary[]> {
  const response = await fetch('/api/projects', { cache: 'no-store' })
  const body = await response.json() as { projects?: ProjectSummary[] } & ErrorEnvelope
  if (!response.ok) throw new LocalRuntimeError(body.error?.code ?? 'PROJECT_LIST_FAILED', body.error?.message ?? `Project list failed with ${response.status}`)
  return body.projects ?? []
}

export async function getRuntimeProject(projectId: string): Promise<ProjectWorkspace> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: 'no-store' })
  const body = await response.json() as ProjectWorkspace & ErrorEnvelope
  if (!response.ok) throw new LocalRuntimeError(body.error?.code ?? 'PROJECT_NOT_FOUND', body.error?.message ?? `Project lookup failed with ${response.status}`)
  return body
}

export async function rollbackRuntimeProject(projectId: string, versionId: string): Promise<ProjectWorkspace> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rollback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId }) })
  const body = await response.json() as { workspace?: ProjectWorkspace } & ErrorEnvelope
  if (!response.ok || !body.workspace) throw new LocalRuntimeError(body.error?.code ?? 'PROJECT_ROLLBACK_FAILED', body.error?.message ?? `Rollback failed with ${response.status}`)
  return body.workspace
}

export async function startRuntimeRun(intent: string, mode: RuntimeMode, projectId: string): Promise<RunSnapshot> {
  return readSnapshot(await fetch('/api/runtime/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, intent, mode }),
  }))
}

export async function cancelRuntimeRun(runId: string): Promise<RunSnapshot> {
  return readSnapshot(await fetch(`/api/runtime/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }))
}

export async function saveRuntimeAssetBinding(binding: unknown): Promise<void> {
  const response = await fetch('/api/runtime/assets/bindings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(binding) })
  if (!response.ok) {
    const body = await response.json() as ErrorEnvelope
    throw new LocalRuntimeError(body.error?.code ?? 'ASSET_BINDING_FAILED', body.error?.message ?? `Asset binding failed with ${response.status}`)
  }
}

export type CloudAssetMatch = { assetId: string; sha256: string; format: string; width: number | null; height: number | null; styleId: string | null; semanticTags: string[]; styleTags: string[]; repositoryStatus: 'approved' }

export async function searchRuntimeCloudAssets(tags: string[]): Promise<CloudAssetMatch[]> {
  const response = await fetch(`/api/runtime/assets/cloud/search?tags=${encodeURIComponent(tags.join(','))}`, { cache: 'no-store' })
  const body = await response.json() as { matches?: CloudAssetMatch[] } & ErrorEnvelope
  if (!response.ok) throw new LocalRuntimeError(body.error?.code ?? 'CLOUD_SEARCH_FAILED', body.error?.message ?? `Cloud search failed with ${response.status}`)
  return body.matches ?? []
}

export async function resolveRuntimeCloudAsset(binding: unknown): Promise<void> {
  const response = await fetch('/api/runtime/assets/cloud/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(binding) })
  if (!response.ok) { const body = await response.json() as ErrorEnvelope; throw new LocalRuntimeError(body.error?.code ?? 'CLOUD_RESOLVE_FAILED', body.error?.message ?? `Cloud resolve failed with ${response.status}`) }
}

export async function generateSimulatedRuntimeAsset(binding: unknown): Promise<{ binding: { asset?: { path?: string }; simulated?: boolean } }> {
  const response = await fetch('/api/runtime/assets/simulated/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(binding) })
  const body = await response.json() as { binding: { asset?: { path?: string }; simulated?: boolean } } & ErrorEnvelope
  if (!response.ok) throw new LocalRuntimeError(body.error?.code ?? 'SIMULATED_ASSET_GENERATE_FAILED', body.error?.message ?? `Simulated asset generation failed with ${response.status}`)
  return body
}

export async function generateSimulatedRuntimeSheet(request: unknown): Promise<{ sheet: { path: string; frames: number }; bindings: unknown[] }> {
  const response = await fetch('/api/runtime/assets/simulated/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
  const body = await response.json() as { sheet: { path: string; frames: number }; bindings: unknown[] } & ErrorEnvelope
  if (!response.ok) throw new LocalRuntimeError(body.error?.code ?? 'SIMULATED_ASSET_SHEET_FAILED', body.error?.message ?? `Simulated sheet generation failed with ${response.status}`)
  return body
}

export function subscribeToRun(runId: string, onSnapshot: (snapshot: RunSnapshot) => void, onDisconnect: () => void) {
  const source = new EventSource(`/api/runtime/runs/${encodeURIComponent(runId)}/events`)
  source.addEventListener('snapshot', (event) => {
    onSnapshot(JSON.parse((event as MessageEvent<string>).data) as RunSnapshot)
  })
  source.onerror = () => {
    source.close()
    onDisconnect()
  }
  return () => source.close()
}
