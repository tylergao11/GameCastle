import { useRef, useCallback } from 'react'

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
}

interface UseSwipeOptions {
  threshold?: number   // min px to trigger swipe, default 50
  preventScroll?: boolean
}

export function useSwipe(
  handlers: SwipeHandlers,
  options: UseSwipeOptions = {}
) {
  const { threshold = 50, preventScroll = false } = options
  const startX = useRef(0)
  const startY = useRef(0)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current
      const dy = e.changedTouches[0].clientY - startY.current
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      // Only trigger if horizontal swipe is dominant
      if (absDx > absDy && absDx > threshold) {
        if (preventScroll) e.preventDefault()
        if (dx < -threshold) handlersRef.current.onSwipeLeft?.()
        else if (dx > threshold) handlersRef.current.onSwipeRight?.()
      } else if (absDy > absDx && absDy > threshold) {
        if (preventScroll) e.preventDefault()
        if (dy < -threshold) handlersRef.current.onSwipeUp?.()
        else if (dy > threshold) handlersRef.current.onSwipeDown?.()
      }
    },
    [threshold, preventScroll]
  )

  // Mouse drag support (for desktop testing)
  const isDragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startY.current = e.clientY
  }, [])

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return
      isDragging.current = false
      const dx = e.clientX - startX.current
      const dy = e.clientY - startY.current
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      if (absDx > absDy && absDx > threshold) {
        if (dx < -threshold) handlersRef.current.onSwipeLeft?.()
        else if (dx > threshold) handlersRef.current.onSwipeRight?.()
      } else if (absDy > absDx && absDy > threshold) {
        if (dy < -threshold) handlersRef.current.onSwipeUp?.()
        else if (dy > threshold) handlersRef.current.onSwipeDown?.()
      }
    },
    [threshold]
  )

  return {
    onTouchStart,
    onTouchEnd,
    onMouseDown,
    onMouseUp,
  }
}
