import type { RecordingSettings, SessionSettings } from '@/types'
import type { StoreSettings } from '@/stores/slices/types'

export function buildRecordingSettings(
  session: SessionSettings,
  projectSettings: StoreSettings
): RecordingSettings {
  if (!session.sourceId) {
    throw new Error('Recording source is missing')
  }

  const framerate = projectSettings.framerate as 30 | 60
  if (framerate !== 30 && framerate !== 60) {
    throw new Error(`Unsupported recording framerate: ${projectSettings.framerate}`)
  }

  return {
    ...session,
    quality: projectSettings.quality,
    framerate,
    format: projectSettings.format,
    lowMemoryEncoder: projectSettings.recording.lowMemoryEncoder,
    useMacOSDefaults: projectSettings.recording.useMacOSDefaults,
    includeAppWindows: projectSettings.recording.includeAppWindows
  }
}
