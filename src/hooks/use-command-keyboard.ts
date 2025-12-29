import { useCallback, useMemo } from 'react'
import { useProjectStore } from '@/stores/project-store'
import {
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
import { useCommandExecutor } from '@/hooks/use-command-executor'
import { useKeyboardEvents } from '@/hooks/use-keyboard-events'
import { assertDefined } from '@/lib/errors'

/** Extract message from Error object or return string as-is */
const getErrorMessage = (error: Error | string | undefined): string => {
  if (!error) return 'Unknown error'
  return error instanceof Error ? error.message : error
}

interface UseCommandKeyboardProps {
  enabled?: boolean
  onSave?: () => void | Promise<void>
}

export function useCommandKeyboard({ enabled = true, onSave }: UseCommandKeyboardProps = {}) {
  const executorRef = useCommandExecutor()

  const getExecutor = useCallback(() => {
    return assertDefined(executorRef.current, 'CommandExecutor not initialized')
  }, [executorRef])

  const handleCopy = useCallback(async () => {
    const result = await getExecutor().execute(CopyCommand)
    if (result.success) {
      const msg = result.data?.type === 'effect'
        ? `${(result.data.effectType || 'Effect').charAt(0).toUpperCase() + (result.data.effectType || 'effect').slice(1)} block copied`
        : 'Clip copied'
      toast(msg)
    } else {
      toast.error(getErrorMessage(result.error))
    }
  }, [getExecutor])

  const handleCut = useCallback(async () => {
    const result = await getExecutor().execute(CutCommand)
    if (result.success) {
      toast('Clip cut')
    } else {
      toast.error(getErrorMessage(result.error))
    }
  }, [getExecutor])

  const handlePaste = useCallback(async () => {
    const result = await getExecutor().execute(PasteCommand)
    const state = useProjectStore.getState()

    if (result.success) {
      if (result.data?.type === 'effect' && result.data.effectType === EffectType.Zoom && result.data.blockId) {
        state.selectEffectLayer(EffectLayerType.Zoom, result.data.blockId)
      } else if (result.data?.type === 'clip' && result.data.clipId) {
        state.selectClip(result.data.clipId)
      }

      const msg = result.data?.type === 'effect'
        ? `${(result.data.effectType || 'Effect').charAt(0).toUpperCase() + (result.data.effectType || 'effect').slice(1)} block pasted`
        : 'Clip pasted'
      toast(msg)
    } else {
      toast.error(getErrorMessage(result.error))
    }
  }, [getExecutor])

  const handleDelete = useCallback(async () => {
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
        toast.error(getErrorMessage(result.error))
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
  }, [getExecutor])

  const handleSplit = useCallback(async () => {
    const { selectedClips, currentTime } = useProjectStore.getState()
    if (selectedClips.length !== 1) {
      toast.error('Select exactly one clip to split')
      return
    }
    const result = await getExecutor().execute(SplitClipCommand, selectedClips[0], currentTime)
    if (result.success) {
      toast('Clip split')
    } else {
      toast.error(getErrorMessage(result.error))
    }
  }, [getExecutor])

  const handleTrimStart = useCallback(async () => {
    const { selectedClips, currentTime } = useProjectStore.getState()
    if (selectedClips.length !== 1) {
      toast.error('Select exactly one clip to trim')
      return
    }
    const result = await getExecutor().execute(TrimCommand, selectedClips[0], currentTime, 'start')
    if (!result.success) toast.error(getErrorMessage(result.error))
  }, [getExecutor])

  const handleTrimEnd = useCallback(async () => {
    const { selectedClips, currentTime } = useProjectStore.getState()
    if (selectedClips.length !== 1) {
      toast.error('Select exactly one clip to trim')
      return
    }
    const result = await getExecutor().execute(TrimCommand, selectedClips[0], currentTime, 'end')
    if (!result.success) toast.error(getErrorMessage(result.error))
  }, [getExecutor])

  const handleDuplicate = useCallback(async () => {
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
  }, [getExecutor])

  const handleUndo = useCallback(async () => {
    const result = await getExecutor().undo()
    if (result.success) toast('Undone')
  }, [getExecutor])

  const handleRedo = useCallback(async () => {
    const result = await getExecutor().redo()
    if (result.success) toast('Redone')
  }, [getExecutor])

  const handleSave = useCallback(async () => {
    if (onSave) {
      await onSave()
    }
  }, [onSave])

  const bindings = useMemo(() => ([
    { event: 'copy', handler: handleCopy },
    { event: 'cut', handler: handleCut },
    { event: 'paste', handler: handlePaste },
    { event: 'delete', handler: handleDelete },
    { event: 'split', handler: handleSplit },
    { event: 'trimStart', handler: handleTrimStart },
    { event: 'trimEnd', handler: handleTrimEnd },
    { event: 'duplicate', handler: handleDuplicate },
    { event: 'undo', handler: handleUndo },
    { event: 'redo', handler: handleRedo },
    { event: 'save', handler: handleSave }
  ]), [
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleSplit,
    handleTrimStart,
    handleTrimEnd,
    handleDuplicate,
    handleUndo,
    handleRedo,
    handleSave,
  ])

  useKeyboardEvents(bindings, enabled)

  return {
    commandManager: executorRef.current?.getManager() ?? null,
    canUndo: () => executorRef.current?.canUndo() ?? false,
    canRedo: () => executorRef.current?.canRedo() ?? false,
    getUndoDescription: () => executorRef.current?.getUndoDescription() ?? null,
    getRedoDescription: () => executorRef.current?.getRedoDescription() ?? null
  }
}
