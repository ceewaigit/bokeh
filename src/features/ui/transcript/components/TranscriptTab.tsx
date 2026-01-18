import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'
import { useProjectStore } from '@/features/core/stores/project-store'
import { sourceToTimeline } from '@/features/ui/timeline/time/time-space-converter'
import {
  getRecordingDuration,
  getTranscriptionStatus,
  getClipSourceIn,
  getClipSourceOut
} from '@/features/ui/transcript/utils/transcript-accessors'
import { useCommandExecutor } from '@/features/core/commands/hooks/use-command-executor'
import { TranscriptEditCommand } from '@/features/ui/transcript/commands/TranscriptEditCommand'
import { TranscriptRestoreCommand } from '@/features/ui/transcript/commands/TranscriptRestoreCommand'
import { EffectStore } from '@/features/effects/core/effects-store'
import { EffectType, TrackType, TranscriptionStatus } from '@/types/project'
import type { Clip, Project, Recording, RecordingMetadata, SubtitleEffect, SubtitleEffectData } from '@/types/project'
import { OverlayAnchor } from '@/types/overlays'
import { AddEffectCommand, RemoveEffectCommand, UpdateEffectCommand } from '@/features/core/commands'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TranscriptionModelList, TranscriptionProgress, TranscriptionStatusUpdate } from '@/types/transcription'
import { ProjectStorage } from '@/features/core/storage/project-storage'
import { TimelineDataService } from '@/features/ui/timeline/timeline-data-service'
import { UnifiedTranscriptView, type UnifiedTranscriptSection, type UnifiedTranscriptWord } from './UnifiedTranscriptView'
import { useShallow } from 'zustand/react/shallow'
import { OverlayPositionControl } from '@/features/rendering/overlays/components/overlay-position-control'
import { OverlayStyleControl } from '@/features/rendering/overlays/components/overlay-style-control'
import { useOverlayState } from '@/features/rendering/overlays/hooks/use-overlay-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { ColorPickerPopover } from '@/components/ui/color-picker'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'
import { SubtitleHighlightStyle } from '@/types/project'

const createEmptyMetadata = (): RecordingMetadata => ({
  mouseEvents: [],
  keyboardEvents: [],
  clickEvents: [],
  scrollEvents: [],
  screenEvents: [],
})

function normalizeProgress(value?: number): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined
  const normalized = value > 1 ? value : value * 100
  return Math.max(0, Math.min(100, Math.round(normalized)))
}



const DEFAULT_SUBTITLE_STYLE: Omit<SubtitleEffectData, 'recordingId'> = {
  anchor: OverlayAnchor.BottomCenter,
  offsetX: 0,
  offsetY: 0,
  priority: 100,
  fontSize: 32,
  fontFamily: 'SF Pro Display, system-ui, -apple-system, sans-serif',
  textColor: '#ffffff',
  highlightColor: '#FFD166',
  backgroundColor: '#000000',
  backgroundOpacity: 0.4,
  wordsPerLine: 8,
  lineHeight: Math.round(32 * 1.3),
  maxWidth: 80,
  highlightStyle: 'color',
  transitionMs: 140,
  padding: 2,
  borderRadius: 6
}

const createSubtitleEffect = (recording: Recording, project: Project): SubtitleEffect => {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `subtitle-${Date.now()}`

  const data: SubtitleEffectData = {
    recordingId: recording.id,
    ...DEFAULT_SUBTITLE_STYLE
  }

  return {
    id,
    type: EffectType.Subtitle,
    startTime: 0,
    endTime: Math.max(project.timeline.duration, getRecordingDuration(recording)),
    enabled: true,
    data
  }
}

export function TranscriptTab() {
  const { project, currentTime, seek, updateProjectData } = useProjectStore(useShallow((s) => ({
    project: s.currentProject,
    currentTime: s.currentTime,
    seek: s.seek,
    updateProjectData: s.updateProjectData
  })))
  const executorRef = useCommandExecutor()

  const [modelList, setModelList] = useState<TranscriptionModelList | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [downloadProgress, setDownloadProgress] = useState<number | undefined>()
  const [downloadModelName, setDownloadModelName] = useState<string | null>(null)
  const [transcriptionProgressByRecording, setTranscriptionProgressByRecording] = useState<Record<string, TranscriptionProgress>>({})
  const [transcriptionErrors, setTranscriptionErrors] = useState<Record<string, string>>({})
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null)
  const [isInstallingWhisper, setIsInstallingWhisper] = useState(false)
  const [installProgress, setInstallProgress] = useState<number | undefined>()
  const [showDeleted, setShowDeleted] = useState(true)

  const eligibleRecordings = useMemo(() => {
    if (!project) return []
    const eligibleIds = new Set<string>()
    project.timeline.tracks.forEach(track => {
      // Allow only Webcam tracks to be transcribed
      if (track.type !== TrackType.Webcam) return
      track.clips.forEach(clip => eligibleIds.add(clip.recordingId))
    })
    return project.recordings.filter(recording => eligibleIds.has(recording.id))
  }, [project])

  const recordingTrackTypeMap = useMemo(() => {
    const map = new Map<string, TrackType>()
    if (!project) return map
    project.timeline.tracks.forEach(track => {
      if (track.type !== TrackType.Webcam) return
      track.clips.forEach(clip => {
        if (!map.has(clip.recordingId)) {
          map.set(clip.recordingId, track.type)
        }
      })
    })
    return map
  }, [project])

  const recordingLabels = useMemo(() => {
    const map = new Map<string, string>()
    const counts = { audio: 0, webcam: 0, video: 0 }
    eligibleRecordings.forEach(recording => {
      const trackType = recordingTrackTypeMap.get(recording.id)
      if (trackType === TrackType.Webcam) {
        counts.webcam += 1
        map.set(recording.id, `Webcam ${counts.webcam}`)
      } else if (trackType === TrackType.Video) {
        counts.video += 1
        map.set(recording.id, `Video ${counts.video}`)
      } else {
        counts.audio += 1
        map.set(recording.id, `Audio ${counts.audio}`)
      }
    })
    return map
  }, [eligibleRecordings, recordingTrackTypeMap])

  const effects = useMemo(() => {
    if (!project) return []
    return EffectStore.getAll(project)
  }, [project])

  const subtitleEffects = useMemo(() => {
    const map = new Map<string, SubtitleEffect>()
    effects.forEach(effect => {
      if (effect.type !== EffectType.Subtitle) return
      const data = effect.data as SubtitleEffectData
      map.set(data.recordingId, effect as SubtitleEffect)
    })
    return map
  }, [effects])

  /* occupiedAnchors logic removed */

  const sections = useMemo<UnifiedTranscriptSection[]>(() => {
    if (!project) return []

    return eligibleRecordings
      .map(recording => {
        const timelineRange = TimelineDataService.getRecordingTimelineRange(project, recording.id)
        const isCurrent = timelineRange
          ? currentTime >= timelineRange.start && currentTime < timelineRange.end
          : false
        return {
          recording,
          label: recordingLabels.get(recording.id) ?? 'Recording',
          timelineRange,
          transcript: recording.metadata?.transcript ?? null,
          hiddenRegions: TimelineDataService.getHiddenRegionsForRecording(project, recording.id),
          isCurrent,
          transcriptionStatus: recording.metadata?.transcriptionStatus ?? TranscriptionStatus.None,
          transcriptionProgress: transcriptionProgressByRecording[recording.id] ?? null,
          transcriptionError: transcriptionErrors[recording.id] ?? null,
          subtitleEffect: subtitleEffects.get(recording.id) ?? null
        }
      })
      .sort((a, b) => {
        const aStart = a.timelineRange?.start ?? Number.POSITIVE_INFINITY
        const bStart = b.timelineRange?.start ?? Number.POSITIVE_INFINITY
        return aStart - bStart
      })
  }, [eligibleRecordings, project, recordingLabels, transcriptionErrors, transcriptionProgressByRecording, currentTime, subtitleEffects])

  const clipsByRecording = useMemo(() => {
    const map = new Map<string, Clip[]>()
    if (!project) return map
    project.timeline.tracks.forEach(track => {
      if (track.type !== TrackType.Webcam) return
      track.clips.forEach(clip => {
        const existing = map.get(clip.recordingId) ?? []
        existing.push(clip)
        map.set(clip.recordingId, existing)
      })
    })
    map.forEach(clips => clips.sort((a, b) => a.startTime - b.startTime))
    return map
  }, [project])

  const hiddenRegionsByRecording = useMemo(() => {
    const map = new Map<string, ReturnType<typeof TimelineDataService.getHiddenRegionsForRecording>>()
    if (!project) return map
    eligibleRecordings.forEach(recording => {
      map.set(recording.id, TimelineDataService.getHiddenRegionsForRecording(project, recording.id))
    })
    return map
  }, [eligibleRecordings, project])

  const timelineWords = useMemo<UnifiedTranscriptWord[]>(() => {
    if (!project) return []
    const words: UnifiedTranscriptWord[] = []

    eligibleRecordings.forEach(recording => {
      const transcript = recording.metadata?.transcript
      if (!transcript?.words?.length) return
      const clips = clipsByRecording.get(recording.id) ?? []
      if (clips.length === 0) return

      const label = recordingLabels.get(recording.id) ?? 'Recording'


      clips.forEach(clip => {
        const sourceIn = getClipSourceIn(clip)
        const sourceOut = getClipSourceOut(clip)
        transcript.words.forEach(word => {
          if (word.startTime < sourceIn || word.startTime >= sourceOut) return
          const timelineStart = sourceToTimeline(word.startTime, clip)
          const timelineEnd = sourceToTimeline(word.endTime, clip)
          words.push({
            id: `${recording.id}-${clip.id}-${word.id}`,
            recordingId: recording.id,
            clipId: clip.id,
            label,
            sourceWord: word,
            timelineStartTime: timelineStart,
            timelineEndTime: Math.max(timelineStart, timelineEnd)
          })
        })
      })
    })

    return words.sort((a, b) => a.timelineStartTime - b.timelineStartTime)
  }, [clipsByRecording, eligibleRecordings, project, recordingLabels])

  const updateRecordingMetadata = useCallback((
    recordingId: string,
    updater: (metadata: RecordingMetadata, recording: Recording) => void
  ) => {
    updateProjectData(project => {
      const recording = project.recordings.find(r => r.id === recordingId)
      if (!recording) return project
      if (!recording.metadata) {
        recording.metadata = createEmptyMetadata()
      } else if (!recording.metadata.scrollEvents) {
        recording.metadata.scrollEvents = []
      }
      updater(recording.metadata, recording)
      ProjectStorage.setMetadata(recordingId, recording.metadata)
      return project
    })
  }, [updateProjectData])

  useEffect(() => {
    if (!window.electronAPI?.transcription?.listModels) return
    let isMounted = true

    const loadModels = async () => {
      const list = await window.electronAPI!.transcription!.listModels()
      if (!isMounted) return
      setModelList(list)

      let recommended: string | undefined
      try {
        recommended = await window.electronAPI!.transcription!.recommendModel()
      } catch (e) {
        console.error('Failed to get recommended model', e)
      }

      if (!isMounted) return
      // Default to 'medium' (Accurate) for best quality, fallback to first available
      const fallback = list.available.includes('medium') ? 'medium' : list.available[0]
      const resolved = (recommended && list.available.includes(recommended)) ? recommended : fallback
      if (resolved) {
        setSelectedModel(prev => prev || resolved)
      }

      if (window.electronAPI?.transcription?.whisperStatus) {
        const status = await window.electronAPI.transcription.whisperStatus()
        if (!isMounted) return
        setWhisperAvailable(status.available)
      }
    }

    loadModels().catch(() => { })
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!downloadModelName || !window.electronAPI?.transcription?.listModels) return
    let isMounted = true

    const pollInterval = setInterval(async () => {
      if (!isMounted) return
      try {
        const list = await window.electronAPI!.transcription!.listModels()
        if (!isMounted) return
        setModelList(list)
        const downloadedNames = new Set(list.downloaded.map(m => m.name))
        if (downloadedNames.has(downloadModelName)) {
          setDownloadModelName(null)
          setDownloadProgress(undefined)
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000)

    return () => {
      isMounted = false
      clearInterval(pollInterval)
    }
  }, [downloadModelName])

  useEffect(() => {
    if (!window.electronAPI?.transcription?.onProgress) return
    const unsubscribe = window.electronAPI.transcription.onProgress((_event, data: TranscriptionProgress) => {
      if (data.stage === 'download') {
        setDownloadModelName(data.modelName ?? null)
        setDownloadProgress(normalizeProgress(data.progress))
        return
      }
      if (data.stage === 'install') {
        setInstallProgress(normalizeProgress(data.progress))
        return
      }
      if (!data.recordingId) return
      setTranscriptionProgressByRecording(prev => ({
        ...prev,
        [data.recordingId]: {
          ...data,
          progress: normalizeProgress(data.progress)
        }
      }))
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.transcription?.onStatus) return
    const unsubscribe = window.electronAPI.transcription.onStatus((_event, data: TranscriptionStatusUpdate) => {
      if (!data?.recordingId) return
      updateRecordingMetadata(data.recordingId, (metadata) => {
        metadata.transcriptionStatus = data.status
      })

      setTranscriptionErrors(prev => {
        const next = { ...prev }
        if (data.status === TranscriptionStatus.Failed) {
          next[data.recordingId] = data.message ?? 'Transcription failed'
        } else {
          delete next[data.recordingId]
        }
        return next
      })

      if (data.status !== TranscriptionStatus.Processing && data.status !== TranscriptionStatus.Pending) {
        setTranscriptionProgressByRecording(prev => {
          const next = { ...prev }
          delete next[data.recordingId]
          return next
        })
      }
    })
    return unsubscribe
  }, [updateRecordingMetadata])

  const handleDeleteWords = useCallback((recordingId: string, wordIds: string[]) => {
    if (!executorRef.current || !project) return
    if (wordIds.length === 0) return
    const recording = project.recordings.find(r => r.id === recordingId)
    const transcript = recording?.metadata?.transcript
    if (!recording || !transcript) return
    executorRef.current.execute(TranscriptEditCommand, recording.id, wordIds, transcript)
  }, [executorRef, project])

  const handleToggleSubtitles = useCallback((recordingId: string) => {
    if (!executorRef.current || !project) return
    const recording = project.recordings.find(r => r.id === recordingId)
    const transcript = recording?.metadata?.transcript
    if (!recording || !transcript) return

    const existing = subtitleEffects.get(recordingId)
    if (existing) {
      executorRef.current.execute(RemoveEffectCommand, existing.id)
      return
    }

    executorRef.current.execute(AddEffectCommand, createSubtitleEffect(recording, project))
  }, [executorRef, project, subtitleEffects])

  /* handleUpdateSubtitleAnchor removed */

  /* handleUpdateSubtitleStyle removed as it is no longer used */

  useEffect(() => {
    if (!executorRef.current || !project) return

    // Normalization & Deduplication
    const seenRecordings = new Set<string>()
    const effectsToRemove: string[] = []

    project.timeline.effects?.forEach(effect => {
      if (effect.type !== EffectType.Subtitle) return

      const data = effect.data as SubtitleEffectData
      if (seenRecordings.has(data.recordingId)) {
        effectsToRemove.push(effect.id)
      } else {
        seenRecordings.add(data.recordingId)
      }
    })

    if (effectsToRemove.length > 0) {
      effectsToRemove.forEach(id => executorRef.current?.execute(RemoveEffectCommand, id))
    }

    // Auto-create missing subtitles
    eligibleRecordings.forEach(recording => {
      const transcript = recording.metadata?.transcript
      if (!transcript?.words?.length) return

      // Strict check: if ANY subtitle effect exists for this recording, skip
      // This prevents the race condition where multiple effects were created

      const hasSubtitle = project.timeline.effects?.some(e =>
        e.type === EffectType.Subtitle &&
        (e.data as SubtitleEffectData).recordingId === recording.id
      )

      if (hasSubtitle) return

      // Use the global default style if available from another effect
      const firstSubtitle = project.timeline.effects?.find(e => e.type === EffectType.Subtitle) as SubtitleEffect | undefined
      const baseEffect = createSubtitleEffect(recording, project)

      if (firstSubtitle) {
        // Copy style from existing subtitle to maintain consistency
        const sourceData = firstSubtitle.data
        baseEffect.data = {
          ...baseEffect.data,
          fontSize: sourceData.fontSize,
          lineHeight: sourceData.lineHeight,
          anchor: sourceData.anchor,
          textColor: sourceData.textColor,
          highlightColor: sourceData.highlightColor,
          backgroundColor: sourceData.backgroundColor,
          backgroundOpacity: sourceData.backgroundOpacity,
          fontFamily: sourceData.fontFamily
        }
      }

      executorRef.current?.execute(AddEffectCommand, baseEffect)
    })
  }, [eligibleRecordings, project, executorRef]) // Removed subtitleEffects dependency to avoid cycles

  const updateAllSubtitles = useCallback((updates: Partial<SubtitleEffectData>) => {
    if (!executorRef.current || !project) return
    project.timeline.effects?.forEach(effect => {
      if (effect.type === EffectType.Subtitle) {
        executorRef.current?.execute(UpdateEffectCommand, effect.id, { data: updates })
      }
    })
  }, [executorRef, project])

  const handleGlobalFontSizeChange = useCallback((value: number) => {
    updateAllSubtitles({
      fontSize: value,
      lineHeight: Math.round(value * 1.3)
    })
  }, [updateAllSubtitles])

  const handleGlobalAnchorChange = useCallback((anchor: OverlayAnchor) => {
    updateAllSubtitles({ anchor })
  }, [updateAllSubtitles])

  const handleGlobalPaddingChange = useCallback((value: number) => {
    updateAllSubtitles({ padding: value })
  }, [updateAllSubtitles])

  const handleGlobalBorderRadiusChange = useCallback((value: number) => {
    updateAllSubtitles({ borderRadius: value })
  }, [updateAllSubtitles])

  const handleGlobalOpacityChange = useCallback((value: number) => {
    updateAllSubtitles({ backgroundOpacity: value })
  }, [updateAllSubtitles])

  const handleDownloadModel = useCallback(async () => {
    if (!selectedModel || !window.electronAPI?.transcription?.downloadModel) return
    setDownloadModelName(selectedModel)
    setDownloadProgress(0)
    setTranscriptionError(null)

    try {
      const result = await window.electronAPI.transcription.downloadModel(selectedModel)
      if (!result?.success) {
        setTranscriptionError(result?.error ?? 'Failed to download model')
      }
      const list = await window.electronAPI.transcription.listModels()
      setModelList(list)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download model'
      setTranscriptionError(message)
    } finally {
      setDownloadModelName(null)
    }
  }, [selectedModel])

  const handleInstallWhisper = useCallback(async () => {
    if (!window.electronAPI?.transcription?.installWhisper) return
    setIsInstallingWhisper(true)
    setInstallProgress(0)
    setTranscriptionError(null)

    try {
      const result = await window.electronAPI.transcription.installWhisper()
      if (result.success) {
        setWhisperAvailable(true)
      } else {
        setTranscriptionError(result.error ?? 'Failed to install model')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install model'
      setTranscriptionError(message)
    } finally {
      setIsInstallingWhisper(false)
      setInstallProgress(undefined)
    }
  }, [])

  const persistTranscript = useCallback(async (recording: Recording, transcript: NonNullable<Recording['metadata']>['transcript']) => {
    if (!recording.folderPath) return
    const fileName = await ProjectStorage.saveTranscriptChunk(recording.folderPath, transcript)
    if (fileName) {
      updateProjectData(project => {
        const updated = project.recordings.find(r => r.id === recording.id)
        if (!updated) return project
        updated.metadataChunks = updated.metadataChunks ?? {}
        updated.metadataChunks.transcript = [fileName]
        return project
      })
    }
  }, [updateProjectData])

  const handleTranscribeAll = useCallback(async () => {
    if (!selectedModel || !window.electronAPI?.transcription?.start) return
    const recordingsToTranscribe = eligibleRecordings.filter(recording => {
      const status = getTranscriptionStatus(recording)
      if (!recording.filePath) return false
      return status !== TranscriptionStatus.Processing && status !== TranscriptionStatus.Pending
    })

    if (recordingsToTranscribe.length === 0) return

    setTranscriptionError(null)

    for (const recording of recordingsToTranscribe) {
      setTranscriptionErrors(prev => {
        const next = { ...prev }
        delete next[recording.id]
        return next
      })
      updateRecordingMetadata(recording.id, (metadata) => {
        metadata.transcriptionStatus = TranscriptionStatus.Processing
      })

      try {
        const result = await window.electronAPI.transcription.start({
          recordingId: recording.id,
          filePath: recording.filePath!,
          folderPath: recording.folderPath,
          modelName: selectedModel || undefined
        })

        if (result?.success && result.transcript) {
          updateRecordingMetadata(recording.id, (metadata) => {
            metadata.transcript = result.transcript
            metadata.transcriptionStatus = TranscriptionStatus.Complete
          })
          await persistTranscript(recording, result.transcript)
        } else {
          const message = result?.error ?? 'Transcription failed'
          setTranscriptionErrors(prev => ({ ...prev, [recording.id]: message }))
          updateRecordingMetadata(recording.id, (metadata) => {
            metadata.transcriptionStatus = TranscriptionStatus.Failed
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Transcription failed'
        setTranscriptionErrors(prev => ({ ...prev, [recording.id]: message }))
        updateRecordingMetadata(recording.id, (metadata) => {
          metadata.transcriptionStatus = TranscriptionStatus.Failed
        })
      }
    }
  }, [eligibleRecordings, persistTranscript, selectedModel, updateRecordingMetadata])

  const handleRestoreRanges = useCallback((recordingId: string, ranges: { startTime: number; endTime: number }[]) => {
    if (!executorRef.current || ranges.length === 0) return
    executorRef.current.execute(TranscriptRestoreCommand, recordingId, ranges)
  }, [executorRef])

  const handleRestoreAll = useCallback((recordingId: string) => {
    if (!executorRef.current || !project) return
    const recording = project.recordings.find(r => r.id === recordingId)
    if (!recording) return
    const duration = getRecordingDuration(recording)
    executorRef.current.execute(TranscriptRestoreCommand, recording.id, [
      { startTime: 0, endTime: duration }
    ])
  }, [executorRef, project])

  const handleSeekWord = useCallback((word: UnifiedTranscriptWord) => {
    if (!project) return
    const hiddenRanges = hiddenRegionsByRecording.get(word.recordingId) ?? []
    const isHidden = hiddenRanges.some(region =>
      word.sourceWord.startTime >= region.startTime && word.sourceWord.startTime < region.endTime
    )
    if (isHidden) return
    seek(word.timelineStartTime)
  }, [hiddenRegionsByRecording, project, seek])

  const handleCancelTranscription = useCallback(async (recordingId: string) => {
    if (!window.electronAPI?.transcription?.cancel) return
    await window.electronAPI.transcription.cancel(recordingId)
    updateRecordingMetadata(recordingId, (metadata) => {
      metadata.transcriptionStatus = TranscriptionStatus.None
    })
  }, [updateRecordingMetadata])

  const handleGlobalHighlightStyleChange = useCallback((value: string) => {
    updateAllSubtitles({ highlightStyle: value as SubtitleHighlightStyle })
  }, [updateAllSubtitles])

  const handleGlobalHighlightColorChange = useCallback((value: string) => {
    updateAllSubtitles({ highlightColor: value })
  }, [updateAllSubtitles])

  const { resolvedAnchors } = useOverlayState()
  const occupiedAnchors = useMemo(() => {
    const occupied = new Set<OverlayAnchor>()
    resolvedAnchors.forEach((anchor, effectId) => {
      const effect = project?.timeline.effects?.find(e => e.id === effectId)
      if (effect && effect.type !== EffectType.Subtitle) {
        occupied.add(anchor)
      }
    })
    return occupied
  }, [resolvedAnchors, project])

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No project loaded.
      </div>
    )
  }

  const downloadedModels = new Set((modelList?.downloaded ?? []).map(model => model.name))
  const hasSelectedModel = selectedModel.length > 0
  const isModelDownloaded = hasSelectedModel && downloadedModels.has(selectedModel)
  const isDownloadingSelected = downloadModelName === selectedModel
  const isProcessingAny = eligibleRecordings.some(recording => {
    const status = getTranscriptionStatus(recording)
    return status === TranscriptionStatus.Processing || status === TranscriptionStatus.Pending
  })
  const hasTranscripts = eligibleRecordings.some(recording => Boolean(recording.metadata?.transcript?.words?.length))
  const canTranscribe = whisperAvailable && isModelDownloaded && !isProcessingAny && !isDownloadingSelected && eligibleRecordings.some(recording => Boolean(recording.filePath))
  const modelLabels: Record<string, { name: string; desc: string }> = {
    base: { name: 'Fast', desc: '~140MB' },
    small: { name: 'Balanced', desc: '~460MB' },
    medium: { name: 'Accurate', desc: '~1.5GB' },
  }

  const selectedModelLabel = modelLabels[selectedModel]?.name ?? selectedModel

  // Get current global subtitle settings from the first available effect, or defaults
  const firstSubtitleEffect = effects.find(e => e.type === EffectType.Subtitle) as SubtitleEffect | undefined
  const globalFontSize = firstSubtitleEffect?.data?.fontSize ?? DEFAULT_SUBTITLE_STYLE.fontSize
  const globalAnchor = firstSubtitleEffect?.data?.anchor ?? OverlayAnchor.BottomCenter
  const globalPadding = firstSubtitleEffect?.data?.padding ?? DEFAULT_SUBTITLE_STYLE.padding ?? 2
  const globalBorderRadius = firstSubtitleEffect?.data?.borderRadius ?? DEFAULT_SUBTITLE_STYLE.borderRadius ?? 6
  const globalBackgroundOpacity = firstSubtitleEffect?.data?.backgroundOpacity ?? DEFAULT_SUBTITLE_STYLE.backgroundOpacity ?? 0.4
  const globalHighlightStyle = firstSubtitleEffect?.data?.highlightStyle ?? DEFAULT_SUBTITLE_STYLE.highlightStyle ?? 'color'
  const globalHighlightColor = firstSubtitleEffect?.data?.highlightColor ?? DEFAULT_SUBTITLE_STYLE.highlightColor ?? '#FFD166'
  const hasSubtitles = subtitleEffects.size > 0

  return (
    <div className="flex flex-col gap-3 -mx-4 -mt-3">
      {/* Whisper Install Banner */}
      {whisperAvailable === false && (
        <div className="mx-4 flex items-center justify-between gap-3 rounded-lg bg-orange-500/8 border border-orange-500/10 px-3 py-2">
          <span className="text-[11px] text-orange-600/90 dark:text-orange-400/90">Whisper is required for transcription</span>
          <button
            type="button"
            onClick={handleInstallWhisper}
            disabled={isInstallingWhisper}
            className="text-[11px] font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors disabled:opacity-50"
          >
            {isInstallingWhisper ? 'Installing…' : 'Install'}
          </button>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/5">
        {/* Model Selector */}
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="h-7 w-auto min-w-[90px] gap-1.5 rounded-md border-0 bg-transparent px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] active:bg-foreground/[0.06] transition-all duration-150">
            <SelectValue placeholder="Model">
              <span>{selectedModelLabel}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" className="min-w-[160px]">
            {((modelList?.available ?? []).sort((a, b) => {
              const order = ['base', 'small', 'medium']
              return order.indexOf(a) - order.indexOf(b)
            })).map(modelName => {
              const label = modelLabels[modelName]
              const isDownloaded = downloadedModels.has(modelName)
              return (
                <SelectItem key={modelName} value={modelName} className="text-[11px]">
                  <div className="flex items-center justify-between gap-3 w-full">
                    <span className={isDownloaded ? 'text-foreground' : 'text-muted-foreground'}>{label?.name ?? modelName}</span>
                    <span className="text-muted-foreground/60 text-[10px]">{label?.desc}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        {!isModelDownloaded && hasSelectedModel && (
          <button
            type="button"
            onClick={handleDownloadModel}
            disabled={isDownloadingSelected}
            className="h-6 px-2 flex items-center gap-1.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-all duration-150 disabled:opacity-50"
          >
            {isDownloadingSelected ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            <span>Download</span>
          </button>
        )}

        <div className="flex-1" />

        {/* Show/Hide Deleted Toggle */}
        {hasTranscripts && (
          <button
            type="button"
            onClick={() => setShowDeleted(prev => !prev)}
            className={`h-6 px-2 flex items-center gap-1.5 rounded-md text-[10px] font-medium whitespace-nowrap transition-all duration-150 ${showDeleted
              ? 'text-foreground/70 bg-foreground/[0.06]'
              : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]'
              }`}
          >
            {showDeleted ? <Eye className="h-3 w-3 flex-shrink-0" /> : <EyeOff className="h-3 w-3 flex-shrink-0" />}
            <span>{showDeleted ? 'Showing cuts' : 'Cuts hidden'}</span>
          </button>
        )}

        {/* Transcribe Button */}
        <button
          type="button"
          onClick={handleTranscribeAll}
          disabled={!canTranscribe}
          className="h-7 px-3 flex items-center gap-1.5 rounded-md bg-foreground/[0.08] hover:bg-foreground/[0.12] active:bg-foreground/[0.16] text-foreground text-[11px] font-medium whitespace-nowrap transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
        >
          {isProcessingAny ? (
            <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3 flex-shrink-0" />
          )}
          <span>{isProcessingAny ? 'Processing…' : hasTranscripts ? 'Redo' : 'Transcribe'}</span>
        </button>
      </div>

      {/* Progress Indicators */}
      {((downloadProgress != null && downloadModelName) || (installProgress != null && isInstallingWhisper)) && (
        <div className="px-4 py-2 border-b border-border/5">
          {(downloadProgress != null && downloadModelName) && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground/70">
                <span>Downloading {modelLabels[downloadModelName]?.name ?? downloadModelName}</span>
                <span className="tabular-nums">{Math.round(downloadProgress)}%</span>
              </div>
              <Progress value={downloadProgress} className="h-[2px]" />
            </div>
          )}
          {(installProgress != null && isInstallingWhisper) && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground/70">
                <span>Installing Whisper</span>
                <span className="tabular-nums">{Math.round(installProgress)}%</span>
              </div>
              <Progress value={installProgress} className="h-[2px]" />
            </div>
          )}
        </div>
      )}

      {transcriptionError && (
        <div className="mx-4 mt-2 flex items-center gap-2 text-[11px] text-red-500/90">
          <span>{transcriptionError}</span>
        </div>
      )}

      {/* Transcript Content */}
      <div className="px-4">
        <UnifiedTranscriptView
          sections={sections}
          words={timelineWords}
          hiddenRegionsByRecording={hiddenRegionsByRecording}
          showDeleted={showDeleted}
          currentTime={currentTime}
          onDeleteWords={handleDeleteWords}
          onRestoreRanges={handleRestoreRanges}
          onRestoreAll={handleRestoreAll}
          onSeekWord={handleSeekWord}
          onToggleSubtitles={handleToggleSubtitles}
          onCancelTranscription={handleCancelTranscription}
        />
      </div>

      {/* Subtitle Appearance */}
      {hasSubtitles && (
        <div className="px-4 py-3 space-y-3 border-t border-border/5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Captions</div>

          <OverlayPositionControl
            anchor={globalAnchor}
            onChange={handleGlobalAnchorChange}
            label="Position"
            occupiedAnchors={occupiedAnchors}
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/70">Highlight</span>
              <ColorPickerPopover
                value={globalHighlightColor}
                onChange={handleGlobalHighlightColorChange}
              />
            </div>
            <SegmentedControl
              value={globalHighlightStyle}
              onChange={handleGlobalHighlightStyleChange}
              options={[
                { value: 'color', label: 'Color' },
                { value: 'background', label: 'Fill' },
                { value: 'underline', label: 'Line' },
                { value: 'scale', label: 'Scale' },
              ]}
              className="w-full"
            />
          </div>

          <OverlayStyleControl
            fontSize={globalFontSize}
            onFontSizeChange={handleGlobalFontSizeChange}
            padding={globalPadding}
            onPaddingChange={handleGlobalPaddingChange}
            borderRadius={globalBorderRadius}
            onBorderRadiusChange={handleGlobalBorderRadiusChange}
            backgroundOpacity={globalBackgroundOpacity}
            onBackgroundOpacityChange={handleGlobalOpacityChange}
          />
        </div>
      )}
    </div>
  )
}
