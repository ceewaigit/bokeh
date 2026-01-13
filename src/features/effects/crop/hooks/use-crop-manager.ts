import { useCallback, useEffect, useMemo } from 'react'
import { useProjectStore } from '@/features/core/stores/project-store'
import type { CropEffectData, Clip } from '@/types/project'
import { CommandExecutor, AddEffectCommand, RemoveEffectCommand, UpdateEffectCommand } from '@/features/core/commands'
import { getCropEffectForClip, getDataOfType } from '@/features/effects/core/filters'
import { EffectType } from '@/types/project'
import { EffectCreation } from '@/features/effects/core/creation'
import { EffectStore } from '@/features/effects/core/effects-store'
import { useShallow } from 'zustand/react/shallow'

export interface UseCropManagerReturn {
    isEditingCrop: boolean
    editingCropData: CropEffectData | null
    handleAddCrop: () => Promise<void>
    handleRemoveCrop: (effectId: string) => void
    handleUpdateCrop: (effectId: string, updates: Partial<CropEffectData>) => void
    handleStartEditCrop: () => void
    handleCropConfirm: () => void
    handleCropReset: () => void
    handleCropChange: (cropData: CropEffectData) => void
}

export function useCropManager(
    selectedClip: Clip | null | undefined
): UseCropManagerReturn {
    // State from store
    const {
        currentProject,
        isEditingCrop,
        editingCropEffectId,
        startEditingCrop,
        stopEditingCrop
    } = useProjectStore(
        useShallow(s => ({
            currentProject: s.currentProject,
            isEditingCrop: s.isEditingCrop,
            editingCropEffectId: s.editingCropId,
            startEditingCrop: s.startEditingCrop,
            stopEditingCrop: s.stopEditingCrop
        }))
    )

    // Derived effects list
    const contextEffects = useMemo(() => {
        return currentProject ? EffectStore.getAll(currentProject) : []
    }, [currentProject])

    // Monitor effect existence to auto-close editing if removed externally
    useEffect(() => {
        if (!editingCropEffectId) return
        const stillExists = contextEffects.some(effect => effect.id === editingCropEffectId)
        if (!stillExists) {
            stopEditingCrop()
        }
    }, [contextEffects, editingCropEffectId, stopEditingCrop])

    const handleAddCrop = useCallback(async () => {
        if (!selectedClip || !currentProject) return

        const clipCrop = getCropEffectForClip(contextEffects, selectedClip)
        if (clipCrop) {
            startEditingCrop(clipCrop.id)
            return
        }

        // Create a default crop effect for the selected clip
        const cropEffect = EffectCreation.createCropEffect({
            clipId: selectedClip.id,
            startTime: selectedClip.startTime,
            endTime: selectedClip.startTime + selectedClip.duration,
            cropData: { x: 0, y: 0, width: 1, height: 1 }, // Default to full-frame (no crop)
        })

        // Wait for command to complete before starting edit mode
        await CommandExecutor.getInstance().execute(AddEffectCommand, cropEffect)

        // Start editing immediately after effect is added
        startEditingCrop(cropEffect.id)
    }, [selectedClip, contextEffects, currentProject, startEditingCrop])

    const handleRemoveCrop = useCallback((effectId: string) => {
        CommandExecutor.getInstance().execute(RemoveEffectCommand, effectId)

        // Clear editing state if we were editing this effect
        if (editingCropEffectId === effectId) {
            stopEditingCrop()
        }
    }, [editingCropEffectId, stopEditingCrop])

    const handleUpdateCrop = useCallback((effectId: string, updates: Partial<CropEffectData>) => {
        const effect = contextEffects.find(e => e.id === effectId)
        if (!effect) return

        CommandExecutor.getInstance().execute(UpdateEffectCommand, effectId, {
            data: {
                ...effect.data,
                ...updates,
            },
        })

    }, [contextEffects])

    const handleStartEditCrop = useCallback(() => {
        if (!selectedClip) return

        // This ensures we edit exactly what the user sees, even if clips were trimmed/moved
        // and effect start times are slightly misaligned with clip start times.
        const cropEffect = getCropEffectForClip(contextEffects, selectedClip)

        if (!cropEffect) return

        startEditingCrop(cropEffect.id)
    }, [selectedClip, contextEffects, startEditingCrop])

    const editingCropData = useMemo(() => {
        if (!editingCropEffectId) return null
        const effect = contextEffects.find(e => e.id === editingCropEffectId)
        return effect ? getDataOfType<CropEffectData>(effect, EffectType.Crop) : null
    }, [contextEffects, editingCropEffectId])

    const handleCropConfirm = useCallback(() => {
        stopEditingCrop()
    }, [stopEditingCrop])

    const handleCropReset = useCallback(() => {
        // Remove the crop effect entirely
        if (editingCropEffectId) {
            handleRemoveCrop(editingCropEffectId)
        }

        // Exit editing mode
        stopEditingCrop()
    }, [editingCropEffectId, handleRemoveCrop, stopEditingCrop])

    const handleCropChange = useCallback((cropData: CropEffectData) => {
        if (!editingCropEffectId) return
        handleUpdateCrop(editingCropEffectId, cropData)
    }, [editingCropEffectId, handleUpdateCrop])

    return {
        isEditingCrop,
        editingCropData,
        handleAddCrop,
        handleRemoveCrop,
        handleUpdateCrop,
        handleStartEditCrop,
        handleCropConfirm,
        handleCropReset,
        handleCropChange
    }
}
