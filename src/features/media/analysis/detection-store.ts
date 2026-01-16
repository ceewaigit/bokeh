/**
 * Detection Store - Ephemeral storage for detection results.
 *
 * Stores idle/typing detection periods separately from project state.
 * Benefits:
 * - No `as any` casts for type safety
 * - Detection state doesn't pollute project saves
 * - Simpler undo/redo (detection state is ephemeral)
 */

import { create } from 'zustand'

export interface IdlePeriod {
  startTime: number
  endTime: number
  suggestedSpeedMultiplier: number
  confidence: number
}

export interface TypingPeriod {
  startTime: number
  endTime: number
  keyCount: number
  averageWpm: number
  suggestedSpeedMultiplier: number
}

interface DetectionState {
  idlePeriods: Map<string, IdlePeriod[]>
  typingPeriods: Map<string, TypingPeriod[]>
}

interface DetectionActions {
  setIdlePeriods: (recordingId: string, periods: IdlePeriod[]) => void
  setTypingPeriods: (recordingId: string, periods: TypingPeriod[]) => void
  getIdlePeriods: (recordingId: string) => IdlePeriod[]
  getTypingPeriods: (recordingId: string) => TypingPeriod[]
  clearForRecording: (recordingId: string) => void
  clearAll: () => void
}

export const useDetectionStore = create<DetectionState & DetectionActions>((set, get) => ({
  idlePeriods: new Map(),
  typingPeriods: new Map(),

  setIdlePeriods: (recordingId, periods) =>
    set(state => {
      const newMap = new Map(state.idlePeriods)
      newMap.set(recordingId, periods)
      return { idlePeriods: newMap }
    }),

  setTypingPeriods: (recordingId, periods) =>
    set(state => {
      const newMap = new Map(state.typingPeriods)
      newMap.set(recordingId, periods)
      return { typingPeriods: newMap }
    }),

  getIdlePeriods: (recordingId) =>
    get().idlePeriods.get(recordingId) ?? [],

  getTypingPeriods: (recordingId) =>
    get().typingPeriods.get(recordingId) ?? [],

  clearForRecording: (recordingId) =>
    set(state => {
      const newIdleMap = new Map(state.idlePeriods)
      const newTypingMap = new Map(state.typingPeriods)
      newIdleMap.delete(recordingId)
      newTypingMap.delete(recordingId)
      return { idlePeriods: newIdleMap, typingPeriods: newTypingMap }
    }),

  clearAll: () =>
    set({ idlePeriods: new Map(), typingPeriods: new Map() })
}))

// Non-React access for use in services
export const DetectionStore = {
  getIdlePeriods: (recordingId: string): IdlePeriod[] =>
    useDetectionStore.getState().getIdlePeriods(recordingId),

  getTypingPeriods: (recordingId: string): TypingPeriod[] =>
    useDetectionStore.getState().getTypingPeriods(recordingId),

  setIdlePeriods: (recordingId: string, periods: IdlePeriod[]): void =>
    useDetectionStore.getState().setIdlePeriods(recordingId, periods),

  setTypingPeriods: (recordingId: string, periods: TypingPeriod[]): void =>
    useDetectionStore.getState().setTypingPeriods(recordingId, periods),

  clearForRecording: (recordingId: string): void =>
    useDetectionStore.getState().clearForRecording(recordingId),

  clearAll: (): void =>
    useDetectionStore.getState().clearAll()
}
