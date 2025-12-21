import { useRef, useCallback } from 'react'

type TimerState = 'idle' | 'running' | 'paused'

interface UseTimerReturn {
  start: (initialMs?: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
  state: TimerState
}

export function useTimer(onTick: (elapsedMs: number) => void): UseTimerReturn {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedDurationRef = useRef<number>(0)
  const stateRef = useRef<TimerState>('idle')

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback((initialMs = 0) => {
    cleanup()
    stateRef.current = 'running'
    startTimeRef.current = Date.now() - initialMs
    pausedDurationRef.current = 0
    
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      onTick(elapsed)
    }, 1000)
    
    // Immediately tick with initial value
    onTick(initialMs)
  }, [onTick, cleanup])

  const pause = useCallback(() => {
    if (stateRef.current === 'running') {
      cleanup()
      stateRef.current = 'paused'
      pausedDurationRef.current = Date.now() - startTimeRef.current
    }
  }, [cleanup])

  const resume = useCallback(() => {
    if (stateRef.current === 'paused') {
      start(pausedDurationRef.current)
    }
  }, [start])

  const stop = useCallback(() => {
    cleanup()
    stateRef.current = 'idle'
    startTimeRef.current = 0
    pausedDurationRef.current = 0
  }, [cleanup])

  return {
    start,
    pause,
    resume,
    stop,
    state: stateRef.current
  }
}