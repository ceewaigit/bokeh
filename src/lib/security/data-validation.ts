/**
 * Data Validation - Simple security fixes
 */

import type { Project, RecordingSettings, TimelineClip } from '@/types'

export function validateProject(project: any): project is Project {
  if (!project || typeof project !== 'object') {
    return false
  }

  return (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    Array.isArray(project.clips) &&
    Array.isArray(project.animations) &&
    project.settings &&
    validateRecordingSettings(project.settings)
  )
}

export function parseProjectData(data: string): Project[] {
  if (!data) return []
  
  try {
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(validateProject)
  } catch {
    return []
  }
}

export function validateRecordingSettings(settings: any): settings is RecordingSettings {
  if (!settings) return false
  return ['fullscreen', 'window', 'region'].includes(settings.area) &&
    ['system', 'microphone', 'both', 'none'].includes(settings.audioInput) &&
    ['high', 'medium', 'low'].includes(settings.quality) &&
    [30, 60].includes(settings.framerate) &&
    ['mp4', 'mov', 'webm'].includes(settings.format)
}

export function validateTimelineClip(clip: any): clip is TimelineClip {
  if (!clip || typeof clip !== 'object') {
    return false
  }
  
  return (
    typeof clip.id === 'string' &&
    typeof clip.name === 'string' &&
    typeof clip.source === 'string' &&
    ['video', 'audio', 'image'].includes(clip.type) &&
    typeof clip.startTime === 'number' && clip.startTime >= 0 &&
    typeof clip.duration === 'number' && clip.duration > 0 &&
    typeof clip.trackIndex === 'number' && clip.trackIndex >= 0
  )
}

export function sanitizeProjectName(name: string): string {
  if (!name) return 'Untitled Project'
  return name.replace(/<[^>]*>/g, '').trim() || 'Untitled Project'
}