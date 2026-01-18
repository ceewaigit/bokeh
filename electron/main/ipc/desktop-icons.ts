/**
 * IPC handlers for macOS desktop icon and widget visibility.
 * Allows hiding desktop icons during screen recordings.
 */

import { ipcMain, app } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { assertTrustedIpcSender } from '../utils/ipc-security'

const execAsync = promisify(exec)

// Track if we hid desktop icons so we can restore them
let desktopIconsHiddenByApp = false

export function registerDesktopIconHandlers(): void {
  // Desktop icons and widgets visibility handlers (macOS only)
  ipcMain.handle('hide-desktop-icons', async (event) => {
    assertTrustedIpcSender(event, 'hide-desktop-icons')
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Only supported on macOS' }
    }

    try {
      // Hide desktop icons by setting CreateDesktop to false
      await execAsync('defaults write com.apple.finder CreateDesktop false')

      // Hide desktop widgets (macOS Sonoma+)
      await execAsync('defaults write com.apple.WindowManager StandardHideWidgets -bool true')
      await execAsync('defaults write com.apple.WindowManager StageManagerHideWidgets -bool true')

      // Close all Finder windows first to prevent them from reopening
      await execAsync('osascript -e \'tell application "Finder" to close every window\'').catch(() => { })

      // Restart Finder and Dock to apply changes
      await execAsync('killall Finder')
      await execAsync('killall Dock')

      desktopIconsHiddenByApp = true
      console.log('[DesktopIcons] Desktop icons and widgets hidden')
      return { success: true }
    } catch (error) {
      console.error('[DesktopIcons] Failed to hide desktop icons/widgets:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('show-desktop-icons', async (event) => {
    assertTrustedIpcSender(event, 'show-desktop-icons')
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Only supported on macOS' }
    }

    try {
      // Show desktop icons by setting CreateDesktop to true
      await execAsync('defaults write com.apple.finder CreateDesktop true')

      // Show desktop widgets (macOS Sonoma+)
      await execAsync('defaults write com.apple.WindowManager StandardHideWidgets -bool false')
      await execAsync('defaults write com.apple.WindowManager StageManagerHideWidgets -bool false')

      // Close all Finder windows first to prevent them from reopening
      await execAsync('osascript -e \'tell application "Finder" to close every window\'').catch(() => { })

      // Restart Finder and Dock to apply changes
      await execAsync('killall Finder')
      await execAsync('killall Dock')

      desktopIconsHiddenByApp = false
      console.log('[DesktopIcons] Desktop icons and widgets shown')
      return { success: true }
    } catch (error) {
      console.error('[DesktopIcons] Failed to show desktop icons/widgets:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Restore desktop icons and widgets when the app quits (if we hid them)
  app.on('before-quit', async () => {
    if (desktopIconsHiddenByApp) {
      try {
        await execAsync('defaults write com.apple.finder CreateDesktop true')
        await execAsync('defaults write com.apple.WindowManager StandardHideWidgets -bool false')
        await execAsync('defaults write com.apple.WindowManager StageManagerHideWidgets -bool false')
        await execAsync('osascript -e \'tell application "Finder" to close every window\'').catch(() => { })
        await execAsync('killall Finder')
        await execAsync('killall Dock')
        console.log('[DesktopIcons] Desktop icons and widgets restored on app quit')
      } catch (error) {
        console.error('[DesktopIcons] Failed to restore desktop icons/widgets on quit:', error)
      }
    }
  })
}
