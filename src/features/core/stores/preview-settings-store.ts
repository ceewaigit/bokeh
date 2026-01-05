import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PreviewSettings = {
  showRuleOfThirds: boolean
  showCenterGuides: boolean
  showSafeZones: boolean
  guideColor: string
  guideOpacity: number
  safeZoneMargin: number
  highQuality: boolean
  showGlow: boolean
  glowIntensity: number
  showTimelineThumbnails: boolean
  /** When enabled, hovering over timeline shows ghost playhead and scrubs preview */
  scrubOnHover: boolean
}

type PreviewSettingsStore = PreviewSettings & {
  setPreviewSettings: (updates: Partial<PreviewSettings>) => void
}

const defaultPreviewSettings: PreviewSettings = {
  showRuleOfThirds: false,
  showCenterGuides: false,
  showSafeZones: false,
  guideColor: '#111111',
  guideOpacity: 0.75,
  safeZoneMargin: 10,
  highQuality: false,
  showGlow: false,
  glowIntensity: 0.3,
  showTimelineThumbnails: true,
  scrubOnHover: true,
}

export const usePreviewSettingsStore = create<PreviewSettingsStore>()(
  persist(
    (set) => ({
      ...defaultPreviewSettings,
      setPreviewSettings: (updates) =>
        set((state) => ({
          ...state,
          ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)),
        })),
    }),
    {
      name: 'preview-settings-storage',
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as PreviewSettingsStore
        if (typeof state.showTimelineThumbnails !== 'boolean') {
          return {
            ...state,
            showTimelineThumbnails: defaultPreviewSettings.showTimelineThumbnails,
          }
        }
        if (
          state.guideColor === 'rgba(255, 255, 255, 0.5)' &&
          state.guideOpacity === 0.5
        ) {
          return {
            ...state,
            guideColor: defaultPreviewSettings.guideColor,
            guideOpacity: defaultPreviewSettings.guideOpacity,
          }
        }
        return state
      },
      partialize: (state) => ({
        showRuleOfThirds: state.showRuleOfThirds,
        showCenterGuides: state.showCenterGuides,
        showSafeZones: state.showSafeZones,
        guideColor: state.guideColor,
        guideOpacity: state.guideOpacity,
        safeZoneMargin: state.safeZoneMargin,
        highQuality: state.highQuality,
        showGlow: state.showGlow,
        glowIntensity: state.glowIntensity,
        showTimelineThumbnails: state.showTimelineThumbnails,
        scrubOnHover: state.scrubOnHover,
      }),
    }
  )
)
