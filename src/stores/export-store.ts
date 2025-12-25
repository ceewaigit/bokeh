import { create } from 'zustand'
import { ExportFormat } from '@/types/project'
import { ExportEngine } from '@/lib/export/export-engine'
import type { ExportSettings } from '@/types/export'
import type { Project } from '@/types/project'
import { useProjectStore } from './project-store'

interface ExportStore {
  engine: ExportEngine | null
  isExporting: boolean
  lastExport: Blob | null
  lastExportSettings: ExportSettings | null

  getEngine: () => ExportEngine

  exportProject: (project: Project, settings: ExportSettings) => Promise<void>
  exportAsGIF: (project: Project, settings: ExportSettings) => Promise<void>
  cancelExport: () => Promise<void>
  saveLastExport: (defaultFilename: string) => Promise<void>

  reset: () => void
}

export const useExportStore = create<ExportStore>((set, get) => {
  let engine: ExportEngine | null = null

  const getEngine = () => {
    if (!engine && typeof window !== 'undefined') {
      engine = new ExportEngine()
    }
    if (!engine) {
      throw new Error('ExportEngine not available in SSR context')
    }
    return engine
  }

  return {
    engine: null,
    isExporting: false,
    lastExport: null,
    lastExportSettings: null,

    getEngine,

    exportProject: async (project, settings) => {
      set({ isExporting: true, lastExport: null, lastExportSettings: settings })

      // Start unified progress
      useProjectStore.getState().startProcessing('Exporting Project...')

      try {
        // Use the new unified export engine that handles everything
        const engine = getEngine()

        const result = await engine.exportProject(
          project,
          settings,
          (progress) => {
            // Update unified progress
            useProjectStore.getState().setProgress(
              Math.max(0, Math.min(100, progress.progress)),
              progress.message,
              progress.eta
            )
          }
        )

        // Validate result thoroughly
        if (!result || !(result instanceof Blob)) {
          throw new Error('Export produced an invalid result.')
        }

        console.log(`Export successful: ${result.size} bytes`)

        set({
          isExporting: false,
          lastExport: result,
        })

        // Finish unified progress
        useProjectStore.getState().finishProcessing('Export complete')

      } catch (error) {
        // Fail unified progress
        useProjectStore.getState().failProcessing(error instanceof Error ? error.message : 'Export failed')

        set({ isExporting: false })
      }
    },

    exportAsGIF: async (project, settings) => {
      const engine = getEngine()

      // Export as GIF by changing the format
      const gifSettings = {
        ...settings,
        format: ExportFormat.GIF,
        framerate: 10
      }

      set({ isExporting: true, lastExport: null, lastExportSettings: gifSettings })

      // Start unified progress
      useProjectStore.getState().startProcessing('Exporting GIF...')

      try {
        const result = await engine.exportProject(
          project,
          gifSettings,
          (progress) => {
            // Update unified progress
            useProjectStore.getState().setProgress(
              Math.max(0, Math.min(100, progress.progress)),
              progress.message,
              progress.eta
            )
          }
        )

        if (!result || !(result instanceof Blob)) {
          throw new Error('GIF export produced an invalid result.')
        }

        set({
          isExporting: false,
          lastExport: result,
        })

        // Finish unified progress
        useProjectStore.getState().finishProcessing('GIF export complete')

      } catch (error) {
        // Fail unified progress
        useProjectStore.getState().failProcessing(error instanceof Error ? error.message : 'GIF export failed')

        set({ isExporting: false })
      }
    },

    cancelExport: async () => {
      // FIX: Use getEngine() because 'engine' in state is always null (it's a closure variable)
      try {
        const engine = getEngine()
        await engine.cancelExport()
      } catch (e) {
        console.error('Failed to cancel export:', e)
      }
      useProjectStore.getState().resetProgress()
      set({ isExporting: false, lastExport: null })
    },

    saveLastExport: async (defaultFilename) => {
      const { lastExport, lastExportSettings } = get()
      if (!lastExport || !lastExportSettings) return

      // Determine extension based on the blob type when available (handles codec fallbacks)
      const mime = lastExport.type || ''
      const inferredExt =
        mime === 'video/mp4' ? 'mp4' :
          mime === 'video/webm' ? 'webm' :
            mime === 'image/gif' ? 'gif' :
              (lastExportSettings.format === 'gif' ? 'gif' : lastExportSettings.format.toLowerCase())
      const extension = inferredExt
      const suggestedName = defaultFilename.endsWith(`.${extension}`)
        ? defaultFilename
        : `${defaultFilename.replace(/\.[a-zA-Z0-9]+$/, '')}.${extension}`

      // Desktop (Electron): show save dialog
      if (window.electronAPI?.showSaveDialog && window.electronAPI?.saveFile) {
        const result = await window.electronAPI.showSaveDialog({
          title: 'Save exported file',
          defaultPath: suggestedName,
          filters: [
            { name: extension.toUpperCase(), extensions: [extension] }
          ]
        })

        if (result && !result.canceled && result.filePath) {
          // In Electron, we need to save the ArrayBuffer
          const arrayBuffer = await lastExport.arrayBuffer()
          await window.electronAPI.saveFile(arrayBuffer, result.filePath)
        }
        return
      }

      // We're in Electron, no browser fallback needed
      throw new Error('Electron API not available for file save')
    },

    reset: () => {
      // Reset state - this will release the lastExport blob reference
      useProjectStore.getState().resetProgress()
      set({ isExporting: false, lastExport: null, lastExportSettings: null })
    }
  }
})
