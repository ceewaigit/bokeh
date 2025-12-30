import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import type { Effect, Project } from '@/types/project'
import { EffectType } from '@/types/project'
import { EffectStore } from '@/lib/core/effects'

/**
 * Find webcam effect in the project using EffectStore
 */
function findWebcamEffect(project: Project | null, effectId: string): Effect | null {
    if (!project) return null
    const effect = EffectStore.get(project, effectId)
    return effect?.type === EffectType.Webcam ? effect : null
}

interface WebcamBlockUpdates {
    startTime?: number
    endTime?: number
}

/**
 * Command for updating webcam effect timing (position/duration on timeline).
 *
 * Effect timing is the single source of truth for webcam visibility.
 * Follows the same pattern as UpdateZoomBlockCommand for consistency.
 */
export class UpdateWebcamBlockCommand extends Command<{ blockId: string }> {
    private originalData?: { startTime: number; endTime: number }
    private blockId: string
    private updates: WebcamBlockUpdates

    constructor(
        private context: CommandContext,
        blockId: string,
        updates: WebcamBlockUpdates
    ) {
        super({
            name: 'UpdateWebcamBlock',
            description: `Update webcam block ${blockId}`,
            category: 'effects'
        })
        this.blockId = blockId
        this.updates = updates
    }

    canExecute(): boolean {
        const project = this.context.getProject()
        return findWebcamEffect(project, this.blockId) !== null
    }

    doExecute(): CommandResult<{ blockId: string }> {
        const store = this.context.getStore()
        const project = this.context.getProject()
        const effect = findWebcamEffect(project, this.blockId)

        if (!effect) {
            return {
                success: false,
                error: `Webcam effect ${this.blockId} not found`
            }
        }

        // Store original state for undo
        this.originalData = {
            startTime: effect.startTime,
            endTime: effect.endTime
        }

        // Update the effect timing (single source of truth)
        store.updateEffect(this.blockId, {
            startTime: this.updates.startTime ?? effect.startTime,
            endTime: this.updates.endTime ?? effect.endTime
        })

        return {
            success: true,
            data: { blockId: this.blockId }
        }
    }

    doUndo(): CommandResult<{ blockId: string }> {
        if (!this.originalData) {
            return {
                success: false,
                error: 'No original data to restore'
            }
        }

        const store = this.context.getStore()

        store.updateEffect(this.blockId, {
            startTime: this.originalData.startTime,
            endTime: this.originalData.endTime
        })

        return {
            success: true,
            data: { blockId: this.blockId }
        }
    }

    doRedo(): CommandResult<{ blockId: string }> {
        const store = this.context.getStore()
        const project = this.context.getProject()
        const effect = findWebcamEffect(project, this.blockId)

        if (effect) {
            store.updateEffect(this.blockId, {
                startTime: this.updates.startTime ?? effect.startTime,
                endTime: this.updates.endTime ?? effect.endTime
            })
        }

        return {
            success: true,
            data: { blockId: this.blockId }
        }
    }
}
