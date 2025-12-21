import { useEffect, useState } from 'react'
import { CommandManager, DefaultCommandContext, registerAllCommands } from '@/lib/commands'
import { useProjectStore } from '@/stores/project-store'

export function useCommandManager(): CommandManager | null {
  const [manager, setManager] = useState<CommandManager | null>(null)

  useEffect(() => {
    const ctx = new DefaultCommandContext(useProjectStore)
    const instance = CommandManager.getInstance(ctx)
    instance.setContext(ctx)
    registerAllCommands(instance)
    setManager(instance)
  }, [])

  return manager
} 
