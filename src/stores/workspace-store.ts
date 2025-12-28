import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UtilityTabId = 'import' | 'audio' | 'guides' | 'plugins' | 'advanced'

export type WorkspaceView = 'library' | 'editor' | 'plugin-creator'

interface WorkspaceStore {
  // UI Layout State
  isPropertiesOpen: boolean
  isUtilitiesOpen: boolean  // Left sidebar - closed by default
  isTimelineOpen: boolean
  isExportOpen: boolean

  // Modal State
  showProjectManager: boolean
  showWelcomeScreen: boolean
  isSettingsOpen: boolean

  // Panel Sizes
  propertiesPanelWidth: number
  utilitiesPanelWidth: number  // Left sidebar width
  timelineHeight: number
  previewScale: number

  // Navigation
  currentView: WorkspaceView

  // Active Tabs
  activeUtilityTab: UtilityTabId

  // Clip tab UI state
  clipTabSpeedAdvancedOpen: boolean
  clipTabFadeAdvancedOpen: boolean
  cursorTabFineTuneOpen: boolean

  // Workspace Actions
  toggleProperties: () => void
  toggleUtilities: () => void  // Toggle left sidebar
  toggleTimeline: () => void
  setExportOpen: (open: boolean) => void
  setShowProjectManager: (show: boolean) => void
  setShowWelcomeScreen: (show: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setPropertiesPanelWidth: (width: number) => void
  setUtilitiesPanelWidth: (width: number) => void
  setTimelineHeight: (height: number) => void
  setPreviewScale: (scale: number) => void
  setActiveUtilityTab: (tab: UtilityTabId) => void
  setCurrentView: (view: WorkspaceView) => void
  setClipTabSpeedAdvancedOpen: (open: boolean) => void
  setClipTabFadeAdvancedOpen: (open: boolean) => void
  setCursorTabFineTuneOpen: (open: boolean) => void

  // Workspace Presets
  loadWorkspacePreset: (preset: 'minimal' | 'standard' | 'advanced') => void
  resetWorkspace: () => void

}

const defaultWorkspaceState = {
  isPropertiesOpen: true,
  isUtilitiesOpen: false,  // Closed by default for clean UX
  isTimelineOpen: true,
  isExportOpen: false,
  showProjectManager: false,
  showWelcomeScreen: false,
  isSettingsOpen: false,
  propertiesPanelWidth: 400,
  utilitiesPanelWidth: 400,  // Default open width
  timelineHeight: 250,  // Default height in px (will respect 30vh minimum)
  previewScale: 1,
  currentView: 'library' as WorkspaceView,
  activeUtilityTab: 'import' as UtilityTabId,
  clipTabSpeedAdvancedOpen: false,
  clipTabFadeAdvancedOpen: false,
  cursorTabFineTuneOpen: false,
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, _get) => ({
      ...defaultWorkspaceState,

      toggleProperties: () => {
        set((state) => ({ isPropertiesOpen: !state.isPropertiesOpen }))
      },

      toggleUtilities: () => {
        set((state) => ({ isUtilitiesOpen: !state.isUtilitiesOpen }))
      },

      toggleTimeline: () => {
        set((state) => ({ isTimelineOpen: !state.isTimelineOpen }))
      },

      setExportOpen: (open: boolean) => {
        set({ isExportOpen: open })
      },

      setShowProjectManager: (show: boolean) => {
        set({ showProjectManager: show })
      },

      setShowWelcomeScreen: (show: boolean) => {
        set({ showWelcomeScreen: show })
      },

      setSettingsOpen: (open: boolean) => {
        set({ isSettingsOpen: open })
      },

      setPropertiesPanelWidth: (width: number) => {
        set({ propertiesPanelWidth: Math.max(300, Math.min(600, width)) })
      },

      setUtilitiesPanelWidth: (width: number) => {
        set({ utilitiesPanelWidth: Math.max(200, Math.min(400, width)) })
      },

      setTimelineHeight: (height: number) => {
        // Min 60px (ultra compact), max 50vh (~400px)
        const minHeight = 60
        const maxHeight = window.innerHeight * 0.5
        set({ timelineHeight: Math.max(minHeight, Math.min(maxHeight, height)) })
      },

      setPreviewScale: (scale: number) => {
        set({ previewScale: Math.max(0.8, Math.min(1.8, scale)) })
      },

      setActiveUtilityTab: (tab: UtilityTabId) => {
        set({ activeUtilityTab: tab })
      },

      setCurrentView: (view: WorkspaceView) => {
        set({ currentView: view })
      },

      setClipTabSpeedAdvancedOpen: (open: boolean) => {
        set({ clipTabSpeedAdvancedOpen: open })
      },

      setClipTabFadeAdvancedOpen: (open: boolean) => {
        set({ clipTabFadeAdvancedOpen: open })
      },

      setCursorTabFineTuneOpen: (open: boolean) => {
        set({ cursorTabFineTuneOpen: open })
      },



      loadWorkspacePreset: (preset: 'minimal' | 'standard' | 'advanced') => {
        switch (preset) {
          case 'minimal':
            set({
              isPropertiesOpen: false,
              isTimelineOpen: true,
              propertiesPanelWidth: 360,
              timelineHeight: 120,
            })
            break
          case 'standard':
            set({
              isPropertiesOpen: true,
              isTimelineOpen: true,
              propertiesPanelWidth: 400,
              timelineHeight: 160,
            })
            break
          case 'advanced':
            set({
              isPropertiesOpen: true,
              isTimelineOpen: true,
              propertiesPanelWidth: 400,
              timelineHeight: 250,
            })
            break
        }
      },

      resetWorkspace: () => {
        // Only reset transient state (modals, etc.)
        // Preserve user's layout preferences
        set({
          isExportOpen: false,
          showProjectManager: false,
          showWelcomeScreen: false,
        })
      },
    }),
    {
      name: 'workspace-storage',
      version: 5,
      migrate: (persistedState: any) => {
        if (!persistedState) return persistedState

        // Migrate old utility tabs into the new "advanced" bucket.
        if (persistedState.activeUtilityTab === 'editing') {
          persistedState = { ...persistedState, activeUtilityTab: 'advanced' }
        }

        // Version 3: Force compact timeline for existing users (Screen Studio style)
        if (typeof persistedState.timelineHeight === 'number') {
          // If it was the old default (250) or larger, reducing it to new compact default
          if (persistedState.timelineHeight >= 250) {
            persistedState = { ...persistedState, timelineHeight: 160 }
          }
        }

        if (typeof persistedState.isHighQualityPlaybackEnabled === 'boolean') {
          return persistedState
        }
        if (typeof persistedState.isHighResPreviewEnabled === 'boolean') {
          return {
            ...persistedState,
            isHighQualityPlaybackEnabled: persistedState.isHighResPreviewEnabled,
          }
        }
        return persistedState
      },
      partialize: (state) => ({
        isPropertiesOpen: state.isPropertiesOpen,
        isUtilitiesOpen: state.isUtilitiesOpen,
        isTimelineOpen: state.isTimelineOpen,
        propertiesPanelWidth: state.propertiesPanelWidth,
        utilitiesPanelWidth: state.utilitiesPanelWidth,
        timelineHeight: state.timelineHeight,
        previewScale: state.previewScale,
        activeUtilityTab: state.activeUtilityTab,
        clipTabSpeedAdvancedOpen: state.clipTabSpeedAdvancedOpen,
        clipTabFadeAdvancedOpen: state.clipTabFadeAdvancedOpen,
        cursorTabFineTuneOpen: state.cursorTabFineTuneOpen,
      }),
    }
  )
)
