import type { RecordingSettings, SessionSettings, ProjectSettings } from '@/types'
import type { StoreSettings } from '@/features/core/stores/slices/types'

export function buildRecordingSettings(
  session: SessionSettings,
  projectSettings: ProjectSettings,
  uiSettings: StoreSettings
): RecordingSettings {
  if (!session.sourceId) {
    throw new Error('Recording source is missing')
  }

  const framerate = projectSettings.frameRate as 30 | 60
  if (framerate !== 30 && framerate !== 60) {
    throw new Error(`Unsupported recording framerate: ${projectSettings.frameRate}`)
  }

  return {
    ...session,
    quality: uiSettings.quality,
    framerate,
    format: uiSettings.format,
    lowMemoryEncoder: uiSettings.recording.lowMemoryEncoder,
    useMacOSDefaults: uiSettings.recording.useMacOSDefaults,
    includeAppWindows: uiSettings.recording.includeAppWindows
  }
}
