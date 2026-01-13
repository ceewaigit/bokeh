/**
 * Recording Save Service
 *
 * Handles the persistence of recording results to disk and store updates.
 * Extracted from useRecording hook to separate concerns.
 */

import { ProjectStorage } from '@/features/core/storage/project-storage'
import { useProjectStore } from '@/features/core/stores/project-store'
import { logger } from '@/shared/utils/logger'
import type { ExtendedRecordingResult } from '@/features/media/recording/services/recording-service'

/**
 * Generate a timestamped project name for a new recording
 */
function generateProjectName(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `Recording_${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

/**
 * Cache a video URL for a recording ID
 */
async function cacheVideoUrl(recordingId: string, videoPath: string): Promise<void> {
  if (!window.electronAPI?.getVideoUrl) return

  const videoUrl = await window.electronAPI.getVideoUrl(videoPath)
  if (videoUrl) {
    ProjectStorage.setBlobUrl(recordingId, videoUrl)
  }
}

/**
 * Save a recording result and update the project store
 *
 * @param result - The recording result from RecordingService.stop()
 * @returns true if saved successfully, false otherwise
 */
export async function saveRecordingResult(result: ExtendedRecordingResult): Promise<boolean> {
  if (!result.videoPath) {
    logger.warn('No video path in recording result - skipping save')
    return false
  }

  const projectName = generateProjectName()

  // Save recording with project using consolidated function
  const saved = await ProjectStorage.saveRecordingWithProject(
    result.videoPath,
    result.metadata,
    projectName,
    result.captureArea,
    result.hasAudio,
    result.duration,
    result.webcam,
    result.microphoneAudio
  )

  if (!saved) {
    logger.error('Failed to save recording with project')
    return false
  }

  logger.info(`Recording saved: video=${saved.videoPath}, project=${saved.projectPath}`)

  // Update the project store
  useProjectStore.getState().setProject(saved.project)

  // Cache video URLs for preview
  const mainRecording = saved.project.recordings[0]
  if (mainRecording) {
    await cacheVideoUrl(mainRecording.id, result.videoPath)
  }

  // Cache webcam video URLs if present (supports multiple segments)
  const webcamRecordings = saved.project.recordings.filter(r => r.id.startsWith('webcam-'))
  for (const webcamRecording of webcamRecordings) {
    if (webcamRecording.folderPath && webcamRecording.filePath) {
      const webcamPath = `${webcamRecording.folderPath}/${webcamRecording.filePath.split('/').pop()}`
      await cacheVideoUrl(webcamRecording.id, webcamPath)
    }
  }

  // Cache microphone audio URL if present
  if (saved.audioPath) {
    const audioRecording = saved.project.recordings.find(r => r.id.startsWith('audio-'))
    if (audioRecording) {
      await cacheVideoUrl(audioRecording.id, saved.audioPath)
    }
  }

  return true
}
