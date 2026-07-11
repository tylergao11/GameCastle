import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelRuntimeRun, getRuntimeSnapshot, LocalRuntimeError, startRuntimeRun, subscribeToRun } from './client'
import type { RunSnapshot, RuntimeMode } from './types'

export function useLocalGameRuntime() {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const closeEventsRef = useRef<(() => void) | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)

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
      if (next.status !== 'running' && next.status !== 'cancelling') stopSubscription()
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
      setSnapshot(next)
      setConnectionError(null)
      if ((next.status === 'running' || next.status === 'cancelling') && next.runId) watch(next.runId)
      return next
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Local Game Runtime is unavailable.')
      throw error
    }
  }, [watch])

  useEffect(() => {
    void refresh().catch(() => undefined)
    return stopSubscription
  }, [refresh, stopSubscription])

  const run = useCallback(async (intent: string, mode: RuntimeMode) => {
    try {
      const next = await startRuntimeRun(intent, mode)
      setSnapshot(next)
      setConnectionError(null)
      if (next.runId) watch(next.runId)
      return next
    } catch (error) {
      const message = error instanceof LocalRuntimeError ? error.message : 'The local runtime could not start the build.'
      setConnectionError(message)
      throw error
    }
  }, [watch])

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
  }
}
