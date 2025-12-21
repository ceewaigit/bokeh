import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { keyboardManager } from '@/lib/keyboard/keyboard-manager'
import {
  CommandManager,
  DefaultCommandContext,
  registerAllCommands,
  SplitClipCommand,
  TrimCommand,
  DuplicateClipCommand,
  RemoveClipCommand,
  RemoveZoomBlockCommand,
  RemoveEffectCommand,
  CopyCommand,
  CutCommand,
  PasteCommand
} from '@/lib/commands'
import { toast } from 'sonner'
import { EffectLayerType } from '@/types/effects'
import { EffectType } from '@/types'

interface UseCommandKeyboardProps {
  enabled?: boolean
}

export function useCommandKeyboard({ enabled = true }: UseCommandKeyboardProps = {}) {
  const commandManagerRef = useRef<CommandManager | null>(null)
  const contextRef = useRef<DefaultCommandContext | null>(null)

  // Initialize command manager
  useEffect(() => {
    if (!commandManagerRef.current) {
      contextRef.current = new DefaultCommandContext(useProjectStore)
      commandManagerRef.current = CommandManager.getInstance(contextRef.current)
      registerAllCommands(commandManagerRef.current)
    } else {
      // Ensure manager has a live context (reads from store accessor)
      contextRef.current = new DefaultCommandContext(useProjectStore)
      commandManagerRef.current.setContext(contextRef.current)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !commandManagerRef.current) return

    const manager = commandManagerRef.current

    // Copy handler
    const handleCopy = async () => {
      const freshContext = new DefaultCommandContext(useProjectStore)

      try {
        const command = new CopyCommand(freshContext)
        const result = await manager.execute(command)

        if (result.success) {
          if (result.data?.type === 'effect') {
            const title = result.data.effectType ? result.data.effectType.charAt(0).toUpperCase() + result.data.effectType.slice(1) : 'Effect'
            toast(`${title} block copied`)
          } else {
            toast('Clip copied')
          }
        } else {
          toast.error(result.error as string)
        }
      } catch (err) {
        console.error('[Keyboard] Copy failed:', err)
        toast.error('Failed to copy')
      }
    }

    // Cut handler
    const handleCut = async () => {
      // Update context with fresh store state
      contextRef.current = new DefaultCommandContext(useProjectStore)
      const command = new CutCommand(contextRef.current)
      const result = await manager.execute(command)

      if (result.success) {
        toast('Clip cut')
      } else {
        toast.error(result.error as string)
      }
    }

    // Paste handler
    const handlePaste = async () => {
      const freshContext = new DefaultCommandContext(useProjectStore)

      try {
        const command = new PasteCommand(freshContext)
        const result = await manager.execute(command)

        if (result.success) {
          if (result.data?.type === 'effect') {
            // Auto-select pasted effect in sidebar
            if (result.data.effectType === EffectType.Zoom && result.data.blockId) {
              useProjectStore.getState().selectEffectLayer(EffectLayerType.Zoom, result.data.blockId)
            }
            const title = result.data.effectType ? result.data.effectType.charAt(0).toUpperCase() + result.data.effectType.slice(1) : 'Effect'
            toast(`${title} block pasted`)
          } else {
            toast('Clip pasted')
          }
        } else {
          toast.error(result.error as string)
        }
      } catch (err) {
        console.error('[Keyboard] Paste failed:', err)
        toast.error('Failed to paste')
      }
    }

    // Delete handler
    const handleDelete = async () => {
      const freshContext = new DefaultCommandContext(useProjectStore)

      // Check if an effect layer is selected
      const effectLayer = useProjectStore.getState().selectedEffectLayer

      // Handle any selected effect layer with an ID
      if (effectLayer?.id) {
        // Use appropriate command based on effect type
        let command
        let effectName = 'Effect'

        if (effectLayer.type === EffectLayerType.Zoom) {
          command = new RemoveZoomBlockCommand(freshContext, effectLayer.id)
          effectName = 'Zoom block'
        } else {
          // Generic handler for Screen, Keystroke, and any other effect types
          command = new RemoveEffectCommand(freshContext, effectLayer.id)
          effectName = effectLayer.type === EffectLayerType.Screen ? 'Screen block' :
            effectLayer.type === EffectLayerType.Keystroke ? 'Keystroke block' :
              'Effect block'
        }

        try {
          const result = await manager.execute(command)
          if (result.success) {
            useProjectStore.getState().clearEffectSelection()
            toast(`${effectName} deleted`)
          } else {
            console.error('[Keyboard] Delete effect failed:', result.error)
            toast.error(result.error as string)
          }
        } catch (err) {
          console.error('[Keyboard] Delete effect failed:', err)
          toast.error('Failed to delete')
        }
        return
      }

      // Fallback: delete selected clip(s)
      const selectedClips = useProjectStore.getState().selectedClips
      if (selectedClips && selectedClips.length > 0) {
        try {
          for (const clipId of selectedClips) {
            const cmd = new RemoveClipCommand(freshContext, clipId)
            await manager.execute(cmd)
          }
          toast('Clip(s) deleted')
        } catch (err) {
          console.error('[Keyboard] Delete clip failed:', err)
          toast.error('Failed to delete')
        }
      }
    }

    // Split handler
    const handleSplit = async () => {
      const currentStore = useProjectStore.getState()
      const selectedClips = currentStore.selectedClips
      if (selectedClips.length !== 1) {
        toast.error('Select exactly one clip to split')
        return
      }

      // Update context with fresh store state
      contextRef.current = new DefaultCommandContext(useProjectStore)
      const command = new SplitClipCommand(
        contextRef.current,
        selectedClips[0],
        currentStore.currentTime
      )

      const result = await manager.execute(command)

      if (result.success) {
        toast('Clip split')
      } else {
        toast.error(result.error as string)
      }
    }

    const handleTrimStart = async () => {
      const currentStore = useProjectStore.getState()
      const selectedClips = currentStore.selectedClips
      if (selectedClips.length !== 1) {
        toast.error('Select exactly one clip to trim')
        return
      }

      contextRef.current = new DefaultCommandContext(useProjectStore)
      const command = new TrimCommand(
        contextRef.current,
        selectedClips[0],
        currentStore.currentTime,
        'start'
      )

      const result = await manager.execute(command)
      if (!result.success) {
        toast.error(result.error as string)
      }
    }

    const handleTrimEnd = async () => {
      const currentStore = useProjectStore.getState()
      const selectedClips = currentStore.selectedClips
      if (selectedClips.length !== 1) {
        toast.error('Select exactly one clip to trim')
        return
      }

      contextRef.current = new DefaultCommandContext(useProjectStore)
      const command = new TrimCommand(
        contextRef.current,
        selectedClips[0],
        currentStore.currentTime,
        'end'
      )

      const result = await manager.execute(command)
      if (!result.success) {
        toast.error(result.error as string)
      }
    }

    // Duplicate handler
    const handleDuplicate = async () => {
      const currentStore = useProjectStore.getState()
      const selectedClips = currentStore.selectedClips
      if (selectedClips.length === 0) return

      // Begin group for multiple duplications
      if (selectedClips.length > 1) {
        manager.beginGroup(`duplicate-${Date.now()}`)
      }

      for (const clipId of selectedClips) {
        contextRef.current = new DefaultCommandContext(useProjectStore)
        const command = new DuplicateClipCommand(contextRef.current, clipId)
        await manager.execute(command)
      }

      if (selectedClips.length > 1) {
        await manager.endGroup()
        toast(`${selectedClips.length} clips duplicated`)
      } else {
        toast('Clip duplicated')
      }
    }

    // Undo/Redo handlers
    const handleUndo = async () => {
      const result = await manager.undo()
      if (result.success) {
        toast('Undone')
      }
    }

    const handleRedo = async () => {
      const result = await manager.redo()
      if (result.success) {
        toast('Redone')
      }
    }

    // Register keyboard listeners
    keyboardManager.on('copy', handleCopy)
    keyboardManager.on('cut', handleCut)
    keyboardManager.on('paste', handlePaste)
    keyboardManager.on('delete', handleDelete)
    keyboardManager.on('split', handleSplit)
    keyboardManager.on('trimStart', handleTrimStart)
    keyboardManager.on('trimEnd', handleTrimEnd)
    keyboardManager.on('duplicate', handleDuplicate)
    keyboardManager.on('undo', handleUndo)
    keyboardManager.on('redo', handleRedo)

    return () => {
      keyboardManager.removeListener('copy', handleCopy)
      keyboardManager.removeListener('cut', handleCut)
      keyboardManager.removeListener('paste', handlePaste)
      keyboardManager.removeListener('delete', handleDelete)
      keyboardManager.removeListener('split', handleSplit)
      keyboardManager.removeListener('trimStart', handleTrimStart)
      keyboardManager.removeListener('trimEnd', handleTrimEnd)
      keyboardManager.removeListener('duplicate', handleDuplicate)
      keyboardManager.removeListener('undo', handleUndo)
      keyboardManager.removeListener('redo', handleRedo)
    }
  }, [enabled])

  return {
    commandManager: commandManagerRef.current,
    canUndo: () => commandManagerRef.current?.canUndo() || false,
    canRedo: () => commandManagerRef.current?.canRedo() || false,
    getUndoDescription: () => commandManagerRef.current?.getUndoDescription() || null,
    getRedoDescription: () => commandManagerRef.current?.getRedoDescription() || null
  }
}
