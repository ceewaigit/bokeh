/**
 * Progress Store
 *
 * Independent store for processing progress state.
 * Decoupled from project-store to avoid cross-store dependencies.
 *
 * Used by export operations, transcription, and any long-running process.
 */

import { create } from 'zustand'

export interface ProgressState {
  isProcessing: boolean
  progress: number // 0-100
  progressLabel: string | null // e.g., "Exporting...", "Processing..."
  progressStage: 'idle' | 'preparing' | 'rendering' | 'encoding' | 'complete' | 'error'
  progressMessage?: string // Detailed message
  eta?: number // Estimated seconds remaining
  currentFrame?: number
  totalFrames?: number
}

interface ProgressActions {
  startProcessing: (label: string) => void
  setProgress: (progress: number, message?: string, eta?: number) => void
  setProgressDetails: (details: Partial<ProgressState>) => void
  finishProcessing: (message?: string) => void
  failProcessing: (error: string) => void
  resetProgress: () => void
}

export type ProgressStore = ProgressState & ProgressActions

const initialState: ProgressState = {
  isProcessing: false,
  progress: 0,
  progressLabel: null,
  progressStage: 'idle',
  progressMessage: undefined,
  eta: undefined,
  currentFrame: undefined,
  totalFrames: undefined
}

export const useProgressStore = create<ProgressStore>((set) => ({
  ...initialState,

  startProcessing: (label) =>
    set({
      isProcessing: true,
      progress: 0,
      progressLabel: label,
      progressStage: 'preparing',
      progressMessage: undefined,
      eta: undefined,
    }),

  setProgress: (progress, message, eta) =>
    set((state) => ({
      progress,
      progressMessage: message ?? state.progressMessage,
      eta: eta ?? state.eta,
      // Auto-update stage based on progress
      progressStage: progress > 0 && progress < 100 && state.progressStage === 'preparing'
        ? 'rendering'
        : state.progressStage,
    })),

  setProgressDetails: (details) =>
    set((state) => ({ ...state, ...details })),

  finishProcessing: (message) =>
    set({
      isProcessing: false,
      progress: 100,
      progressStage: 'complete',
      progressMessage: message,
    }),

  failProcessing: (error) =>
    set({
      isProcessing: false,
      progressStage: 'error',
      progressMessage: error,
    }),

  resetProgress: () => set(initialState),
}))
