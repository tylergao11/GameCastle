import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelRuntimeRun, getRuntimeProject, getRuntimeSnapshot, listRuntimeProjects, LocalRuntimeError, rollbackRuntimeProject, startRuntimeRun, subscribeToRun, type ProjectVersionCard, type ProjectWorkspace } from './client'
import type { RunSnapshot, RuntimeMode } from './types'

export function useLocalGameRuntime() {
  const [projectId, setProjectIdState] = useState(() => {
    const key = 'gamecastle:active-project-id'
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const created = `project-${crypto.randomUUID()}`
    window.localStorage.setItem(key, created)
    return created
  })
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [projects, setProjects] = useState<{ projectId: string; name: string; activeVersionId: string | null; updatedAt: string }[]>([])
  const [versions, setVersions] = useState<ProjectVersionCard[]>([])
  const closeEventsRef = useRef<(() => void) | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const workspaceSnapshot = useCallback((workspace: ProjectWorkspace): RunSnapshot => ({
    schemaVersion: 1,
    sequence: 0,
    projectId: workspace.project.projectId,
    health: 'ready',
    runId: null,
    mode: null,
    intent: null,
    status: workspace.artifact ? 'succeeded' : 'idle',
    outcome: workspace.artifact ? 'committed' : null,
    stage: workspace.artifact ? { id: 'complete', label: 'Game ready', message: 'A saved local version is ready.' } : { id: 'idle', label: 'Ready', message: 'Ready to build a game.' },
    startedAt: null,
    finishedAt: null,
    error: null,
    artifact: workspace.artifact,
  }), [])

  const stopSubscription = useCallback(() => {
    closeEventsRef.current?.()
    closeEventsRef.current = null
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = null
  }, [])

  const watch = useCallback((runId: string) => {
    stopSubscription()
    closeEventsRef.current = subscribeToRun(runId, (next) => {
      setSnapshot(next)
      setConnectionError(null)
      if (next.status !== 'running' && next.status !== 'cancelling') {
        stopSubscription()
        if (next.status === 'succeeded' && next.projectId) void getRuntimeProject(next.projectId).then((workspace) => { setVersions(workspace.versions); setProjects((current) => current.map((project) => project.projectId === workspace.project.projectId ? workspace.project : project)); }).catch(() => undefined)
      }
    }, () => {
      const reconnect = () => {
        reconnectTimerRef.current = window.setTimeout(() => watch(runId), 800)
      }
      void getRuntimeSnapshot().then((next) => {
        setSnapshot(next)
        if ((next.status === 'running' || next.status === 'cancelling') && next.runId === runId) {
          reconnect()
        }
      }).catch((error: unknown) => {
        setConnectionError(error instanceof Error ? error.message : 'Lost connection to the local runtime.')
        reconnect()
      })
    })
  }, [stopSubscription])

  const refresh = useCallback(async () => {
    try {
      const next = await getRuntimeSnapshot()
      const listed = await listRuntimeProjects()
      setProjects(listed)
      try { const workspace = await getRuntimeProject(projectId); setSnapshot(workspaceSnapshot(workspace)); setVersions(workspace.versions) } catch { setVersions([]); setSnapshot(next.projectId === projectId ? next : { ...next, projectId, status: 'idle', outcome: null, artifact: null, runId: null, mode: null, intent: null, error: null, stage: { id: 'idle', label: 'Ready', message: 'Ready to build a game.' } }) }
      setConnectionError(null)
      if ((next.status === 'running' || next.status === 'cancelling') && next.runId) watch(next.runId)
      return next
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Local Game Runtime is unavailable.')
      throw error
    }
  }, [projectId, watch, workspaceSnapshot])

  const selectProject = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId || !/^[A-Za-z0-9_.-]+$/.test(nextProjectId)) throw new LocalRuntimeError('PROJECT_ID_INVALID', 'Project id must contain only letters, numbers, dots, underscores, or hyphens.')
    window.localStorage.setItem('gamecastle:active-project-id', nextProjectId)
    setProjectIdState(nextProjectId)
    try { const workspace = await getRuntimeProject(nextProjectId); setSnapshot(workspaceSnapshot(workspace)); setVersions(workspace.versions) } catch { setVersions([]); setSnapshot((current) => current ? { ...current, projectId: nextProjectId, status: 'idle', outcome: null, artifact: null, runId: null, mode: null, intent: null, error: null, stage: { id: 'idle', label: 'Ready', message: 'Ready to build a game.' } } : current) }
  }, [workspaceSnapshot])

  const rollback = useCallback(async (versionId: string) => {
    const workspace = await rollbackRuntimeProject(projectId, versionId)
    setSnapshot(workspaceSnapshot(workspace))
    setVersions(workspace.versions)
    const listed = await listRuntimeProjects(); setProjects(listed)
    return workspace
  }, [projectId, workspaceSnapshot])

  useEffect(() => {
    void refresh().catch(() => undefined)
    return stopSubscription
  }, [refresh, stopSubscription])

  const run = useCallback(async (intent: string, mode: RuntimeMode) => {
    try {
      const next = await startRuntimeRun(intent, mode, projectId)
      setSnapshot(next)
      setConnectionError(null)
      if (next.runId) watch(next.runId)
      return next
    } catch (error) {
      const message = error instanceof LocalRuntimeError ? error.message : 'The local runtime could not start the build.'
      setConnectionError(message)
      throw error
    }
  }, [projectId, watch])

  const cancel = useCallback(async () => {
    if (!snapshot?.runId || snapshot.status !== 'running') return snapshot
    const next = await cancelRuntimeRun(snapshot.runId)
    setSnapshot(next)
    stopSubscription()
    return next
  }, [snapshot, stopSubscription])

  return {
    snapshot,
    connectionError,
    run,
    cancel,
    refresh,
    isRunning: snapshot?.status === 'running' || snapshot?.status === 'cancelling',
    canCancel: snapshot?.status === 'running',
    projectId,
    projects,
    versions,
    selectProject,
    rollback,
  }
}
