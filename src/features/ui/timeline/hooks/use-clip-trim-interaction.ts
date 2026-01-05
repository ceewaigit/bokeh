import { useState, useRef, useCallback } from 'react'
import Konva from 'konva'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import type { Clip, Recording } from '@/types/project'

// Minimum clip duration in milliseconds
const MIN_CLIP_DURATION_MS = 1000

interface UseClipTrimInteractionProps {
    clip: Clip
    recording: Recording | undefined
    otherClipsInTrack: Clip[]
    pixelsPerMs: number
    onTrimStart?: (clipId: string, newStartTime: number) => void
    onTrimEnd?: (clipId: string, newEndTime: number) => void
}

interface TrimState {
    startTime: number
    endTime: number
    mouseX: number
    minStartTime: number
    maxEndTime: number
}

export function useClipTrimInteraction({
    clip,
    recording,
    otherClipsInTrack,
    pixelsPerMs,
    onTrimStart,
    onTrimEnd
}: UseClipTrimInteractionProps) {
    const [trimEdge, setTrimEdge] = useState<'left' | 'right' | null>(null)
    const [trimPreview, setTrimPreview] = useState<{ startTime: number; endTime: number } | null>(null)

    const trimStartRef = useRef<TrimState | null>(null)

    // Calculate trim boundaries based on source material and locked bounds
    const getTrimBoundaries = useCallback(() => {
        const playbackRate = clip.playbackRate || 1
        const recordingDuration = recording?.duration || 0

        // Use locked bounds if set, otherwise full recording range
        const effectiveMinSource = clip.lockedSourceIn ?? 0
        const effectiveMaxSource = clip.lockedSourceOut ?? recordingDuration

        // Source space constraints - limited by locked bounds
        const sourceExpandLeft = (clip.sourceIn - effectiveMinSource) / playbackRate
        const sourceExpandRight = (effectiveMaxSource - clip.sourceOut) / playbackRate

        // Find previous clip - we can't push clips left (would go negative), so this is a hard limit
        const sortedClips = [...otherClipsInTrack].filter(c => c.id !== clip.id).sort((a, b) => a.startTime - b.startTime)
        const prevClip = sortedClips.filter(c => c.startTime + c.duration <= clip.startTime).pop()

        // Left edge: constrained by previous clip AND source material (respecting locked bounds)
        const minStartTime = Math.max(
            prevClip ? prevClip.startTime + prevClip.duration : 0,
            clip.startTime - sourceExpandLeft
        )

        // Right edge: constrained by source material respecting locked bounds (subsequent clips will be pushed)
        const maxEndTime = clip.startTime + clip.duration + sourceExpandRight

        return { minStartTime, maxEndTime }
    }, [clip, recording, otherClipsInTrack])

    const handleTrimMouseDown = useCallback((edge: 'left' | 'right', e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true // Stop propagation to prevent clip drag
        setTrimEdge(edge)

        const boundaries = getTrimBoundaries()
        const initialState = {
            startTime: clip.startTime,
            endTime: clip.startTime + clip.duration,
            mouseX: e.evt.clientX,
            minStartTime: boundaries.minStartTime,
            maxEndTime: boundaries.maxEndTime
        }
        trimStartRef.current = initialState
        setTrimPreview({ startTime: initialState.startTime, endTime: initialState.endTime })

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!trimStartRef.current) return

            const deltaX = moveEvent.clientX - trimStartRef.current.mouseX
            const deltaMs = TimeConverter.pixelsToMs(deltaX, pixelsPerMs)

            if (edge === 'left') {
                // Trim start: moving right makes clip shorter, left makes it longer
                let newStartTime = trimStartRef.current.startTime + deltaMs

                // Enforce minimum duration
                const maxStartTime = trimStartRef.current.endTime - MIN_CLIP_DURATION_MS
                newStartTime = Math.min(newStartTime, maxStartTime)

                // Can't go before minimum (previous clip or source boundary)
                newStartTime = Math.max(trimStartRef.current.minStartTime, newStartTime)

                // Update visual preview in real-time
                setTrimPreview({ startTime: newStartTime, endTime: trimStartRef.current.endTime })
            } else {
                // Trim end: moving right makes clip longer, left makes it shorter
                let newEndTime = trimStartRef.current.endTime + deltaMs

                // Enforce minimum duration
                const minEndTime = trimStartRef.current.startTime + MIN_CLIP_DURATION_MS
                newEndTime = Math.max(newEndTime, minEndTime)

                // Can't go past maximum (next clip or source boundary)
                newEndTime = Math.min(trimStartRef.current.maxEndTime, newEndTime)

                // Update visual preview in real-time
                setTrimPreview({ startTime: trimStartRef.current.startTime, endTime: newEndTime })
            }
        }

        const handleMouseUp = (upEvent: MouseEvent) => {
            if (!trimStartRef.current) return

            const deltaX = upEvent.clientX - trimStartRef.current.mouseX
            const deltaMs = TimeConverter.pixelsToMs(deltaX, pixelsPerMs)

            if (edge === 'left') {
                let newStartTime = trimStartRef.current.startTime + deltaMs
                const maxStartTime = trimStartRef.current.endTime - MIN_CLIP_DURATION_MS
                newStartTime = Math.min(newStartTime, maxStartTime)
                newStartTime = Math.max(trimStartRef.current.minStartTime, newStartTime)

                if (newStartTime !== trimStartRef.current.startTime) {
                    onTrimStart?.(clip.id, newStartTime)
                }
            } else {
                let newEndTime = trimStartRef.current.endTime + deltaMs
                const minEndTime = trimStartRef.current.startTime + MIN_CLIP_DURATION_MS
                newEndTime = Math.max(newEndTime, minEndTime)
                newEndTime = Math.min(trimStartRef.current.maxEndTime, newEndTime)

                if (newEndTime !== trimStartRef.current.endTime) {
                    onTrimEnd?.(clip.id, newEndTime)
                }
            }

            setTrimEdge(null)
            setTrimPreview(null)
            trimStartRef.current = null
            document.body.style.cursor = 'default'

            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [clip.id, clip.startTime, clip.duration, pixelsPerMs, onTrimStart, onTrimEnd, getTrimBoundaries])

    return {
        trimEdge,
        trimPreview,
        handleTrimMouseDown,
        getTrimBoundaries
    }
}
