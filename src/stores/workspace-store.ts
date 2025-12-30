import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SidebarTabId } from '@/components/effects-sidebar/constants'

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
  activeSidebarTab: SidebarTabId

  // Clip tab UI state
  clipTabSpeedAdvancedOpen: boolean
  clipTabFadeAdvancedOpen: boolean
  cursorTabFineTuneOpen: boolean
  motionTabAdvancedOpen: boolean

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
  setActiveSidebarTab: (tab: SidebarTabId) => void
  setCurrentView: (view: WorkspaceView) => void
  setClipTabSpeedAdvancedOpen: (open: boolean) => void
  setClipTabFadeAdvancedOpen: (open: boolean) => void
  setCursorTabFineTuneOpen: (open: boolean) => void
  setMotionTabAdvancedOpen: (open: boolean) => void

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
  activeSidebarTab: SidebarTabId.Style,
  clipTabSpeedAdvancedOpen: false,
  clipTabFadeAdvancedOpen: false,
  cursorTabFineTuneOpen: false,
  motionTabAdvancedOpen: false,
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
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

      setActiveSidebarTab: (tab: SidebarTabId) => {
        set({ activeSidebarTab: tab })
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

      setMotionTabAdvancedOpen: (open: boolean) => {
        set({ motionTabAdvancedOpen: open })
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
      version: 6,
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState

        let state = persistedState as any

        // Migration from version 5 or lower
        if (version < 6) {
          state = {
            ...state,
            activeSidebarTab: SidebarTabId.Style,
            motionTabAdvancedOpen: false
          }
        }

        // Migrate old utility tabs into the new "advanced" bucket.
        if (state.activeUtilityTab === 'editing') {
          state = { ...state, activeUtilityTab: 'advanced' }
        }

        // Version 3: Force compact timeline for existing users
        if (typeof state.timelineHeight === 'number') {
          // If it was the old default (250) or larger, reducing it to new compact default
          if (state.timelineHeight >= 250) {
            state = { ...state, timelineHeight: 160 }
          }
        }

        if (typeof state.isHighQualityPlaybackEnabled === 'boolean') {
          return state
        }
        if (typeof state.isHighResPreviewEnabled === 'boolean') {
          return {
            ...state,
            isHighQualityPlaybackEnabled: state.isHighResPreviewEnabled,
          }
        }
        return state
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
        activeSidebarTab: state.activeSidebarTab,
        clipTabSpeedAdvancedOpen: state.clipTabSpeedAdvancedOpen,
        clipTabFadeAdvancedOpen: state.clipTabFadeAdvancedOpen,
        cursorTabFineTuneOpen: state.cursorTabFineTuneOpen,
        motionTabAdvancedOpen: state.motionTabAdvancedOpen,
      }),
    }
  )
)
