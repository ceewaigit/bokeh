import { useEffect, useRef } from 'react'
import { CommandExecutor } from '@/features/commands'
import { useProjectStore } from '@/features/stores/project-store'

export function useCommandExecutor() {
  const executorRef = useRef<CommandExecutor | null>(null)

  useEffect(() => {
    executorRef.current = CommandExecutor.isInitialized()
      ? CommandExecutor.getInstance()
      : CommandExecutor.initialize(useProjectStore)
  }, [])

  return executorRef
}
