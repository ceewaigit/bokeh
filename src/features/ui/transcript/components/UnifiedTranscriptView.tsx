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

  // Compact View
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="group w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-foreground/[0.03] active:bg-foreground/[0.05] transition-colors duration-150"
      >
        {/* Avatar Stack */}
        <div className="flex -space-x-1.5">
          {sections.slice(0, 3).map((section, i) => (
            <div
              key={section.recording.id}
              className={`flex items-center justify-center w-5 h-5 rounded-full ring-[1.5px] ring-background text-[9px] font-medium ${
                section.isCurrent
                  ? 'bg-foreground/10 text-foreground'
                  : 'bg-foreground/[0.06] text-muted-foreground'
              }`}
              style={{ zIndex: 4 - i }}
            >
              {section.label.charAt(0)}
            </div>
          ))}
          {sections.length > 3 && (
            <div className="flex items-center justify-center w-5 h-5 rounded-full ring-[1.5px] ring-background bg-foreground/[0.04] text-muted-foreground/70 text-[9px] font-medium">
              +{sections.length - 3}
            </div>
          )}
        </div>

        {/* Label */}
        <div className="flex-1 text-left">
          <span className="text-[11px] text-muted-foreground">
            {sections.length} {sections.length === 1 ? 'source' : 'sources'}
          </span>
          {activeProcessingCount > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/60">
              · transcribing
            </span>
          )}
          {activeProcessingCount === 0 && needsTranscriptionCount > 0 && (
            <span className="ml-1.5 text-[10px] text-orange-500/80">
              · {needsTranscriptionCount} pending
            </span>
          )}
        </div>

        <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
      </button>
    )
  }

  // Expanded View
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setIsExpanded(false)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors"
      >
        <ChevronDown className="w-3 h-3" />
        <span>Sources</span>
      </button>

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
            className="group flex items-center gap-2.5 px-3 py-1.5 rounded-md hover:bg-foreground/[0.03] transition-colors relative"
          >
            {/* Avatar */}
            <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-medium ${
              section.isCurrent
                ? 'bg-foreground/10 text-foreground'
                : 'bg-foreground/[0.06] text-muted-foreground'
            }`}>
              {section.label.charAt(0)}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-foreground/90 truncate">
                  {section.label}
                </span>
                {section.isCurrent && <span className="w-1 h-1 rounded-full bg-foreground/40" />}
                {needsTranscription && (
                  <span className="text-[9px] text-orange-500/70">pending</span>
                )}
              </div>
              {rangeLabel && (
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">{rangeLabel}</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {section.hiddenRegions.length > 0 && hasTranscript && (
                <button
                  type="button"
                  onClick={() => onRestoreAll(section.recording.id)}
                  className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                  title="Restore all"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              {hasTranscript && (
                <button
                  type="button"
                  onClick={() => onToggleSubtitles(section.recording.id)}
                  className={`p-1 rounded transition-colors ${
                    section.subtitleEffect
                      ? 'text-foreground/70'
                      : 'text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.04]'
                  }`}
                  title={section.subtitleEffect ? 'Hide captions' : 'Show captions'}
                >
                  {section.subtitleEffect ? <CaptionsOff className="h-3 w-3" /> : <Captions className="h-3 w-3" />}
                </button>
              )}
              {isProcessing && (
                <button
                  type="button"
                  onClick={() => onCancelTranscription(section.recording.id)}
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Progress */}
            {section.transcriptionProgress && section.transcriptionProgress.progress != null && (
              <div className="absolute inset-x-3 bottom-0 h-[1px] pointer-events-none overflow-hidden rounded-full">
                <Progress value={section.transcriptionProgress.progress * 100} className="h-full rounded-full" />
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

    // Skip click handling if we just finished a drag selection
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }

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

    // Toggle off if clicking an already selected word
    if (selectedWordIds.has(clickedWord.id)) {
      setSelectedWordIds(prev => {
        const next = new Set(prev)
        next.delete(clickedWord.id)
        return next
      })
      if (selectedWordIds.size === 1) {
        setAnchorIndex(null)
      }
      return
    }

    // Select single word
    if (!isDeleted) {
      onSeekWord(clickedWord)
    }
    setSelectedWordIds(new Set([clickedWord.id]))
    setAnchorIndex(index)
  }, [anchorIndex, onSeekWord, selectedWordIds, updateSelectionRange, visibleWords])

  const dragStartIndexRef = useRef<number | null>(null)
  const hasDraggedRef = useRef(false)

  const handleWordMouseDown = useCallback((index: number, event: React.MouseEvent) => {
    if (event.button !== 0) return
    isSelectingRef.current = true
    hasDraggedRef.current = false
    dragStartIndexRef.current = index
    setAnchorIndex(index)
    // Don't select yet - wait to see if it's a drag or click
  }, [])

  const handleWordMouseEnter = useCallback((index: number) => {
    if (!isSelectingRef.current || dragStartIndexRef.current == null) return
    // Only start selection if we've moved to a different word (drag)
    if (index !== dragStartIndexRef.current) {
      hasDraggedRef.current = true
      updateSelectionRange(dragStartIndexRef.current, index)
    }
  }, [updateSelectionRange])

  useEffect(() => {
    const stopSelecting = () => {
      isSelectingRef.current = false
      dragStartIndexRef.current = null
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
    const toolbarHeight = 28
    const spaceAbove = bounds.top - containerRect.top
    // Position above if there's enough space, otherwise position below
    const y = spaceAbove > toolbarHeight + 8
      ? bounds.top - containerRect.top - toolbarHeight - 4
      : bounds.bottom - containerRect.top + 4
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
        <div className="px-4 py-8 space-y-3">
          {/* Skeleton placeholder rows */}
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-3" style={{ opacity: 1 - row * 0.2 }}>
              <div className="flex-shrink-0 w-10 pt-0.5">
                <div className="h-2.5 w-8 bg-foreground/[0.04] rounded ml-auto animate-pulse" style={{ animationDelay: `${row * 100}ms` }} />
              </div>
              <div className="flex-1 flex flex-wrap gap-x-1 gap-y-1">
                {Array.from({ length: 5 + row }).map((_, i) => (
                  <div
                    key={i}
                    className="h-4 rounded bg-foreground/[0.04] animate-pulse"
                    style={{ width: `${32 + Math.random() * 40}px`, animationDelay: `${(row * 100) + (i * 50)}ms` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (allComplete) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <CaptionsOff className="w-5 h-5 text-muted-foreground/30" />
          <span className="text-[11px] text-muted-foreground/60">No speech detected</span>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center py-16 gap-1.5">
        <span className="text-[11px] text-muted-foreground/50">Select a model and click Transcribe</span>
      </div>
    )
  }

  return (
    <div
      ref={wordContainerRef}
      className="relative text-[13px] leading-relaxed text-foreground/85 focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Floating Toolbar */}
      {toolbarPosition && selectionHasVisibleWords && (
        <div
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-popover/95 px-2 py-1 text-[10px] shadow-lg shadow-black/10 ring-1 ring-black/[0.06] dark:ring-white/[0.08] backdrop-blur-xl"
          style={{ left: toolbarPosition.x, top: toolbarPosition.y }}
        >
          <span className="font-medium tabular-nums">{selectedWordIds.size}</span>
          <span className="text-muted-foreground/70">selected</span>
          {selectionAllDeleted ? (
            <button
              type="button"
              onClick={handleRestoreSelection}
              className="pointer-events-auto ml-1 rounded-md px-2 py-0.5 font-medium text-foreground bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.14] transition-colors duration-150"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={handleHideSelection}
              disabled={!selectionHasKeptWords}
              className="pointer-events-auto ml-1 rounded-md px-2 py-0.5 font-medium text-red-500/90 hover:bg-red-500/10 active:bg-red-500/15 transition-colors duration-150 disabled:opacity-40"
            >
              Cut
            </button>
          )}
        </div>
      )}

      {/* Unified Stream with Gutter */}
      <div className="space-y-4">
        {groupedWords.map((group, groupIndex) => (
          <div key={`${group.clipId}-${groupIndex}`} className="flex gap-3">
            {/* Gutter */}
            <div className="flex-shrink-0 w-10 pt-0.5 text-right">
              <span className="text-[10px] text-muted-foreground/40 tabular-nums select-none">
                {formatTime(group.startTime, true)}
              </span>
            </div>

            {/* Words */}
            <div className="flex-1 flex flex-wrap gap-x-1 gap-y-0.5">
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
                    'cursor-pointer select-none rounded px-0.5 py-px transition-colors duration-100',
                    isSelected
                      ? 'bg-foreground/10 text-foreground'
                      : 'hover:bg-foreground/[0.04]',
                    isCurrent ? 'text-foreground font-medium' : '',
                    isDeleted ? 'line-through text-muted-foreground/40 hover:text-muted-foreground/60' : ''
                  ].join(' ')}
                >
                  {word.sourceWord.text}
                </span>
              ))}
            </div>
          </div>
        ))}
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
      <div className="flex items-center justify-center py-16">
        <span className="text-[11px] text-muted-foreground/50">No audio sources available</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <TranscriptSourceList
        sections={sections}
        onRestoreAll={onRestoreAll}
        onToggleSubtitles={onToggleSubtitles}
        onCancelTranscription={onCancelTranscription}
      />

      <div>
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
    </div>
  )
}
