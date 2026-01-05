/**
 * useClipWaveform - Hook for loading audio waveform data for a clip
 * 
 * Extracted from timeline-clip.tsx for better separation of concerns.
 */

import { useEffect, useState } from 'react'
import type { Recording } from '@/types/project'
import { RecordingStorage } from '@/features/core/storage/recording-storage'
import { globalBlobManager } from '@/shared/security/blob-url-manager'
import { WaveformAnalyzer, type WaveformData } from '@/features/media/audio/waveform-analyzer'

interface UseClipWaveformOptions {
    clipId: string
    recording: Recording | null | undefined
    sourceIn: number
    sourceOut: number
    samplesPerSecond?: number
}

/**
 * Loads and manages audio waveform data for a timeline clip.
 * Returns null if the clip has no audio or loading fails.
 */
export function useClipWaveform({
    clipId,
    recording,
    sourceIn,
    sourceOut,
    samplesPerSecond = 50,
}: UseClipWaveformOptions): WaveformData | null {
    const [waveformData, setWaveformData] = useState<WaveformData | null>(null)

    useEffect(() => {
        if (!recording?.hasAudio || !recording?.filePath) {
            setWaveformData(null)
            return
        }

        let cancelled = false

        const loadWaveform = async () => {
            // Get or load video URL
            let blobUrl = RecordingStorage.getBlobUrl(recording.id)
            if (!blobUrl && recording.filePath) {
                blobUrl = await globalBlobManager.loadVideos({
                    id: recording.id,
                    filePath: recording.filePath,
                    folderPath: recording.folderPath
                })
            }

            if (!blobUrl || cancelled) return

            // Analyze audio and extract waveform
            const waveform = await WaveformAnalyzer.analyzeAudio(
                blobUrl,
                clipId,
                sourceIn,
                sourceOut - sourceIn,
                samplesPerSecond
            )

            if (!cancelled && waveform) {
                setWaveformData(waveform)
            }
        }

        loadWaveform()

        return () => {
            cancelled = true
        }
    }, [
        recording?.id,
        recording?.filePath,
        recording?.folderPath,
        recording?.hasAudio,
        clipId,
        sourceIn,
        sourceOut,
        samplesPerSecond,
    ])

    return waveformData
}
