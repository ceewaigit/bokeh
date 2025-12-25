import { useCallback, useEffect } from 'react'
import { useProjectStore } from '@/stores/project-store'
import type { CropEffectData, Clip } from '@/types/project'
import { CommandExecutor, AddEffectCommand, RemoveEffectCommand, UpdateEffectCommand } from '@/lib/commands'
import { getCropEffectForClip, getCropData } from '@/lib/effects/effect-filters'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { EffectStore } from '@/lib/core/effects'
import { useShallow } from 'zustand/react/shallow'

export interface UseCropManagerReturn {
    isEditingCrop: boolean
    editingCropData: CropEffectData | null
    handleAddCrop: () => void
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
        editingCropData,
        editingCropEffectId,
        startEditingCrop,
        updateEditingStoreCrop,
        stopEditingCrop
    } = useProjectStore(
        useShallow(s => ({
            currentProject: s.currentProject,
            isEditingCrop: s.isEditingCrop,
            editingCropData: s.editingCropData,
            editingCropEffectId: s.editingCropId,
            startEditingCrop: s.startEditingCrop,
            updateEditingStoreCrop: s.updateEditingCrop,
            stopEditingCrop: s.stopEditingCrop
        }))
    )

    // Derived effects list
    const contextEffects = currentProject ? EffectStore.getAll(currentProject) : []

    // Monitor effect existence to auto-close editing if removed externally
    useEffect(() => {
        if (!editingCropEffectId) return
        const stillExists = contextEffects.some(effect => effect.id === editingCropEffectId)
        if (!stillExists) {
            stopEditingCrop()
        }
    }, [contextEffects, editingCropEffectId, stopEditingCrop])

    const handleAddCrop = useCallback(() => {
        if (!selectedClip || !currentProject) return

        const clipCrop = getCropEffectForClip(contextEffects, selectedClip)
        if (clipCrop) {
            const cropData = getCropData(clipCrop)
            if (cropData) {
                startEditingCrop(clipCrop.id, cropData)
                return
            }
        }

        // Create a default crop effect for the selected clip
        const cropEffect = EffectsFactory.createCropEffect({
            clipId: selectedClip.id,
            startTime: selectedClip.startTime,
            endTime: selectedClip.startTime + selectedClip.duration,
            cropData: { x: 0, y: 0, width: 1, height: 1 }, // Default to full-frame (no crop)
        })

        CommandExecutor.getInstance().execute(AddEffectCommand, cropEffect)

        // Start editing immediately
        startEditingCrop(cropEffect.id, cropEffect.data as CropEffectData)
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

        // Update local editing state if we're editing this effect
        if (editingCropEffectId === effectId) {
            updateEditingStoreCrop(updates)
        }
    }, [contextEffects, editingCropEffectId, updateEditingStoreCrop])

    const handleStartEditCrop = useCallback(() => {
        if (!selectedClip) return

        // This ensures we edit exactly what the user sees, even if clips were trimmed/moved
        // and effect start times are slightly misaligned with clip start times.
        const cropEffect = getCropEffectForClip(contextEffects, selectedClip)

        if (!cropEffect) return

        const cropData = getCropData(cropEffect)
        if (!cropData) return

        startEditingCrop(cropEffect.id, cropData)
    }, [selectedClip, contextEffects, startEditingCrop])

    const handleCropConfirm = useCallback(() => {
        // Save current crop data to the effect
        if (editingCropEffectId && editingCropData) {
            handleUpdateCrop(editingCropEffectId, editingCropData)
        }

        // Exit editing mode
        stopEditingCrop()
    }, [
        editingCropEffectId,
        editingCropData,
        handleUpdateCrop,
        stopEditingCrop,
    ])

    const handleCropReset = useCallback(() => {
        // Remove the crop effect entirely
        if (editingCropEffectId) {
            handleRemoveCrop(editingCropEffectId)
        }

        // Exit editing mode
        stopEditingCrop()
    }, [editingCropEffectId, handleRemoveCrop, stopEditingCrop])

    const handleCropChange = useCallback((cropData: CropEffectData) => {
        updateEditingStoreCrop(cropData)
    }, [updateEditingStoreCrop])

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
