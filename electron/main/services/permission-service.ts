import { systemPreferences, BrowserWindow, shell } from 'electron'
import { exec } from 'child_process'

export class PermissionService {
    private static instance: PermissionService
    private checkInterval: NodeJS.Timeout | null = null
    private _screenRecordingGranted: boolean = false
    private _microphoneGranted: boolean = false
    private _mockPermissions: { screen?: boolean; microphone?: boolean } = {}

    private constructor() {
        this.checkInitialPermissions()
    }

    public static getInstance(): PermissionService {
        if (!PermissionService.instance) {
            PermissionService.instance = new PermissionService()
        }
        return PermissionService.instance
    }

    private checkInitialPermissions() {
        if (process.platform === 'darwin') {
            const status = systemPreferences.getMediaAccessStatus('screen')
            this._screenRecordingGranted = status === 'granted'

            const micStatus = systemPreferences.getMediaAccessStatus('microphone')
            this._microphoneGranted = micStatus === 'granted'

            console.log('🔐 PermissionService initialized. Screen:', status, 'Mic:', micStatus)
        } else {
            this._screenRecordingGranted = true
            this._microphoneGranted = true
        }
    }

    public get isScreenRecordingGranted(): boolean {
        return this._mockPermissions.screen ?? this._screenRecordingGranted
    }

    public get isMicrophoneGranted(): boolean {
        return this._mockPermissions.microphone ?? this._microphoneGranted
    }

    public setMockPermissions(permissions: { screen?: boolean; microphone?: boolean }) {
        this._mockPermissions = { ...this._mockPermissions, ...permissions }
        console.log('🔧 Mock permissions updated:', this._mockPermissions)

        // Broadcast change to all windows
        const result = {
            screen: this.checkScreenRecordingPermission(),
            microphone: { status: this.isMicrophoneGranted ? 'granted' : 'denied', granted: this.isMicrophoneGranted }
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
                    exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"')
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
            // Using exec with 'open' command is often more reliable for custom URL schemes on macOS
            exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"')

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

    public startMonitoring(sender: Electron.WebContents) {
        if (process.platform !== 'darwin') return

        this.stopMonitoring() // Clear existing interval if any

        console.log('📊 Started monitoring screen recording permission')
        this.checkInterval = setInterval(async () => {
            try {
                const screenResult = this.checkScreenRecordingPermission()
                const micResult = await this.checkMicrophonePermission()

                // Send consolidated status
                sender.send('permission-status-changed', {
                    screen: screenResult,
                    microphone: micResult
                })

                if (screenResult.granted && micResult.granted) {
                    // console.log('✅ All permissions granted during monitoring')
                }
            } catch (error) {
                console.error('Error checking permission status:', error)
            }
        }, 1000)
    }

    public stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
            console.log('🛑 Stopped monitoring screen recording permission')
        }
    }
}
