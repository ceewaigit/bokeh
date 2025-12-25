import { useState, useCallback, useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { EffectType } from '@/types/project'
import type { Effect, CropEffectData, Clip } from '@/types/project'
import { CommandManager } from '@/lib/commands'
import { getCropEffectForClip, getCropData } from '@/lib/effects/effect-filters'
import { EffectsFactory } from '@/lib/effects/effects-factory'

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
    contextEffects: Effect[],
    selectedClip: Clip | null | undefined
): UseCropManagerReturn {
    // Crop editing state
    const [isEditingCrop, setIsEditingCrop] = useState(false)
    const [editingCropData, setEditingCropData] = useState<CropEffectData | null>(null)
    const [editingCropEffectId, setEditingCropEffectId] = useState<string | null>(null)

    // We need a ref to the command manager instance
    // We can get it via singleton since it's initialized in WorkspaceManager/Layout usually
    // But safer to get it fresh on usage or keep a ref if available.
    // WorkspaceManager initializes it: CommandManager.getInstance(commandContextRef.current)
    // We'll rely on CommandManager.getInstance() returning the singleton if initialized.
    // However, we need to be careful if it's not initialized yet.
    // Ideally, this hook runs inside a component where CommandManager is ready.

    // Monitor effect existence to auto-close editing if removed externally
    useEffect(() => {
        if (!editingCropEffectId) return
        const stillExists = contextEffects.some(effect => effect.id === editingCropEffectId)
        if (!stillExists) {
            setIsEditingCrop(false)
            setEditingCropData(null)
            setEditingCropEffectId(null)
        }
    }, [contextEffects, editingCropEffectId])

    const handleAddCrop = useCallback(() => {
        // Need current project to know if we can add
        // We can access store directly
        const currentProject = useProjectStore.getState().currentProject
        if (!selectedClip || !currentProject) return

        const commandManager = CommandManager.getInstance()
        if (!commandManager) return

        const currentTime = useProjectStore.getState().currentTime
        const activeCrop = contextEffects.find(e =>
            e.type === EffectType.Crop &&
            e.startTime <= currentTime &&
            e.endTime > currentTime
        )

        if (activeCrop) {
            const cropData = getCropData(activeCrop)
            if (cropData) {
                setEditingCropEffectId(activeCrop.id)
                setEditingCropData(cropData)
                setIsEditingCrop(true)
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

        commandManager.executeByName('AddEffect', cropEffect)

        // Start editing immediately
        setEditingCropEffectId(cropEffect.id)
        setEditingCropData(cropEffect.data as CropEffectData)
        setIsEditingCrop(true)
    }, [selectedClip, contextEffects])

    const handleRemoveCrop = useCallback((effectId: string) => {
        const commandManager = CommandManager.getInstance()
        if (!commandManager) return

        commandManager.executeByName('RemoveEffect', effectId)

        // Clear editing state if we were editing this effect
        if (editingCropEffectId === effectId) {
            setIsEditingCrop(false)
            setEditingCropData(null)
            setEditingCropEffectId(null)
        }
    }, [editingCropEffectId])

    const handleUpdateCrop = useCallback((effectId: string, updates: Partial<CropEffectData>) => {
        const commandManager = CommandManager.getInstance()
        if (!commandManager) return

        const effect = contextEffects.find(e => e.id === effectId)
        if (!effect) return

        commandManager.executeByName('UpdateEffect', effectId, {
            data: {
                ...effect.data,
                ...updates,
            },
        })

        // Update local editing state if we're editing this effect
        if (editingCropEffectId === effectId && editingCropData) {
            setEditingCropData({
                ...editingCropData,
                ...updates,
            })
        }
    }, [contextEffects, editingCropEffectId, editingCropData])

    const handleStartEditCrop = useCallback(() => {
        if (!selectedClip) return

        // This ensures we edit exactly what the user sees, even if clips were trimmed/moved
        // and effect start times are slightly misaligned with clip start times.
        const currentTime = useProjectStore.getState().currentTime
        let cropEffect = contextEffects.find(e =>
            e.type === EffectType.Crop &&
            e.startTime <= currentTime &&
            e.endTime > currentTime
        )

        // Fallback: Use clip-scoped match if no active effect found (e.g. playhead outside range)
        if (!cropEffect) {
            cropEffect = getCropEffectForClip(contextEffects, selectedClip)
        }

        if (!cropEffect) return

        const cropData = getCropData(cropEffect)
        if (!cropData) return

        setEditingCropEffectId(cropEffect.id)
        setEditingCropData(cropData)
        setIsEditingCrop(true)
    }, [selectedClip, contextEffects])

    const handleCropConfirm = useCallback(() => {
        // Save current crop data to the effect
        if (editingCropEffectId && editingCropData) {
            handleUpdateCrop(editingCropEffectId, editingCropData)
        }

        // Exit editing mode
        setIsEditingCrop(false)
        setEditingCropData(null)
        setEditingCropEffectId(null)
    }, [editingCropEffectId, editingCropData, handleUpdateCrop])

    const handleCropReset = useCallback(() => {
        // Remove the crop effect entirely
        if (editingCropEffectId) {
            handleRemoveCrop(editingCropEffectId)
        }

        // Exit editing mode
        setIsEditingCrop(false)
        setEditingCropData(null)
        setEditingCropEffectId(null)
    }, [editingCropEffectId, handleRemoveCrop])

    const handleCropChange = useCallback((cropData: CropEffectData) => {
        setEditingCropData(cropData)
    }, [])

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
