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

  // Navigation
  currentView: WorkspaceView

  // Active Tabs
  activeUtilityTab: UtilityTabId

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
  setActiveUtilityTab: (tab: UtilityTabId) => void
  setCurrentView: (view: WorkspaceView) => void

  // Workspace Presets
  loadWorkspacePreset: (preset: 'minimal' | 'standard' | 'advanced') => void
  resetWorkspace: () => void

  // Preview Settings
  isHighQualityPlaybackEnabled: boolean
  setHighQualityPlaybackEnabled: (enabled: boolean) => void
  isGlowEnabled: boolean
  setGlowEnabled: (enabled: boolean) => void
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
  timelineHeight: 200,
  currentView: 'library' as WorkspaceView,
  activeUtilityTab: 'import' as UtilityTabId,
  isHighQualityPlaybackEnabled: false,
  isGlowEnabled: true, // Ambient glow effect on preview
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
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
        set({ timelineHeight: Math.max(150, Math.min(400, height)) })
      },

      setActiveUtilityTab: (tab: UtilityTabId) => {
        set({ activeUtilityTab: tab })
      },

      setCurrentView: (view: WorkspaceView) => {
        set({ currentView: view })
      },

      setHighQualityPlaybackEnabled: (enabled: boolean) => {
        set({ isHighQualityPlaybackEnabled: enabled })
      },

      setGlowEnabled: (enabled: boolean) => {
        set({ isGlowEnabled: enabled })
      },

      loadWorkspacePreset: (preset: 'minimal' | 'standard' | 'advanced') => {
        switch (preset) {
          case 'minimal':
            set({
              isPropertiesOpen: false,
              isTimelineOpen: true,
              propertiesPanelWidth: 360,
              timelineHeight: 150,
            })
            break
          case 'standard':
            set({
              isPropertiesOpen: true,
              isTimelineOpen: true,
              propertiesPanelWidth: 400,
              timelineHeight: 200,
            })
            break
          case 'advanced':
            set({
              isPropertiesOpen: true,
              isTimelineOpen: true,
              propertiesPanelWidth: 400,
              timelineHeight: 300,
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
      version: 2,
  migrate: (persistedState: any) => {
        if (!persistedState) return persistedState

        // Migrate old utility tabs into the new "advanced" bucket.
        if (persistedState.activeUtilityTab === 'editing') {
          persistedState = { ...persistedState, activeUtilityTab: 'advanced' }
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
        activeUtilityTab: state.activeUtilityTab,
        isHighQualityPlaybackEnabled: state.isHighQualityPlaybackEnabled,
        isGlowEnabled: state.isGlowEnabled,
      }),
    }
  )
)
