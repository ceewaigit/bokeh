import { BrowserWindow } from 'electron'

export function enableCaptureProtection(window: BrowserWindow, label?: string): void {
  try {
    // NOTE: This blocks macOS built-in screen recording (QuickTime/Control Center) from capturing the app.
    // Temporarily disable to record Bokeh with external tools.
    // window.setContentProtection(true)
  } catch (error) {
    const name = label ? ` (${label})` : ''
    console.warn(`[CaptureProtection] Failed to enable${name}:`, error)
  }
}
