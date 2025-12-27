import type { Project, Recording, CursorEffectData, MouseEvent } from '@/types/project'
import { RecordingStorage } from './recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { migrationRunner } from '@/lib/migrations'
import { getVideoMetadata } from '@/lib/utils/video-metadata'
import { PROJECT_EXTENSION, PROJECT_PACKAGE_FILE, buildProjectFilePath } from '@/lib/storage/recording-storage'
import { precomputeCursorSmoothingCache } from '@/lib/effects/utils/cursor-calculator'
import { precomputeCameraCaches } from '@/lib/effects/utils/camera-calculator'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import { EffectStore } from '@/lib/core/effects'
import { InvalidPathError, MissingVideoError } from '@/lib/errors'

/**
 * Options for loadProjectFromRecording
 */
export interface LoadProjectOptions {
  onProgress?: (message: string) => void
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

  private static getProjectRootFromPaths(projectPath: string, projectFilePath: string): string {
    if (projectFilePath.endsWith(`/${PROJECT_PACKAGE_FILE}`)) {
      if (/\/project-[^/]+\.bokeh$/.test(projectPath)) {
        const idx = projectPath.lastIndexOf('/')
        return idx >= 0 ? projectPath.substring(0, idx) : projectPath
      }
      return projectPath
    }
    const idx = projectPath.lastIndexOf('/')
    return idx >= 0 ? projectPath.substring(0, idx) : ''
  }

  /**
   * Load a project from filesystem or storage
   */
  static async loadProject(projectPath: string): Promise<Project> {
    let project: Project

    // Check if it's a file path or storage key
    const isProject = projectPath.endsWith(PROJECT_EXTENSION)

    if (projectPath && (isProject || projectPath.includes('/'))) {
      // Load from filesystem
      if (window.electronAPI?.readLocalFile) {
        const resolvedPath = await this.resolveProjectFilePath(projectPath)
        const res = await window.electronAPI.readLocalFile(resolvedPath)
        if (res?.success && res.data) {
          const json = new TextDecoder().decode(res.data)
          project = JSON.parse(json)
        } else {
          throw new Error('Failed to read project file')
        }
      } else {
        // Fallback to storage
        const data = RecordingStorage.getProject(projectPath)
        if (!data) throw new Error('Project not found')
        project = JSON.parse(data)
      }
    } else {
      // Load from storage
      const data = RecordingStorage.getProject(projectPath)
      if (!data) throw new Error('Project not found')
      project = JSON.parse(data)
    }

    project.filePath = projectPath

    // Apply migrations
    project = await this.migrateProject(project)

    // Load metadata and videos
    await this.loadProjectAssets(project)

    return project
  }

  /**
   * Load a project from a recording reference (from library)
   * Handles path resolution, file validation, video property repair, and asset loading
   * 
   * This is the main entry point for workspace-manager when opening a project
   */
  static async loadProjectFromRecording(
    recording: { path: string; project?: any },
    options: LoadProjectOptions = {}
  ): Promise<Project> {
    const { onProgress } = options
    let project = recording.project as Project | undefined

    // Load project from disk if not already loaded (library only passes lightweight projectInfo)
    if (!project && recording.path) {
      onProgress?.('Loading project file...')
      try {
        if (window.electronAPI?.readLocalFile) {
          const resolvedPath = await this.resolveProjectFilePath(recording.path)
          const result = await window.electronAPI.readLocalFile(resolvedPath)
          if (result?.success && result.data) {
            const projectData = new TextDecoder().decode(result.data as ArrayBuffer)
            project = JSON.parse(projectData)
          }
        }
      } catch (e) {
        console.error('Failed to load project from disk:', e)
        throw new Error('Failed to load project file')
      }
    }

    if (!project) {
      throw new Error('This recording does not have an associated project. Please try loading a different project file.')
    }

    // Deep clone the project to allow mutations (JSON objects are frozen/read-only)
    project = structuredClone(project)
    project.filePath = recording.path

    // Clear stale temp proxy URLs that won't exist after restarts
    // The proxy service will regenerate them fresh during load
    for (const rec of project.recordings) {
      delete (rec as any).previewProxyUrl
      delete (rec as any).glowProxyUrl
    }

    // Apply migrations
    onProgress?.('Applying migrations...')
    project = await this.migrateProject(project)

    // Get project directory for resolving relative paths
    const resolvedProjectPath = await this.resolveProjectFilePath(recording.path)
    const projectDir = this.getProjectRootFromPaths(recording.path, resolvedProjectPath)

    // Resolve paths, validate files, and repair properties for each recording
    for (let i = 0; i < project.recordings.length; i++) {
      const rec = project.recordings[i]
      onProgress?.(`Setting up video ${i + 1} of ${project.recordings.length}...`)

      // 1. Resolve folderPath FIRST
      // This is critical because video path resolution depends on folderPath
      if (rec.folderPath) {
        let resolvedFolderPath = rec.folderPath
        if (!resolvedFolderPath.startsWith('/')) {
          resolvedFolderPath = `${projectDir}/${resolvedFolderPath}`
        }

        if (window.electronAPI?.fileExists) {
          const folderExists = await window.electronAPI.fileExists(resolvedFolderPath)
          if (!folderExists) {
            throw new InvalidPathError(`[ProjectIO] Recording folder not found: ${resolvedFolderPath}`)
          }
        }

        rec.folderPath = resolvedFolderPath
      }

      if (rec.filePath) {
        // Resolve video path relative to project file location
        let videoPath = rec.filePath
        if (!videoPath.startsWith('/')) {
          videoPath = `${projectDir}/${videoPath}`
        }

        rec.filePath = videoPath

        // Also resolve imageSource.imagePath if present (for image clips like cursor return freeze frames)
        if (rec.imageSource?.imagePath && !rec.imageSource.imagePath.startsWith('/') && !rec.imageSource.imagePath.startsWith('data:')) {
          const resolvedImagePath = `${projectDir}/${rec.imageSource.imagePath}`
          console.log(`[ProjectIO] 🖼️ Resolving imageSource.imagePath: ${rec.imageSource.imagePath} -> ${resolvedImagePath}`)
          rec.imageSource.imagePath = resolvedImagePath
        }

        // For image clips, also sync filePath to resolved imageSource path
        if (rec.sourceType === 'image' && rec.imageSource?.imagePath && rec.imageSource.imagePath.startsWith('/')) {
          console.log(`[ProjectIO] 🖼️ Syncing filePath for image clip: ${rec.filePath} -> ${rec.imageSource.imagePath}`)
          rec.filePath = rec.imageSource.imagePath
        }

        // Validate file exists before loading
        if (window.electronAPI?.fileExists) {
          const exists = await window.electronAPI.fileExists(rec.filePath)
          if (!exists) {
            rec.isMissing = true
            throw new MissingVideoError(`[ProjectIO] Recording file missing: ${rec.filePath} (sourceType: ${rec.sourceType})`)
          }
        }

        // Validate and fix recording properties if needed
        await this.validateAndFixRecording(rec, project, onProgress)

        // ASYNC PROXY GENERATION: Don't block project load
        // Video will play from original source while proxy generates in background
        // Once proxy is ready, future loads will use it instantly
        // SKIP for image clips - static images don't need video proxy conversion
        if (rec.sourceType !== 'image') {
          void this.ensurePreviewProxy(rec, onProgress)
          void this.ensureGlowProxy(rec)
        }
      }
    }

    // Load assets (metadata chunks and videos)
    await this.loadProjectAssets(project, onProgress)

    // Initialize effects array using EffectStore
    EffectStore.ensureArray(project)

    // Ensure global background/cursor effects exist
    const { EffectsFactory } = await import('../effects/effects-factory')

    // DEDUPLICATE CROP EFFECTS: Fix for multiple overlapping crop effects causing glitches
    const timelineEffects = project.timeline.effects || []
    if (timelineEffects.length > 0) {
      const otherEffects: typeof project.timeline.effects = [];

      // Sort by modification time (or ID timestamp if available) to keep the newest one
      // IDs are like 'crop-UUID-TIMESTAMP'
      const getTimestampFromId = (id: string) => {
        const parts = id.split('-');
        const result = parseInt(parts[parts.length - 1]);
        return isNaN(result) ? 0 : result;
      };

      // Extract Clip ID from Effect ID (crop-CLIPID-TIMESTAMP)
      const getClipIdFromEffectId = (id: string) => {
        const lastDash = id.lastIndexOf('-');
        if (lastDash === -1) return 'unknown';
        // prefix 'crop-' is 5 chars
        if (!id.startsWith('crop-')) return 'unknown';
        return id.substring(5, lastDash);
      };

      const cropEffects = timelineEffects.filter(e => e.type === 'crop');
      const nonCropEffects = timelineEffects.filter(e => e.type !== 'crop');

      if (cropEffects.length > 1) {
        // Group by CLIP ID to ensure we only deduplicate effects targeting the SAME clip
        const groups = new Map<string, typeof timelineEffects>();

        cropEffects.forEach(e => {
          // Use Clip ID as the grouping key. 
          // If we can't parse it, fallback to time-range (risky, but handles legacy)
          let key = getClipIdFromEffectId(e.id);
          if (key === 'unknown') {
            key = `time-${e.startTime}-${e.endTime}`;
          }
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(e);
        });

        groups.forEach((group, _key) => {
          if (group.length > 1) {
            group.sort((a, b) => getTimestampFromId(b.id) - getTimestampFromId(a.id)); // Newest first
            otherEffects.push(group[0]); // Keep newest
          } else {
            otherEffects.push(group[0]);
          }
        });

        project.timeline.effects = [...nonCropEffects, ...otherEffects];
      }
    }

    EffectsFactory.ensureGlobalEffects(project)

    return project
  }

  /**
   * Generate a preview proxy for large source videos
   * This reduces memory usage by decoding 1080p instead of 5K+ during preview
   */
  private static async ensurePreviewProxy(
    recording: Recording,
    onProgress?: (message: string) => void
  ): Promise<void> {

    if (!recording.filePath || !window.electronAPI?.checkPreviewProxy) {
      return
    }

    try {
      // First check if proxy exists or is needed
      const checkResult = await window.electronAPI.checkPreviewProxy(recording.filePath)

      if (checkResult.existingProxyUrl) {
        // Use existing proxy
        try {
          (recording as any).previewProxyUrl = checkResult.existingProxyUrl
        } catch (e) {
          // If object is frozen (loaded into store), update via store action
          import('../../stores/project-store').then(({ useProjectStore }) => {
            useProjectStore.getState().updateProjectData(project => {
              const r = project.recordings.find(rec => rec.id === recording.id)
              if (r) (r as any).previewProxyUrl = checkResult.existingProxyUrl
              return project
            })
          })
        }
        console.log(`[ProjectIO] ✅ Using existing proxy for ${recording.id}:`, checkResult.existingProxyUrl)
        return
      }

      if (!checkResult.needsProxy) {
        // Fallback: ffprobe can fail; use known recording dimensions if available.
        const needsProxyByMetadata =
          typeof recording.width === 'number' &&
          recording.width > 2560;
        if (!needsProxyByMetadata) {
          // Video is small enough, no proxy needed
          console.log(`[ProjectIO] ⏭️ Video doesn't need proxy (below 1440p threshold)`)
          return
        }
        console.log(`[ProjectIO] ⚠️ Proxy check skipped, but metadata suggests large source. Forcing proxy generation.`)
      }

      // Generate proxy
      onProgress?.('Generating preview for faster playback...')
      console.log(`[ProjectIO] 🔄 Generating preview for ${recording.id}...`)

      if (window.electronAPI.generatePreviewProxy) {
        const result = await window.electronAPI.generatePreviewProxy(recording.filePath)

        if (result.success && result.proxyUrl) {
          try {
            (recording as any).previewProxyUrl = result.proxyUrl
          } catch (e) {
            import('../../stores/project-store').then(({ useProjectStore }) => {
              useProjectStore.getState().updateProjectData(project => {
                const r = project.recordings.find(rec => rec.id === recording.id)
                if (r) (r as any).previewProxyUrl = result.proxyUrl
                return project
              })
            })
          }
          console.log(`[ProjectIO] ✅ Preview proxy ready for ${recording.id}:`, result.proxyUrl)
        } else if (result.skipped) {
          console.log(`[ProjectIO] ⏭️ Proxy skipped: ${result.reason}`)
        } else if (result.error) {
          console.warn(`[ProjectIO] ❌ Proxy generation failed: ${result.error}`)
        }
      }
    } catch (error) {
      console.warn('[ProjectIO] ❌ Failed to check/generate preview proxy:', error)
      // Don't fail the load - just use original video
    }
  }

  /**
   * Generate a glow proxy for the ambient glow player
   * This keeps glow decoding ultra-lightweight regardless of source size
   */
  private static async ensureGlowProxy(recording: Recording): Promise<void> {
    if (!recording.filePath || !window.electronAPI?.generateGlowProxy) {
      return
    }

    try {
      const result = await window.electronAPI.generateGlowProxy(recording.filePath)
      if (result.success && result.proxyUrl) {
        try {
          (recording as any).glowProxyUrl = result.proxyUrl
        } catch (e) {
          import('../../stores/project-store').then(({ useProjectStore }) => {
            useProjectStore.getState().updateProjectData(project => {
              const r = project.recordings.find(rec => rec.id === recording.id)
              if (r) (r as any).glowProxyUrl = result.proxyUrl
              return project
            })
          })
        }
        console.log(`[ProjectIO] 🌟 Glow proxy ready for ${recording.id}:`, result.proxyUrl)
      } else if (result.skipped) {
        console.log(`[ProjectIO] ⏭️ Glow proxy skipped: ${result.reason}`)
      } else if (result.error) {
        console.warn(`[ProjectIO] ❌ Glow proxy failed: ${result.error}`)
      }
    } catch (error) {
      console.warn('[ProjectIO] ❌ Failed to generate glow proxy:', error)
    }
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
    // Strip temp proxy URLs (they live in /tmp and won't exist after restarts)
    const projectToSave: Project = this.relativizePaths({
      ...project,
      recordings: project.recordings.map(r => {
        // Destructure to omit temp proxy URLs and deprecated effects array from saved project
        const { previewProxyUrl, glowProxyUrl, effects, ...rest } = r as any
        return rest
      }),
      timeline: {
        ...project.timeline,
        effects: EffectStore.getAll(project)
      },
      modifiedAt: new Date().toISOString()
    })

    return RecordingStorage.saveProject(projectToSave, projectToSave.filePath)
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
    let migratedProject = migrationRunner.migrateProject(project)

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
    const { EffectsFactory } = await import('../effects/effects-factory')

    // Load assets (eagerly load metadata to ensure SSOT and persistence)
    for (let i = 0; i < project.recordings.length; i++) {
      const recording = project.recordings[i]

      // 1. Try cache first
      const cachedMetadata = RecordingStorage.getMetadata(recording.id)
      if (cachedMetadata) {
        recording.metadata = cachedMetadata
      }

      // 2. If not in cache but we have chunks (repaired or original), LOAD IT.
      // This fixes the issue where lazy loading misses the data or fails to persist it.
      if (!recording.metadata && recording.folderPath && recording.metadataChunks) {
        try {
          onProgress?.(`Loading metadata for recording ${i + 1}...`)
          const meta = await RecordingStorage.loadMetadataChunks(recording.folderPath, recording.metadataChunks)

          // Add capture area if available on recording
          if (recording.captureArea && !meta.captureArea) {
            meta.captureArea = JSON.parse(JSON.stringify(recording.captureArea))
          }

          recording.metadata = meta
          RecordingStorage.setMetadata(recording.id, meta)
          console.log(`[ProjectIO] eager loaded metadata for ${recording.id}`)
        } catch (e) {
          console.warn(`[ProjectIO] Failed to eager load metadata for ${recording.id}:`, e)
        }
      }

      // NOTE: recording.effects is deprecated - all effects live in timeline.effects
      // The call to createInitialEffectsForRecording is a no-op now, kept for API compatibility
      if (recording.metadata) {
        EffectsFactory.createInitialEffectsForRecording(recording)
      }

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

          // Pre-compute camera motion clusters
          const videoWidth = recording.width ?? 1920
          const videoHeight = recording.height ?? 1080
          precomputeCameraCaches(mouseEvents, timelineEffects, videoWidth, videoHeight)
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
    return RecordingStorage.createProject(name)
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
          console.log('[ProjectIO] 🔧 Reconstructed missing metadata manifest:', manifest)
        } else {
          // Merge/Repair: If found files that are not in manifest, add them
          let repaired = false
          if (manifest.keyboard.length > 0 && (!recording.metadataChunks.keyboard || recording.metadataChunks.keyboard.length === 0)) {
            recording.metadataChunks.keyboard = manifest.keyboard
            repaired = true
          }
          if (manifest.mouse.length > 0 && (!recording.metadataChunks.mouse || recording.metadataChunks.mouse.length === 0)) {
            recording.metadataChunks.mouse = manifest.mouse
            repaired = true
          }
          // We can extend this to other types if needed, but keyboard is the reported issue

          if (repaired) {
            console.log('[ProjectIO] 🔧 Repaired metadata manifest (added missing chunks):', recording.metadataChunks)
          }
        }
      }
    } catch (e) {
      console.warn('[ProjectIO] Failed to repair metadata manifest:', e)
    }
  }
}
