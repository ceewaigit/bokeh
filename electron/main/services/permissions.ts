import { systemPreferences } from 'electron'

declare global {
  var screenRecordingPermission: string
}

export async function checkMediaPermissions(): Promise<void> {
  if (process.platform === 'darwin') {
    try {
      console.log('🔐 Checking macOS media permissions...')

      // Screen recording permission (required for both video and system audio)
      const screenStatus = systemPreferences.getMediaAccessStatus('screen')
      console.log('🖥️ Screen recording permission:', screenStatus)

      if (screenStatus !== 'granted') {
        console.log('⚠️ Screen recording permission not granted')
        console.log('📝 Note: Screen recording permission is required for both video AND system audio capture')
        global.screenRecordingPermission = screenStatus
        console.log('📝 Will show permission guide to user after window loads')
      } else {
        global.screenRecordingPermission = 'granted'
        console.log('✅ System audio capture enabled via screen recording permission')
      }

      // Microphone permission (for voice recording)
      try {
        const microphoneStatus = await systemPreferences.askForMediaAccess('microphone')
        console.log('🎤 Microphone permission:', microphoneStatus ? 'granted' : 'denied')
      } catch (e: any) {
        console.log('🎤 Microphone permission check skipped:', e.message)
      }

    } catch (error) {
      console.error('❌ Error checking media permissions:', error)
      global.screenRecordingPermission = 'unknown'
    }
  } else {
    global.screenRecordingPermission = 'granted'
  }
}