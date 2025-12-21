import { create } from 'zustand'
import { ExportFormat, QualityLevel } from '@/types/project'
import { ExportEngine, type ExportProgress } from '@/lib/export/export-engine'
import type { ExportSettings } from '@/types/export'
import { globalBlobManager } from '@/lib/security/blob-url-manager'

interface ExportStore {
  engine: ExportEngine | null
  isExporting: boolean
  progress: ExportProgress | null
  lastExport: Blob | null
  exportSettings: ExportSettings

  getEngine: () => ExportEngine

  updateSettings: (newSettings: Partial<ExportSettings>) => void

  exportProject: (project: import('@/types/project').Project) => Promise<void>
  exportAsGIF: (project: import('@/types/project').Project) => Promise<void>
  cancelExport: () => Promise<void>
  saveLastExport: (defaultFilename: string) => Promise<void>

  setPreset: (preset: string) => void
  reset: () => void
}

const defaultSettings: ExportSettings = {
  format: ExportFormat.MP4,
  quality: QualityLevel.High,
  resolution: { width: 1920, height: 1080 },
  framerate: 60,
  outputPath: ''
  // Memory settings are dynamically calculated in export-handler.ts based on system resources
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
    progress: null,
    lastExport: null,
    exportSettings: defaultSettings,

    getEngine,

    updateSettings: (newSettings) => {
      set((state) => ({
        exportSettings: { ...state.exportSettings, ...newSettings }
      }))
    },

    exportProject: async (project) => {
      const { exportSettings } = get()

      set({ isExporting: true, progress: null, lastExport: null })

      try {
        // Use the new unified export engine that handles everything
        const engine = getEngine()

        const blob = await engine.exportProject(
          project,
          exportSettings,
          (progress) => set({
            progress: {
              ...progress,
              progress: Math.max(0, Math.min(100, progress.progress))
            }
          })
        )

        // Validate blob thoroughly
        const size = blob.size
        if (!size || size <= 0) {
          throw new Error('Export produced an empty file. Please check your timeline has video clips.')
        }

        // Check for suspiciously small files (likely just headers)
        if (size < 256 * 1024) {
          throw new Error(`Export file is too small (${size} bytes). The export may have failed.`)
        }

        console.log(`Export successful: ${(size / 1024 / 1024).toFixed(2)} MB`)

        set({
          isExporting: false,
          lastExport: blob,
          progress: {
            progress: 100,
            stage: 'complete',
            message: `Export complete! (${(size / 1024 / 1024).toFixed(2)} MB)`
          }
        })

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const canceled = /cancel|abort/i.test(message)
        set({
          isExporting: false,
          progress: {
            progress: 0,
            stage: 'error',
            message: canceled ? 'Export canceled' : `Export failed: ${message}`
          }
        })
      }
    },

    exportAsGIF: async (project) => {
      const { exportSettings } = get()
      const engine = getEngine()

      set({ isExporting: true, progress: null, lastExport: null })

      try {
        // Export as GIF by changing the format
        const gifSettings = {
          ...exportSettings,
          format: ExportFormat.GIF,
          framerate: 10
        }

        const blob = await engine.exportProject(
          project,
          gifSettings,
          (progress) => set({
            progress: {
              ...progress,
              progress: Math.max(0, Math.min(100, progress.progress))
            }
          })
        )

        if (!blob.size) {
          throw new Error('GIF export produced an empty file')
        }

        set({
          isExporting: false,
          lastExport: blob,
          progress: {
            progress: 100,
            stage: 'complete',
            message: 'GIF export complete!'
          }
        })

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const canceled = /cancel|abort/i.test(message)
        set({
          isExporting: false,
          progress: {
            progress: 0,
            stage: 'error',
            message: canceled ? 'GIF export canceled' : `GIF export failed: ${message}`
          }
        })
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
      set({ isExporting: false, progress: null, lastExport: null })
    },

    saveLastExport: async (defaultFilename) => {
      const { lastExport, exportSettings } = get()
      if (!lastExport) return

      // Determine extension based on the blob type when available (handles codec fallbacks)
      const mime = lastExport.type || ''
      const inferredExt =
        mime === 'video/mp4' ? 'mp4' :
          mime === 'video/webm' ? 'webm' :
            mime === 'image/gif' ? 'gif' :
              (exportSettings.format === 'gif' ? 'gif' : exportSettings.format.toLowerCase())
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
          const arrayBuffer = await lastExport.arrayBuffer()
          await window.electronAPI.saveFile(arrayBuffer, result.filePath)
        }
        return
      }

      // We're in Electron, no browser fallback needed
      throw new Error('Electron API not available for file save')
    },

    setPreset: (preset) => {
      // Quality-tier based presets
      // Resolution height defines the tier, width is calculated from project aspect ratio at export time
      const presets: Record<string, Partial<ExportSettings>> = {
        'hd-60': { resolution: { width: 1920, height: 1080 }, framerate: 60, format: ExportFormat.MP4, quality: QualityLevel.High },
        'hd-30': { resolution: { width: 1920, height: 1080 }, framerate: 30, format: ExportFormat.MP4, quality: QualityLevel.Medium },
        '4k-60': { resolution: { width: 3840, height: 2160 }, framerate: 60, format: ExportFormat.MP4, quality: QualityLevel.Ultra },
        '4k-30': { resolution: { width: 3840, height: 2160 }, framerate: 30, format: ExportFormat.MP4, quality: QualityLevel.High },
        'sd': { resolution: { width: 1280, height: 720 }, framerate: 30, format: ExportFormat.MP4, quality: QualityLevel.Medium },
        'prores-hd': { resolution: { width: 1920, height: 1080 }, framerate: 60, format: ExportFormat.MOV, quality: QualityLevel.High },
        'prores-4k': { resolution: { width: 3840, height: 2160 }, framerate: 30, format: ExportFormat.MOV, quality: QualityLevel.Ultra },
        'gif': { resolution: { width: 640, height: 480 }, framerate: 15, format: ExportFormat.GIF, quality: QualityLevel.Low }
      }

      set((state) => ({
        exportSettings: { ...state.exportSettings, ...(presets[preset] || {}) as Partial<ExportSettings> }
      }))
    },

    reset: () => {
      // Clean up any export-related blobs from blob manager
      if (typeof globalBlobManager !== 'undefined') {
        globalBlobManager.cleanupByType('export')
      }
      // Reset state - this will release the lastExport blob reference
      set({ isExporting: false, progress: null, lastExport: null })
    }
  }
})
