import type { Project, Recording, CursorEffectData, MouseEvent } from '@/types/project'
import { ProjectStorage } from './project-storage'
import { globalBlobManager } from '@/shared/security/blob-url-manager'
import { migrationRunner } from '@/shared/migrations'
import { getVideoMetadata } from '@/shared/utils/video-metadata'
import { PROJECT_EXTENSION, buildProjectFilePath, resolveProjectRoot } from '@/features/core/storage/project-paths'
import { precomputeCursorSmoothingCache } from '@/features/effects/cursor/logic/cursor-logic'
import { ProxyService } from '@/features/proxy'

import { DEFAULT_CURSOR_DATA } from '@/features/effects/cursor/config';
import { EffectStore } from '@/features/effects/core/store'
import { InvalidPathError, MissingVideoError } from '@/shared/errors'

/**
 * Options for loadProjectFromRecording
 */
export interface LoadProjectOptions {
  onProgress?: (message: string) => void
  awaitPlaybackPreparation?: boolean
}

/**
 * Service for project file I/O operations
 * Extracted from project-store's openProject and saveCurrentProject methods
 */
export class ProjectIOService {
  private static async resolveProjectFilePath(projectPath: string): Promise<string> {
    if (!projectPath.endsWith(PROJECT_EXTENSION) || !window.electronAPI?.fileExists) {
      return projectPath
    }

    const packageFilePath = buildProjectFilePath(projectPath)
    const packageExists = await window.electronAPI.fileExists(packageFilePath)
    return packageExists ? packageFilePath : projectPath
  }

  private static async readProjectFromSource(source: { path: string; embeddedProject?: unknown }, onProgress?: (message: string) => void): Promise<Project> {
    if (source.embeddedProject) {
      return source.embeddedProject as Project
    }

    const projectPath = source.path
    if (!projectPath) {
      throw new Error('Missing project path')
    }

    onProgress?.('Loading project file...')

    // Prefer filesystem when running in Electron.
    if (window.electronAPI?.readLocalFile) {
      const resolvedPath = await this.resolveProjectFilePath(projectPath)
      const res = await window.electronAPI.readLocalFile(resolvedPath)
      if (!res?.success || !res.data) {
        throw new Error('Failed to read project file')
      }
      const json = new TextDecoder().decode(res.data)
      return JSON.parse(json)
    }

    // Fallback to localStorage-based cache (web/preview environments).
    const stored = ProjectStorage.getProject(projectPath)
    if (!stored) throw new Error('Project not found')
    return typeof stored === 'string' ? JSON.parse(stored) : (stored as Project)
  }

  private static async loadAndPrepareProject(
    source: { path: string; embeddedProject?: unknown },
    options: LoadProjectOptions = {}
  ): Promise<Project> {
    const { onProgress, awaitPlaybackPreparation = false } = options

    let project = await this.readProjectFromSource(source, onProgress)
    if (!project) {
      throw new Error('This recording does not have an associated project. Please try loading a different project file.')
    }

    // Deep clone to allow mutations safely.
    project = structuredClone(project)

    // Canonicalize project.filePath so everything else (relative path resolution, saving) is consistent.
    const resolvedProjectPath = await this.resolveProjectFilePath(source.path)
    const projectRoot = await resolveProjectRoot(resolvedProjectPath, window.electronAPI?.fileExists)
    project.filePath = projectRoot || source.path

    // Apply migrations.
    onProgress?.('Applying migrations...')
    project = await this.migrateProject(project)

    const basePath = project.filePath || projectRoot || source.path
    const pendingProxyTasks: Promise<void>[] = []

    // Resolve paths, validate files, repair manifests, and repair properties for each recording.
    for (let i = 0; i < project.recordings.length; i++) {
      const rec = project.recordings[i]
      onProgress?.(`Setting up video ${i + 1} of ${project.recordings.length}...`)

      // Resolve folderPath.
      if (rec.folderPath && !rec.folderPath.startsWith('/')) {
        rec.folderPath = `${basePath}/${rec.folderPath}`
      }

      // Resolve filePath.
      if (rec.filePath && !rec.filePath.startsWith('/')) {
        rec.filePath = `${basePath}/${rec.filePath}`
      }

      // Resolve imageSource.imagePath if present (for image clips).
      if (rec.imageSource?.imagePath && !rec.imageSource.imagePath.startsWith('/') && !rec.imageSource.imagePath.startsWith('data:')) {
        rec.imageSource.imagePath = `${basePath}/${rec.imageSource.imagePath}`
      }

      // For image clips, keep filePath in sync with the resolved image path.
      if (rec.sourceType === 'image' && rec.imageSource?.imagePath && rec.imageSource.imagePath.startsWith('/')) {
        rec.filePath = rec.imageSource.imagePath
      }

      // Validate folder exists (when available).
      if (rec.folderPath && window.electronAPI?.fileExists) {
        const folderExists = await window.electronAPI.fileExists(rec.folderPath)
        if (!folderExists) {
          throw new InvalidPathError(`[ProjectIO] Recording folder not found: ${rec.folderPath}`)
        }
      }

      // Repair metadata manifest before any metadata load attempts.
      await this.repairMetadataManifest(rec)

      // Validate file exists before loading.
      if (rec.filePath && window.electronAPI?.fileExists) {
        const exists = await window.electronAPI.fileExists(rec.filePath)
        if (!exists) {
          rec.isMissing = true
          throw new MissingVideoError(`[ProjectIO] Recording file missing: ${rec.filePath} (sourceType: ${rec.sourceType})`)
        }
      }

      // Validate and fix recording properties if needed.
      if (rec.filePath && rec.sourceType !== 'image') {
        await this.validateAndFixRecording(rec, project, onProgress)
      }

      // ASYNC PROXY GENERATION: Don't block project load unless requested.
      if (rec.sourceType !== 'image') {
        const proxyPromise = ProxyService.ensureProxiesForRecording(rec, {
          onProgress,
          background: !awaitPlaybackPreparation,
          promptUser: true
        })

        if (awaitPlaybackPreparation) {
          pendingProxyTasks.push(proxyPromise)
        }
      }
    }

    // Load assets (metadata chunks and videos).
    await this.loadProjectAssets(project, onProgress)

    // Initialize effects array using EffectStore.
    EffectStore.ensureArray(project)

    // DEDUPLICATE CROP EFFECTS: Fix for multiple overlapping crop effects causing glitches.
    const timelineEffects = project.timeline.effects || []
    if (timelineEffects.length > 0) {
      const otherEffects: typeof project.timeline.effects = []

      // Sort by modification time (or ID timestamp if available) to keep the newest one
      // IDs are like 'crop-UUID-TIMESTAMP'
      const getTimestampFromId = (id: string) => {
        const parts = id.split('-')
        const result = parseInt(parts[parts.length - 1])
        return isNaN(result) ? 0 : result
      }

      // Extract Clip ID from Effect ID (crop-CLIPID-TIMESTAMP)
      const getClipIdFromEffectId = (id: string) => {
        const lastDash = id.lastIndexOf('-')
        if (lastDash === -1) return 'unknown'
        if (!id.startsWith('crop-')) return 'unknown'
        return id.substring(5, lastDash)
      }

      const cropEffects = timelineEffects.filter(e => e.type === 'crop')
      const nonCropEffects = timelineEffects.filter(e => e.type !== 'crop')

      if (cropEffects.length > 1) {
        // Group by clip ID; fallback to time-range for legacy IDs.
        const groups = new Map<string, typeof timelineEffects>()

        cropEffects.forEach(e => {
          let key = getClipIdFromEffectId(e.id)
          if (key === 'unknown') {
            key = `time-${e.startTime}-${e.endTime}`
          }
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(e)
        })

        groups.forEach((group) => {
          if (group.length > 1) {
            group.sort((a, b) => getTimestampFromId(b.id) - getTimestampFromId(a.id))
            otherEffects.push(group[0])
          } else {
            otherEffects.push(group[0])
          }
        })

        project.timeline.effects = [...nonCropEffects, ...otherEffects]
      }
    }

    // Ensure global background/cursor effects exist.
    const { EffectInitialization } = await import('@/features/effects/core/initialization')
    EffectInitialization.ensureGlobalEffects(project)

    if (awaitPlaybackPreparation && pendingProxyTasks.length > 0) {
      // NOTE: We intentionally avoid auto-generating preview proxies here unless the user opted in via UI.
      // `ensureProxiesForRecording` will still populate cached proxy URLs when available.
      await Promise.all(pendingProxyTasks)
    }

    return project
  }

  /**
   * Load a project from filesystem or storage
   */
  static async loadProject(projectPath: string, options?: LoadProjectOptions): Promise<Project>
  static async loadProject(recording: { path: string; project?: any }, options?: LoadProjectOptions): Promise<Project>
  static async loadProject(
    source: string | { path: string; project?: any },
    options: LoadProjectOptions = {}
  ): Promise<Project> {
    if (typeof source === 'string') {
      return this.loadAndPrepareProject({ path: source }, options)
    }
    return this.loadAndPrepareProject({ path: source.path, embeddedProject: source.project }, options)
  }

  /**
   * Load a project from a recording reference (from library)
   * Handles path resolution, file validation, video property repair, and asset loading
   * 
   * This is the main entry point for workspace-manager when opening a project
   */
  /** @deprecated Prefer `ProjectIOService.loadProject(recording, options)` */
  static async loadProjectFromRecording(
    recording: { path: string; project?: any },
    options: LoadProjectOptions = {}
  ): Promise<Project> {
    return this.loadProject(recording, options)
  }


  /**
   * Validate and fix recording properties (duration, dimensions)
   * Uses video-metadata for detection
   */
  private static async validateAndFixRecording(
    recording: Recording,
    project: Project,
    onProgress?: (message: string) => void
  ): Promise<void> {
    // Check if we need to detect/repair properties
    const needsDurationFix = !recording.duration || recording.duration <= 0 || !isFinite(recording.duration)
    const needsDimensionsFix = !recording.width || !recording.height

    // Always check for metadata manifest repair (lightweight file listing)
    await this.repairMetadataManifest(recording)

    if (needsDurationFix || needsDimensionsFix) {
      onProgress?.('Detecting video properties...')

      try {
        // Use blob manager to load the video safely with high priority
        const blobUrl = await globalBlobManager.loadVideo(recording.id, recording.filePath)

        if (blobUrl) {
          const metadata = await getVideoMetadata(blobUrl)

          if (needsDurationFix && metadata.duration > 0 && isFinite(metadata.duration)) {
            recording.duration = metadata.duration
          }

          if (needsDimensionsFix) {
            recording.width = metadata.width
            recording.height = metadata.height
          }

          // Fix clip durations if recording duration was updated
          if (recording.duration && recording.duration > 0) {
            for (const track of project.timeline.tracks) {
              for (const clip of track.clips) {
                if (clip.recordingId === recording.id) {
                  clip.duration = Math.min(clip.duration, recording.duration)
                  // Prevent NaN corruption: only update sourceOut if it exists and is valid
                  if (clip.sourceOut != null && isFinite(clip.sourceOut)) {
                    clip.sourceOut = Math.min(clip.sourceOut, recording.duration)
                  } else {
                    // Initialize sourceOut if missing or invalid
                    clip.sourceOut = recording.duration
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to detect video properties:', error)
      }
    }
  }

  /**
   * Save a project to storage
   */
  static async saveProject(project: Project): Promise<string | null> {
    // Deep copy to avoid mutating frozen Immer objects.
    // All effects now live in timeline.effects (the SSOT)
    // NOTE: Proxy URLs are in zustand store, not on recordings, so no need to strip them
    const projectToSave: Project = this.relativizePaths({
      ...project,
      recordings: project.recordings.map(r => {
        // Destructure to omit deprecated effects array from saved project
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { effects, ...rest } = r as any
        return rest
      }),
      timeline: {
        ...project.timeline,
        effects: EffectStore.getAll(project)
      },
      modifiedAt: new Date().toISOString()
    })

    return ProjectStorage.saveProject(projectToSave, projectToSave.filePath)
  }

  /**
   * Helper to make paths relative to project folder for portability
   */
  private static relativizePaths(project: Project): Project {
    if (!project.filePath) return project

    const hasNestedRecording = project.recordings?.some(
      (rec) => typeof rec.folderPath === 'string' && rec.folderPath.startsWith(`${project.filePath}/`)
    )
    const projectDir = hasNestedRecording
      ? project.filePath
      : project.filePath.substring(0, project.filePath.lastIndexOf('/'))

    // Clone to modify
    const relativeProject = { ...project }
    relativeProject.recordings = relativeProject.recordings.map(rec => {
      const r = { ...rec }

      // Relativize folderPath
      if (r.folderPath && r.folderPath.startsWith(projectDir)) {
        // +1 to remove the leading slash: /path/to/project/recording-1 -> recording-1
        r.folderPath = r.folderPath.substring(projectDir.length + 1)
      }

      // Relativize filePath
      if (r.filePath && r.filePath.startsWith(projectDir)) {
        r.filePath = r.filePath.substring(projectDir.length + 1)
      }

      // Relativize imageSource.imagePath for image clips (cursor return freeze frames, etc.)
      if (r.imageSource?.imagePath && r.imageSource.imagePath.startsWith(projectDir)) {
        r.imageSource = { ...r.imageSource, imagePath: r.imageSource.imagePath.substring(projectDir.length + 1) }
      }

      return r
    })

    return relativeProject
  }

  /**
   * Apply migrations to older project formats
   */
  private static async migrateProject(project: Project): Promise<Project> {
    // Temporary shim for pre-schemaVersion projects created during early dev.
    // Sets schemaVersion to 0 so versioned migrations can run.
    if ((project as any).schemaVersion == null) {
      console.warn('[ProjectIOService] schemaVersion missing; assuming v0 and migrating')
        ; (project as any).schemaVersion = 0
    }

    // Run versioned migrations using MigrationRunner
    const migratedProject = migrationRunner.migrateProject(project)

    return migratedProject
  }

  /**
   * Load project assets (videos and metadata)
   *
   * LAZY LOADING: Metadata is no longer loaded eagerly during project open.
   * Instead, it's loaded on-demand by the useRecordingMetadata hook in Remotion
   * compositions. This prevents multi-GB memory allocation for mouse/click/keyboard events.
   */
  private static async loadProjectAssets(
    project: Project,
    onProgress?: (message: string) => void
  ): Promise<void> {
    // Load assets (eagerly load metadata to ensure SSOT and persistence)
    for (let i = 0; i < project.recordings.length; i++) {
      const recording = project.recordings[i]

      // 1. Try cache first
      const cachedMetadata = ProjectStorage.getMetadata(recording.id)
      if (cachedMetadata) {
        recording.metadata = cachedMetadata
      }

      // 2. If not in cache but we have chunks (repaired or original), LOAD IT.
      // This fixes the issue where lazy loading misses the data or fails to persist it.
      if (!recording.metadata && recording.folderPath && recording.metadataChunks) {
        try {
          onProgress?.(`Loading metadata for recording ${i + 1}...`)
          const meta = await ProjectStorage.loadMetadataChunks(recording.folderPath, recording.metadataChunks)

          // Add capture area if available on recording
          if (recording.captureArea && !meta.captureArea) {
            meta.captureArea = JSON.parse(JSON.stringify(recording.captureArea))
          }

          recording.metadata = meta
          ProjectStorage.setMetadata(recording.id, meta)
        } catch (e) {
          console.warn(`[ProjectIO] Failed to eager load metadata for ${recording.id}:`, e)
        }
      }

      // NOTE: recording.effects is deprecated - all effects live in timeline.effects

      // PRE-COMPUTE EFFECT CACHES: Warm up expensive caches during load
      // This eliminates the lag when first rendering cursor/camera effects
      if (recording.metadata) {
        const mouseEvents = (recording.metadata as any)?.mouseEvents as MouseEvent[] | undefined
        if (mouseEvents && mouseEvents.length > 0) {
          onProgress?.(`Pre-computing effects for recording ${i + 1}...`)

          // Get cursor settings from timeline effects (the SSOT) or use defaults
          const timelineEffects = EffectStore.getAll(project)
          const cursorEffect = timelineEffects.find(e => e.type === 'cursor')
          const cursorData = (cursorEffect?.data as CursorEffectData) ?? DEFAULT_CURSOR_DATA

          // Pre-compute cursor smoothing cache (first 5 seconds at 30fps)
          precomputeCursorSmoothingCache(mouseEvents, cursorData, 5000, 30)

          // Pre-compute camera caches not needed for velocity-based system
          // const { width: sourceWidth, height: sourceHeight } = getSourceDimensionsStatic(recording, recording.metadata)
          // precomputeCameraCaches(mouseEvents, timelineEffects, sourceWidth, sourceHeight)
        }
      }
    }

    // Load videos with folder path support
    for (let i = 0; i < project.recordings.length; i++) {
      const recording = project.recordings[i]
      if (recording.filePath && !recording.isMissing) {
        onProgress?.(`Loading video ${i + 1} of ${project.recordings.length}...`)
        await globalBlobManager.loadVideos({
          id: recording.id,
          filePath: recording.filePath,
          folderPath: recording.folderPath,
          // Don't pass metadata - it will be loaded lazily when needed
        })
      }
    }
  }

  /**
   * Export a project to a file
   */
  static async exportProject(project: Project, exportPath: string): Promise<void> {
    if (!window.electronAPI?.saveFile) {
      throw new Error('Export not supported in this environment')
    }

    const projectData = JSON.stringify(project, null, 2)
    const encoder = new TextEncoder()
    const data = encoder.encode(projectData)

    const res = await window.electronAPI.saveFile(data, exportPath)
    if (!res?.success) {
      throw new Error('Failed to export project file')
    }
  }

  /**
   * Create a new empty project
   */
  static createNewProject(name: string): Project {
    return ProjectStorage.createProject(name)
  }

  /**
   * Validate project structure
   */
  static validateProject(project: any): project is Project {
    if (!project || typeof project !== 'object') return false
    if (!project.id || !project.name) return false
    if (!project.timeline || !Array.isArray(project.timeline.tracks)) return false
    if (!Array.isArray(project.recordings)) return false

    // Basic structure is valid
    return true
  }

  /**
   * Clean up project resources
   */
  static cleanupProjectResources(): void {
    // Clean up blob resources on next tick (after unmount)
    setTimeout(() => {
      globalBlobManager.cleanupByType('video')
      globalBlobManager.cleanupByType('export')
      globalBlobManager.cleanupByType('thumbnail')
    }, 0)
  }

  /**
   * Get project metadata without loading assets
   */
  static async getProjectMetadata(projectPath: string): Promise<{
    id: string
    name: string
    createdAt: string
    modifiedAt: string
    duration: number
    recordingCount: number
  }> {
    const project = await this.loadProject(projectPath)

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      modifiedAt: project.modifiedAt,
      duration: project.timeline.duration,
      recordingCount: project.recordings.length
    }
  }

  /**
   * Repair metadata manifest by scanning recording folder
   * This fixes issues where metadataChunks are missing or out of sync
   */
  private static async repairMetadataManifest(recording: Recording): Promise<void> {
    if (!recording.folderPath || !window.electronAPI?.listMetadataFiles) return

    try {
      const res = await window.electronAPI.listMetadataFiles(recording.folderPath)
      if (res.success && res.files && res.files.length > 0) {
        const manifest = {
          mouse: [] as string[],
          keyboard: [] as string[],
          click: [] as string[],
          scroll: [] as string[],
          screen: [] as string[]
        }

        // Simple numeric sort
        const sorted = res.files.sort((a, b) => {
          const getNum = (s: string) => parseInt(s.match(/\d+/)?.[0] || '0')
          return getNum(a) - getNum(b)
        })

        for (const file of sorted) {
          if (file.startsWith('mouse-')) manifest.mouse.push(file)
          else if (file.startsWith('keyboard-')) manifest.keyboard.push(file)
          else if (file.startsWith('click-')) manifest.click.push(file)
          else if (file.startsWith('scroll-')) manifest.scroll.push(file)
          else if (file.startsWith('screen-')) manifest.screen.push(file)
        }

        // Initialize if missing
        if (!recording.metadataChunks) {
          recording.metadataChunks = manifest
        } else {
          // Merge/Repair: If found files that are not in manifest, add them
          if (manifest.keyboard.length > 0 && (!recording.metadataChunks.keyboard || recording.metadataChunks.keyboard.length === 0)) {
            recording.metadataChunks.keyboard = manifest.keyboard
          }
          if (manifest.mouse.length > 0 && (!recording.metadataChunks.mouse || recording.metadataChunks.mouse.length === 0)) {
            recording.metadataChunks.mouse = manifest.mouse
          }
          // We can extend this to other types if needed, but keyboard is the reported issue
        }
      }
    } catch (e) {
      console.warn('[ProjectIO] Failed to repair metadata manifest:', e)
    }
  }
}
