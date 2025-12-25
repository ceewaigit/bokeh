import type { CreateProgressSlice, ProgressState } from './types'

// Default state
export const initialProgressState: ProgressState = {
    isProcessing: false,
    progress: 0,
    progressLabel: null,
    progressStage: 'idle',
    progressMessage: undefined,
    eta: undefined,
    currentFrame: undefined,
    totalFrames: undefined
}

export const createProgressSlice: CreateProgressSlice = (set) => ({
    progress: initialProgressState,

    startProcessing: (label) =>
        set((state) => {
            state.progress.isProcessing = true
            state.progress.progress = 0
            state.progress.progressLabel = label
            state.progress.progressStage = 'preparing'
            state.progress.progressMessage = undefined
            state.progress.eta = undefined
        }),

    setProgress: (progress, message, eta) =>
        set((state) => {
            state.progress.progress = progress
            if (message) state.progress.progressMessage = message
            if (eta !== undefined) state.progress.eta = eta

            // Auto-update stage based on progress if generalized
            if (progress > 0 && progress < 100 && state.progress.progressStage === 'preparing') {
                state.progress.progressStage = 'rendering'
            }
        }),

    setProgressDetails: (details) =>
        set((state) => {
            Object.assign(state.progress, details)
        }),

    finishProcessing: (message) =>
        set((state) => {
            state.progress.isProcessing = false
            state.progress.progress = 100
            state.progress.progressStage = 'complete'
            state.progress.progressMessage = message
        }),

    failProcessing: (error) =>
        set((state) => {
            state.progress.isProcessing = false
            // Keep progress as is to show where it failed, or reset?
            // Usually better to show error state.
            state.progress.progressStage = 'error'
            state.progress.progressMessage = error
        }),

    resetProgress: () =>
        set((state) => {
            state.progress = initialProgressState
        })
})
