import type { RunSnapshot, RuntimeMode } from './types'

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

export async function startRuntimeRun(intent: string, mode: RuntimeMode): Promise<RunSnapshot> {
  return readSnapshot(await fetch('/api/runtime/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, mode }),
  }))
}

export async function cancelRuntimeRun(runId: string): Promise<RunSnapshot> {
  return readSnapshot(await fetch(`/api/runtime/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }))
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
