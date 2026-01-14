import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Captions, CaptionsOff, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import type { Recording, SourceTimeRange, Transcript, TranscriptWord, SubtitleEffect } from '@/types/project'
import { TranscriptionStatus } from '@/types/project'
import type { TranscriptionProgress } from '@/types/transcription'
import { formatTime } from '@/shared/utils/time'
import { Progress } from '@/components/ui/progress'


export interface UnifiedTranscriptSection {
  recording: Recording
  label: string
  timelineRange: { start: number; end: number } | null
  transcript?: Transcript | null
  hiddenRegions: SourceTimeRange[]
  isCurrent: boolean
  transcriptionStatus: TranscriptionStatus
  transcriptionProgress?: TranscriptionProgress | null
  transcriptionError?: string | null
  subtitleEffect?: SubtitleEffect | null
}

export interface UnifiedTranscriptWord {
  id: string
  recordingId: string
  clipId: string
  sourceWord: TranscriptWord
  timelineStartTime: number
  timelineEndTime: number
  label: string
}

interface UnifiedTranscriptViewProps {
  sections: UnifiedTranscriptSection[]
  words: UnifiedTranscriptWord[]
  hiddenRegionsByRecording: Map<string, SourceTimeRange[]>
  showDeleted: boolean
  currentTime: number
  onDeleteWords: (recordingId: string, wordIds: string[]) => void
  onRestoreRanges: (recordingId: string, ranges: SourceTimeRange[]) => void
  onRestoreAll: (recordingId: string) => void
  onSeekWord: (word: UnifiedTranscriptWord) => void
  onToggleSubtitles: (recordingId: string) => void
  onCancelTranscription: (recordingId: string) => void
}

/* -------------------------------------------------------------------------------------------------
 * Transcript Source List (Collapsible)
 * -----------------------------------------------------------------------------------------------*/

function TranscriptSourceList({
  sections,
  onRestoreAll,
  onToggleSubtitles,
  onCancelTranscription
}: {
  sections: UnifiedTranscriptSection[]
  onRestoreAll: (recordingId: string) => void
  onToggleSubtitles: (recordingId: string) => void
  onCancelTranscription: (recordingId: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const activeProcessingCount = sections.filter(
    s => s.transcriptionStatus === TranscriptionStatus.Processing || s.transcriptionStatus === TranscriptionStatus.Pending
  ).length

  const needsTranscriptionCount = sections.filter(
    s => !s.transcript?.words?.length && s.transcriptionStatus === TranscriptionStatus.None
  ).length

  if (sections.length === 0) return null

  // Compact View (Face Pile)
  if (!isExpanded) {
    return (
      <div
        className="group flex items-center justify-between px-3 py-2 bg-muted/20 rounded-lg border border-border/40 hover:bg-muted/40 transition-all cursor-pointer select-none"
        onClick={() => setIsExpanded(true)}
      >
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {sections.slice(0, 4).map((section, i) => (
              <div
                key={section.recording.id}
                className={`flex items-center justify-center w-7 h-7 rounded-pill ring-2 ring-background text-3xs font-semibold transition-transform z-[${4 - i}] ${section.isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
                  }`}
                title={section.label}
              >
                {section.label.charAt(0)}
              </div>
            ))}
            {sections.length > 4 && (
              <div className="flex items-center justify-center w-7 h-7 rounded-pill ring-2 ring-background bg-muted text-muted-foreground text-3xs font-semibold">
                +{sections.length - 4}
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-foreground">
              {sections.length} Sources
            </span>
            {activeProcessingCount > 0 && (
              <span className="text-3xs text-muted-foreground animate-pulse">
                Processing {activeProcessingCount}...
              </span>
            )}
            {activeProcessingCount === 0 && needsTranscriptionCount > 0 && (
              <span className="text-3xs text-amber-600 dark:text-amber-400">
                {needsTranscriptionCount} needs transcription
              </span>
            )}
          </div>
        </div>
        <button
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // Expanded View (List)
  return (
    <div className="space-y-1">
      <div
        className="flex items-center justify-between px-2 pt-1 pb-2 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
        onClick={() => setIsExpanded(false)}
      >
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">Sources</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </div>

      {sections.map(section => {
        const hasTranscript = Boolean(section.transcript?.words?.length)
        const isProcessing = section.transcriptionStatus === TranscriptionStatus.Processing
          || section.transcriptionStatus === TranscriptionStatus.Pending
        const needsTranscription = !hasTranscript && section.transcriptionStatus === TranscriptionStatus.None
        const rangeLabel = section.timelineRange
          ? `${formatTime(section.timelineRange.start, true)} – ${formatTime(section.timelineRange.end, true)}`
          : ''

        return (
          <div
            key={`section-${section.recording.id}`}
            className="group flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/30 transition-colors relative"
          >
            {/* Avatar */}
            <div className={`flex items-center justify-center w-7 h-7 rounded-pill text-3xs font-semibold ${section.isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {section.label.charAt(0)}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {section.label}
                </span>
                {section.isCurrent && <span className="h-1.5 w-1.5 rounded-pill bg-primary" />}
                {needsTranscription && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-4xs font-medium text-amber-600 dark:text-amber-400 animate-pulse">
                    <span>Needs Transcription</span>
                  </span>
                )}
              </div>
              {rangeLabel && (
                <span className="text-3xs text-muted-foreground tabular-nums">{rangeLabel}</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {section.hiddenRegions.length > 0 && hasTranscript && (
                <button
                  type="button"
                  onClick={() => onRestoreAll(section.recording.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Restore all"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              {hasTranscript && (
                <button
                  type="button"
                  onClick={() => onToggleSubtitles(section.recording.id)}
                  className={`p-1.5 rounded transition-colors ${section.subtitleEffect
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                  title={section.subtitleEffect ? 'Hide subtitles' : 'Show subtitles'}
                >
                  {section.subtitleEffect ? <CaptionsOff className="h-3.5 w-3.5" /> : <Captions className="h-3.5 w-3.5" />}
                </button>
              )}
              {isProcessing && (
                <button
                  type="button"
                  onClick={() => onCancelTranscription(section.recording.id)}
                  className="px-2 py-1 rounded text-3xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Progress */}
            {section.transcriptionProgress && section.transcriptionProgress.progress != null && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 pointer-events-none">
                <Progress value={section.transcriptionProgress.progress * 100} className="h-full rounded-none" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


/* -------------------------------------------------------------------------------------------------
 * Transcript Stream (Gutter Layout)
 * -----------------------------------------------------------------------------------------------*/

function isTimeInRanges(timeMs: number, ranges: SourceTimeRange[]): boolean {
  for (const range of ranges) {
    if (timeMs >= range.startTime && timeMs < range.endTime) return true
  }
  return false
}

function UnifiedTranscriptStream({
  words,
  sections,
  hiddenRegionsByRecording,
  showDeleted,
  currentTime,
  onDeleteWords,
  onRestoreRanges,
  onSeekWord
}: {
  words: UnifiedTranscriptWord[]
  sections: UnifiedTranscriptSection[]
  hiddenRegionsByRecording: Map<string, SourceTimeRange[]>
  showDeleted: boolean
  currentTime: number
  onDeleteWords: (recordingId: string, wordIds: string[]) => void
  onRestoreRanges: (recordingId: string, ranges: SourceTimeRange[]) => void
  onSeekWord: (word: UnifiedTranscriptWord) => void
}) {
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set())
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null)
  const isSelectingRef = useRef(false)
  const wordContainerRef = useRef<HTMLDivElement | null>(null)
  const wordRefs = useRef<Record<string, HTMLSpanElement | null>>({})

  // 1. Calculate states for all words
  const wordStates = useMemo(() => {
    return words.map((word, index) => {
      const hiddenRegions = hiddenRegionsByRecording.get(word.recordingId) ?? []
      const isHidden = hiddenRegions.length > 0
        ? isTimeInRanges(word.sourceWord.startTime, hiddenRegions)
        : false
      const isCurrent = currentTime >= word.timelineStartTime && currentTime < word.timelineEndTime
      const isSelected = selectedWordIds.has(word.id)
      return {
        word,
        index, // index in the original `words` array
        isDeleted: isHidden,
        isCurrent,
        isSelected
      }
    })
  }, [currentTime, hiddenRegionsByRecording, selectedWordIds, words])

  // 2. Filter visible words
  const visibleWordStates = useMemo(() => {
    if (showDeleted) return wordStates
    return wordStates.filter(state => !state.isDeleted)
  }, [showDeleted, wordStates])

  const visibleWords = useMemo(() => visibleWordStates.map(state => state.word), [visibleWordStates])

  // 3. Selection Helpers
  const selectedWordStates = useMemo(() => {
    if (selectedWordIds.size === 0) return []
    return wordStates.filter(state => selectedWordIds.has(state.word.id))
  }, [selectedWordIds, wordStates])

  const selectionHasVisibleWords = selectedWordStates.length > 0
  const selectionHasKeptWords = selectedWordStates.some(state => !state.isDeleted)
  const selectionAllDeleted = selectionHasVisibleWords && selectedWordStates.every(state => state.isDeleted)

  const updateSelectionRange = useCallback((start: number, end: number) => {
    const [from, to] = start <= end ? [start, end] : [end, start]
    const next = new Set<string>()
    for (let i = from; i <= to; i++) {
      const wordId = visibleWords[i]?.id
      if (wordId) next.add(wordId)
    }
    setSelectedWordIds(next)
  }, [visibleWords])

  const handleWordClick = useCallback((index: number, isDeleted: boolean, event: React.MouseEvent) => {
    event.preventDefault()
    const clickedWord = visibleWords[index]
    if (!clickedWord) return

    if (event.shiftKey && anchorIndex != null) {
      updateSelectionRange(anchorIndex, index)
      return
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedWordIds(prev => {
        const next = new Set(prev)
        if (next.has(clickedWord.id)) {
          next.delete(clickedWord.id)
        } else {
          next.add(clickedWord.id)
        }
        return next
      })
      setAnchorIndex(index)
      return
    }

    if (!isDeleted) {
      onSeekWord(clickedWord)
    }
    setSelectedWordIds(new Set([clickedWord.id]))
    setAnchorIndex(index)
  }, [anchorIndex, onSeekWord, updateSelectionRange, visibleWords])

  const handleWordMouseDown = useCallback((index: number, event: React.MouseEvent) => {
    if (event.button !== 0) return
    isSelectingRef.current = true
    setAnchorIndex(index)
    updateSelectionRange(index, index)
  }, [updateSelectionRange])

  const handleWordMouseEnter = useCallback((index: number) => {
    if (!isSelectingRef.current || anchorIndex == null) return
    updateSelectionRange(anchorIndex, index)
  }, [anchorIndex, updateSelectionRange])

  useEffect(() => {
    const stopSelecting = () => {
      isSelectingRef.current = false
    }
    window.addEventListener('mouseup', stopSelecting)
    return () => window.removeEventListener('mouseup', stopSelecting)
  }, [])

  // 4. Action Handlers (Hide/Restore) - Unchanged from original
  const handleHideSelection = useCallback(() => {
    if (selectedWordIds.size === 0) return
    const wordIdsByRecording = new Map<string, Set<string>>()
    selectedWordIds.forEach(id => {
      const entry = words.find(word => word.id === id)
      if (!entry) return
      const existing = wordIdsByRecording.get(entry.recordingId) ?? new Set<string>()
      existing.add(entry.sourceWord.id)
      wordIdsByRecording.set(entry.recordingId, existing)
    })
    wordIdsByRecording.forEach((ids, recordingId) => {
      onDeleteWords(recordingId, Array.from(ids))
    })
    setSelectedWordIds(new Set())
    setToolbarPosition(null)
  }, [onDeleteWords, selectedWordIds, words])

  const handleRestoreSelection = useCallback(() => {
    if (selectedWordIds.size === 0) return
    const rangesByRecording = new Map<string, { startTime: number; endTime: number }>()
    selectedWordIds.forEach(id => {
      const entry = words.find(word => word.id === id)
      if (!entry) return
      const existing = rangesByRecording.get(entry.recordingId)
      if (!existing) {
        rangesByRecording.set(entry.recordingId, { startTime: entry.sourceWord.startTime, endTime: entry.sourceWord.endTime })
      } else {
        rangesByRecording.set(entry.recordingId, {
          startTime: Math.min(existing.startTime, entry.sourceWord.startTime),
          endTime: Math.max(existing.endTime, entry.sourceWord.endTime)
        })
      }
    })
    rangesByRecording.forEach((range, recordingId) => {
      onRestoreRanges(recordingId, [range])
    })
    setSelectedWordIds(new Set())
    setToolbarPosition(null)
  }, [onRestoreRanges, selectedWordIds, words])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    if (selectedWordIds.size === 0) return
    event.preventDefault()
    if (selectionAllDeleted) {
      handleRestoreSelection()
      return
    }
    handleHideSelection()
  }, [handleHideSelection, handleRestoreSelection, selectedWordIds.size, selectionAllDeleted])

  const updateToolbarPosition = useCallback(() => {
    if (!wordContainerRef.current || selectedWordIds.size === 0) {
      setToolbarPosition(null)
      return
    }
    // We can rely on just one or two points to position broadly, or compute bounding box
    // Since words are scattered in flex groups, bounding box calculation is still best
    const selectedRects = Array.from(selectedWordIds)
      .map(id => wordRefs.current[id]?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => Boolean(rect))

    if (selectedRects.length === 0) {
      setToolbarPosition(null)
      return
    }

    const containerRect = wordContainerRef.current.getBoundingClientRect()
    // Compute total bounds of selection
    const bounds = selectedRects.reduce((acc, rect) => {
      return {
        top: Math.min(acc.top, rect.top),
        bottom: Math.max(acc.bottom, rect.bottom),
        left: Math.min(acc.left, rect.left),
        right: Math.max(acc.right, rect.right),
      }
    }, {
      top: selectedRects[0].top,
      bottom: selectedRects[0].bottom,
      left: selectedRects[0].left,
      right: selectedRects[0].right,
    })

    const x = bounds.left + (bounds.right - bounds.left) / 2 - containerRect.left
    const y = Math.max(12, bounds.top - containerRect.top - 36)
    setToolbarPosition({ x, y })
  }, [selectedWordIds])

  useEffect(() => {
    updateToolbarPosition()
  }, [selectedWordIds, updateToolbarPosition, visibleWordStates])

  useEffect(() => {
    const handleResize = () => updateToolbarPosition()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateToolbarPosition])

  useEffect(() => {
    setSelectedWordIds(new Set())
    setAnchorIndex(null)
    setToolbarPosition(null)
  }, [showDeleted])

  // 5. Group words by Clip for Layout
  // We want to render a Gutter (timestamp) for each logical block (Clip change)
  const groupedWords = useMemo(() => {
    type WordState = typeof visibleWordStates[0]
    type WordStateWithVisibleIndex = WordState & { visibleIndex: number }
    const groups: { clipId: string; startTime: number; items: WordStateWithVisibleIndex[] }[] = []

    if (visibleWordStates.length === 0) return groups

    let currentGroup: typeof groups[0] | null = null

    visibleWordStates.forEach((state, visibleIndex) => {
      // Need to attach the 'visibleIndex' to the state so handlers work
      const itemWithVisibleIndex = { ...state, visibleIndex }

      if (!currentGroup || state.word.clipId !== currentGroup.clipId) {
        if (currentGroup) groups.push(currentGroup)
        // Start new group
        currentGroup = {
          clipId: state.word.clipId,
          startTime: state.word.timelineStartTime,
          items: [itemWithVisibleIndex]
        }
      } else {
        currentGroup.items.push(itemWithVisibleIndex)
      }
    })
    if (currentGroup) groups.push(currentGroup)
    return groups
  }, [visibleWordStates])

  if (words.length === 0) {
    const isProcessing = sections.some(s => s.transcriptionStatus === TranscriptionStatus.Processing || s.transcriptionStatus === TranscriptionStatus.Pending)
    const allComplete = sections.length > 0 && sections.every(s => s.transcriptionStatus === TranscriptionStatus.Complete || s.transcriptionStatus === TranscriptionStatus.Failed)

    if (isProcessing) {
      return (
        <div className="py-6 px-2 space-y-4">
          {/* Skeleton placeholder rows */}
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-4 animate-pulse" style={{ animationDelay: `${row * 150}ms` }}>
              {/* Gutter skeleton */}
              <div className="flex-shrink-0 w-12 pt-1">
                <div className="h-3 w-10 bg-muted rounded ml-auto" />
              </div>
              {/* Words skeleton */}
              <div className="flex-1 flex flex-wrap gap-x-1.5 gap-y-1">
                {Array.from({ length: 6 + row * 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-5 rounded bg-muted"
                    style={{ width: `${40 + Math.random() * 50}px` }}
                  />
                ))}
              </div>
            </div>
          ))}
          {/* Call to action */}
          <div className="flex items-center justify-center gap-2 pt-4 text-xs text-muted-foreground animate-pulse">
            <span>Transcribing...</span>
          </div>
        </div>
      )
    }

    if (allComplete) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <CaptionsOff className="w-8 h-8 opacity-20" />
          <span className="text-sm">No speech detected in this recording</span>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
        <span className="text-sm">Choose a model and transcribe to start editing</span>
      </div>
    )
  }

  return (
    <div
      ref={wordContainerRef}
      className="relative max-h-[400px] overflow-y-auto px-2 py-4 text-sm leading-relaxed text-foreground/90 focus:outline-none scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Floating Toolbar */}
      {toolbarPosition && selectionHasVisibleWords && (
        <div
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 items-center gap-2 rounded-md bg-background/95 px-2 py-1 text-xs shadow-lg ring-1 ring-border/20 backdrop-blur-sm"
          style={{ left: toolbarPosition.x, top: Math.max(0, toolbarPosition.y - 8) }}
        >
          <span className="font-medium">{selectedWordIds.size}</span>
          <span className="text-muted-foreground">selected</span>
          {selectionAllDeleted ? (
            <button
              type="button"
              onClick={handleRestoreSelection}
              className="pointer-events-auto ml-1 rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={handleHideSelection}
              disabled={!selectionHasKeptWords}
              className="pointer-events-auto ml-1 rounded px-2 py-0.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
            >
              Hide
            </button>
          )}
        </div>
      )}

      {/* Start Marker */}
      <div className="flex items-center justify-center pb-6 opacity-30">
        <div className="h-px w-12 bg-border" />
        <span className="px-2 text-3xs font-medium uppercase tracking-wider text-muted-foreground">Start</span>
        <div className="h-px w-12 bg-border" />
      </div>

      {/* Unified Stream with Gutter */}
      <div className="space-y-6">
        {groupedWords.map((group, groupIndex) => (
          <div key={`${group.clipId}-${groupIndex}`} className="flex gap-4">
            {/* Gutter */}
            <div className="flex-shrink-0 w-12 pt-1 text-right">
              <span className="text-3xs font-medium text-muted-foreground/50 tabular-nums select-none">
                {formatTime(group.startTime, true)}
              </span>
            </div>

            {/* Words */}
            <div className="flex-1 flex flex-wrap gap-x-1.5 gap-y-1">
              {group.items.map(({ word, isDeleted, isCurrent, isSelected, visibleIndex }) => (
                <span
                  key={`word-${word.id}`}
                  ref={(node) => {
                    wordRefs.current[word.id] = node
                  }}
                  onMouseDown={(event) => handleWordMouseDown(visibleIndex, event)}
                  onMouseEnter={() => handleWordMouseEnter(visibleIndex)}
                  onClick={(event) => handleWordClick(visibleIndex, isDeleted, event)}
                  className={[
                    'cursor-pointer select-none rounded-[4px] px-1 py-0.5 transition-all duration-100 ease-out',
                    isSelected
                      ? 'bg-primary/20 text-primary font-medium'
                      : 'hover:bg-primary/10 hover:text-foreground',
                    isCurrent ? 'underline decoration-primary decoration-2 underline-offset-2' : '',
                    isDeleted ? 'line-through decoration-muted-foreground/40 text-muted-foreground/50 hover:text-muted-foreground hover:no-underline' : ''
                  ].join(' ')}
                >
                  {word.sourceWord.text}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* End Marker */}
      <div className="flex items-center justify-center pt-8 pb-4 opacity-30">
        <div className="h-px w-12 bg-border" />
        <span className="px-2 text-3xs font-medium uppercase tracking-wider text-muted-foreground">End</span>
        <div className="h-px w-12 bg-border" />
      </div>
    </div>
  )
}

export function UnifiedTranscriptView({
  sections,
  words,
  hiddenRegionsByRecording,
  showDeleted,
  currentTime,
  onDeleteWords,
  onRestoreRanges,
  onRestoreAll,
  onSeekWord,
  onToggleSubtitles,
  onCancelTranscription,
}: UnifiedTranscriptViewProps) {
  if (sections.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        No audio or webcam recordings to display.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TranscriptSourceList
        sections={sections}
        onRestoreAll={onRestoreAll}
        onToggleSubtitles={onToggleSubtitles}
        onCancelTranscription={onCancelTranscription}
      />

      <UnifiedTranscriptStream
        words={words}
        sections={sections}
        hiddenRegionsByRecording={hiddenRegionsByRecording}
        showDeleted={showDeleted}
        currentTime={currentTime}
        onDeleteWords={onDeleteWords}
        onRestoreRanges={onRestoreRanges}
        onSeekWord={onSeekWord}
      />
    </div>
  )
}
