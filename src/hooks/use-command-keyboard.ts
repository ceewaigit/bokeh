import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { keyboardManager } from '@/lib/keyboard/keyboard-manager'
import {
  CommandExecutor,
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
  const executorRef = useRef<CommandExecutor | null>(null)

  // Initialize CommandExecutor once
  useEffect(() => {
    if (!executorRef.current) {
      executorRef.current = CommandExecutor.isInitialized()
        ? CommandExecutor.getInstance()
        : CommandExecutor.initialize(useProjectStore)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const getExecutor = () => {
      if (!executorRef.current) {
        executorRef.current = CommandExecutor.isInitialized()
          ? CommandExecutor.getInstance()
          : CommandExecutor.initialize(useProjectStore)
      }
      return executorRef.current
    }

    const handleCopy = async () => {
      const result = await getExecutor().execute(CopyCommand)
      if (result.success) {
        const msg = result.data?.type === 'effect'
          ? `${(result.data.effectType || 'Effect').charAt(0).toUpperCase() + (result.data.effectType || 'effect').slice(1)} block copied`
          : 'Clip copied'
        toast(msg)
      } else {
        toast.error(result.error as string)
      }
    }

    const handleCut = async () => {
      const result = await getExecutor().execute(CutCommand)
      result.success ? toast('Clip cut') : toast.error(result.error as string)
    }

    const handlePaste = async () => {
      const result = await getExecutor().execute(PasteCommand)
      if (result.success) {
        if (result.data?.type === 'effect' && result.data.effectType === EffectType.Zoom && result.data.blockId) {
          useProjectStore.getState().selectEffectLayer(EffectLayerType.Zoom, result.data.blockId)
        }
        const msg = result.data?.type === 'effect'
          ? `${(result.data.effectType || 'Effect').charAt(0).toUpperCase() + (result.data.effectType || 'effect').slice(1)} block pasted`
          : 'Clip pasted'
        toast(msg)
      } else {
        toast.error(result.error as string)
      }
    }

    const handleDelete = async () => {
      const effectLayer = useProjectStore.getState().selectedEffectLayer
      if (effectLayer?.id) {
        const isZoom = effectLayer.type === EffectLayerType.Zoom
        const result = isZoom
          ? await getExecutor().execute(RemoveZoomBlockCommand, effectLayer.id)
          : await getExecutor().execute(RemoveEffectCommand, effectLayer.id)

        if (result.success) {
          useProjectStore.getState().clearEffectSelection()
          const name = isZoom ? 'Zoom block' :
            effectLayer.type === EffectLayerType.Screen ? 'Screen block' :
            effectLayer.type === EffectLayerType.Keystroke ? 'Keystroke block' : 'Effect block'
          toast(`${name} deleted`)
        } else {
          toast.error(result.error as string)
        }
        return
      }

      const selectedClips = useProjectStore.getState().selectedClips
      if (selectedClips.length > 0) {
        for (const clipId of selectedClips) {
          await getExecutor().execute(RemoveClipCommand, clipId)
        }
        toast('Clip(s) deleted')
      }
    }

    const handleSplit = async () => {
      const { selectedClips, currentTime } = useProjectStore.getState()
      if (selectedClips.length !== 1) {
        toast.error('Select exactly one clip to split')
        return
      }
      const result = await getExecutor().execute(SplitClipCommand, selectedClips[0], currentTime)
      result.success ? toast('Clip split') : toast.error(result.error as string)
    }

    const handleTrimStart = async () => {
      const { selectedClips, currentTime } = useProjectStore.getState()
      if (selectedClips.length !== 1) {
        toast.error('Select exactly one clip to trim')
        return
      }
      const result = await getExecutor().execute(TrimCommand, selectedClips[0], currentTime, 'start')
      if (!result.success) toast.error(result.error as string)
    }

    const handleTrimEnd = async () => {
      const { selectedClips, currentTime } = useProjectStore.getState()
      if (selectedClips.length !== 1) {
        toast.error('Select exactly one clip to trim')
        return
      }
      const result = await getExecutor().execute(TrimCommand, selectedClips[0], currentTime, 'end')
      if (!result.success) toast.error(result.error as string)
    }

    const handleDuplicate = async () => {
      const { selectedClips } = useProjectStore.getState()
      if (selectedClips.length === 0) return

      const executor = getExecutor()
      if (selectedClips.length > 1) executor.beginGroup(`duplicate-${Date.now()}`)

      for (const clipId of selectedClips) {
        await executor.execute(DuplicateClipCommand, clipId)
      }

      if (selectedClips.length > 1) {
        await executor.endGroup()
        toast(`${selectedClips.length} clips duplicated`)
      } else {
        toast('Clip duplicated')
      }
    }

    const handleUndo = async () => {
      const result = await getExecutor().undo()
      if (result.success) toast('Undone')
    }

    const handleRedo = async () => {
      const result = await getExecutor().redo()
      if (result.success) toast('Redone')
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
    commandManager: executorRef.current?.getManager() ?? null,
    canUndo: () => executorRef.current?.canUndo() ?? false,
    canRedo: () => executorRef.current?.canRedo() ?? false,
    getUndoDescription: () => executorRef.current?.getUndoDescription() ?? null,
    getRedoDescription: () => executorRef.current?.getRedoDescription() ?? null
  }
}
