import { useEffect, useRef } from 'react'
import { CommandExecutor } from '@/lib/commands'
import { useProjectStore } from '@/stores/project-store'

export function useCommandExecutor() {
  const executorRef = useRef<CommandExecutor | null>(null)

  useEffect(() => {
    executorRef.current = CommandExecutor.isInitialized()
      ? CommandExecutor.getInstance()
      : CommandExecutor.initialize(useProjectStore)
  }, [])

  return executorRef
}
