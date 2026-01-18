import { systemPreferences, BrowserWindow } from 'electron'
import { execFile } from 'child_process'

declare global {
    var screenRecordingPermission: string
}

export class PermissionService {
    private static instance: PermissionService
    private checkInterval: NodeJS.Timeout | null = null
    private monitoringInFlight: boolean = false
    private _screenRecordingGranted: boolean = false
    private _microphoneGranted: boolean = false
    private _cameraGranted: boolean = false
    private _mockPermissions: { screen?: boolean; microphone?: boolean; camera?: boolean } = {}

    private constructor() {
        this.refreshCachedPermissions()
    }

    public static getInstance(): PermissionService {
        if (!PermissionService.instance) {
            PermissionService.instance = new PermissionService()
        }
        return PermissionService.instance
    }

    private refreshCachedPermissions() {
        if (process.platform === 'darwin') {
            const status = systemPreferences.getMediaAccessStatus('screen')
            this._screenRecordingGranted = status === 'granted'

            const micStatus = systemPreferences.getMediaAccessStatus('microphone')
            this._microphoneGranted = micStatus === 'granted'

            const camStatus = systemPreferences.getMediaAccessStatus('camera')
            this._cameraGranted = camStatus === 'granted'

            console.log('🔐 PermissionService initialized. Screen:', status, 'Mic:', micStatus, 'Camera:', camStatus)
        } else {
            this._screenRecordingGranted = true
            this._microphoneGranted = true
            this._cameraGranted = true
        }
    }

    public async checkInitialPermissions(): Promise<void> {
        if (process.platform === 'darwin') {
            try {
                console.log('🔐 Checking macOS media permissions...')

                const screenStatus = systemPreferences.getMediaAccessStatus('screen')
                this._screenRecordingGranted = screenStatus === 'granted'
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

                try {
                    const microphoneGranted = await systemPreferences.askForMediaAccess('microphone')
                    this._microphoneGranted = microphoneGranted
                    console.log('🎤 Microphone permission:', microphoneGranted ? 'granted' : 'denied')
                } catch (e: any) {
                    console.log('🎤 Microphone permission check skipped:', e.message)
                }

                const micStatus = systemPreferences.getMediaAccessStatus('microphone')
                this._microphoneGranted = micStatus === 'granted'

                const camStatus = systemPreferences.getMediaAccessStatus('camera')
                this._cameraGranted = camStatus === 'granted'
            } catch (error) {
                console.error('❌ Error checking media permissions:', error)
                global.screenRecordingPermission = 'unknown'
            }
        } else {
            this._screenRecordingGranted = true
            this._microphoneGranted = true
            this._cameraGranted = true
            global.screenRecordingPermission = 'granted'
        }
    }

    public get isScreenRecordingGranted(): boolean {
        return this._mockPermissions.screen ?? this._screenRecordingGranted
    }

    public get isMicrophoneGranted(): boolean {
        return this._mockPermissions.microphone ?? this._microphoneGranted
    }

    public get isCameraGranted(): boolean {
        return this._mockPermissions.camera ?? this._cameraGranted
    }

    public setMockPermissions(permissions: { screen?: boolean; microphone?: boolean; camera?: boolean }) {
        this._mockPermissions = { ...this._mockPermissions, ...permissions }
        console.log('🔧 Mock permissions updated:', this._mockPermissions)

        // Broadcast change to all windows
        const result = {
            screen: this.checkScreenRecordingPermission(),
            microphone: { status: this.isMicrophoneGranted ? 'granted' : 'denied', granted: this.isMicrophoneGranted },
            camera: { status: this.isCameraGranted ? 'granted' : 'denied', granted: this.isCameraGranted }
        }

        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('permission-status-changed', result)
        })
    }

    public checkScreenRecordingPermission(): { status: string; granted: boolean } {
        if (this._mockPermissions.screen !== undefined) {
            return {
                status: this._mockPermissions.screen ? 'granted' : 'denied',
                granted: this._mockPermissions.screen
            }
        }

        if (process.platform !== 'darwin') {
            return { status: 'not-applicable', granted: true }
        }

        try {
            const status = systemPreferences.getMediaAccessStatus('screen')
            this._screenRecordingGranted = status === 'granted'
            return { status, granted: this._screenRecordingGranted }
        } catch (error) {
            console.error('❌ Error checking screen recording permission:', error)
            return { status: 'unknown', granted: false }
        }
    }

    public async checkMicrophonePermission(): Promise<{ status: string; granted: boolean }> {
        if (this._mockPermissions.microphone !== undefined) {
            return {
                status: this._mockPermissions.microphone ? 'granted' : 'denied',
                granted: this._mockPermissions.microphone
            }
        }

        if (process.platform !== 'darwin') {
            return { status: 'not-applicable', granted: true }
        }

        try {
            const status = systemPreferences.getMediaAccessStatus('microphone')
            this._microphoneGranted = status === 'granted'
            return { status, granted: this._microphoneGranted }
        } catch (error) {
            console.error('❌ Error checking microphone permission:', error)
            return { status: 'unknown', granted: false }
        }
    }

    public async requestScreenRecordingPermission(): Promise<{ opened: boolean; status: string; granted: boolean }> {
        // If mocked, we simulate a successful "open" but the grant status depends on the mock
        if (this._mockPermissions.screen !== undefined) {
            // Even if mocked, we try to open the settings if on macOS so the button "works"
            if (process.platform === 'darwin') {
                try {
                    console.log('🔐 [MOCK] Opening System Preferences for screen recording permission')
                    execFile('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'])
                } catch (e) {
                    console.error('Failed to open settings in mock mode:', e)
                }
            }

            return {
                opened: true,
                status: this._mockPermissions.screen ? 'granted' : 'denied',
                granted: this._mockPermissions.screen
            }
        }

        if (process.platform !== 'darwin') {
            return { opened: false, status: 'not-applicable', granted: true }
        }

        try {
            console.log('🔐 Opening System Preferences for screen recording permission')
            // Using execFile with 'open' command for custom URL schemes on macOS
            execFile('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'])

            // Re-check status immediately
            const result = this.checkScreenRecordingPermission()
            return { opened: true, ...result }
        } catch (error) {
            console.error('❌ Error opening System Preferences:', error)
            return { opened: false, status: 'unknown', granted: false }
        }
    }

    public async requestMicrophonePermission(): Promise<{ status: string; granted: boolean }> {
        if (this._mockPermissions.microphone !== undefined) {
            return {
                status: this._mockPermissions.microphone ? 'granted' : 'denied',
                granted: this._mockPermissions.microphone
            }
        }

        if (process.platform !== 'darwin') {
            return { status: 'not-applicable', granted: true }
        }

        try {
            console.log('🎤 Requesting microphone permission...')
            const granted = await systemPreferences.askForMediaAccess('microphone')
            this._microphoneGranted = granted
            const status = systemPreferences.getMediaAccessStatus('microphone')
            return { status, granted }
        } catch (error) {
            console.error('❌ Error requesting microphone permission:', error)
            return { status: 'unknown', granted: false }
        }
    }

    public async checkCameraPermission(): Promise<{ status: string; granted: boolean }> {
        if (this._mockPermissions.camera !== undefined) {
            return {
                status: this._mockPermissions.camera ? 'granted' : 'denied',
                granted: this._mockPermissions.camera
            }
        }

        if (process.platform !== 'darwin') {
            return { status: 'not-applicable', granted: true }
        }

        try {
            const status = systemPreferences.getMediaAccessStatus('camera')
            this._cameraGranted = status === 'granted'
            return { status, granted: this._cameraGranted }
        } catch (error) {
            console.error('❌ Error checking camera permission:', error)
            return { status: 'unknown', granted: false }
        }
    }

    public async requestCameraPermission(): Promise<{ status: string; granted: boolean }> {
        if (this._mockPermissions.camera !== undefined) {
            return {
                status: this._mockPermissions.camera ? 'granted' : 'denied',
                granted: this._mockPermissions.camera
            }
        }

        if (process.platform !== 'darwin') {
            return { status: 'not-applicable', granted: true }
        }

        try {
            console.log('📷 Requesting camera permission...')
            const granted = await systemPreferences.askForMediaAccess('camera')
            this._cameraGranted = granted
            const status = systemPreferences.getMediaAccessStatus('camera')
            return { status, granted }
        } catch (error) {
            console.error('❌ Error requesting camera permission:', error)
            return { status: 'unknown', granted: false }
        }
    }

    public openMediaPrivacySettings(type: 'screen' | 'microphone' | 'camera') {
        if (process.platform !== 'darwin') return

        const urls = {
            screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
            microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
            camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'
        }

        const url = urls[type]
        if (url) {
            console.log(`🔐 Opening System Preferences for ${type} permission`)
            execFile('open', [url])
        }
    }

    public startMonitoring(sender: Electron.WebContents) {
        if (process.platform !== 'darwin') return

        this.stopMonitoring() // Clear existing interval if any

        console.log('📊 Started monitoring screen recording permission')
        const pollPermissions = async () => {
            const screenResult = this.checkScreenRecordingPermission()
            const micResult = await this.checkMicrophonePermission()
            const camResult = await this.checkCameraPermission()

            // Send consolidated status
            sender.send('permission-status-changed', {
                screen: screenResult,
                microphone: micResult,
                camera: camResult
            })

            if (screenResult.granted && micResult.granted && camResult.granted) {
                // console.log('✅ All permissions granted during monitoring')
            }
        }

        this.checkInterval = setInterval(() => {
            if (this.monitoringInFlight) return
            this.monitoringInFlight = true
            pollPermissions()
                .catch(error => {
                    console.error('Error checking permission status:', error)
                })
                .finally(() => {
                    this.monitoringInFlight = false
                })
        }, 1000)
    }

    public stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
            this.monitoringInFlight = false
            console.log('🛑 Stopped monitoring screen recording permission')
        }
    }
}
