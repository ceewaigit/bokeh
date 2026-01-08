import { DEFAULT_BACKGROUND_DATA } from './config'

// Store for default wallpaper once loaded
let defaultWallpaper: string | undefined = undefined
let wallpaperInitialized = false

export function setDefaultWallpaper(wallpaper: string) {
    defaultWallpaper = wallpaper
    DEFAULT_BACKGROUND_DATA.wallpaper = wallpaper
}

export function getDefaultWallpaper(): string | undefined {
    return defaultWallpaper
}

// Initialize default wallpaper on app startup
export async function initializeDefaultWallpaper() {
    // Skip if already initialized
    if (wallpaperInitialized) return

    try {
        // If running in Electron, try to load the default wallpaper from preinstalled wallpapers
        if (typeof window !== 'undefined' && window.electronAPI?.listPreinstalledWallpapers && window.electronAPI?.loadImageAsDataUrl) {
            const wallpapers = await window.electronAPI.listPreinstalledWallpapers()
            const wallpaper1 = wallpapers.find(w => w.name === 'Wallpaper 1')
            if (wallpaper1?.absolutePath) {
                const dataUrl = await window.electronAPI.loadImageAsDataUrl(wallpaper1.absolutePath)
                if (dataUrl) {
                    setDefaultWallpaper(dataUrl)
                }
            }
            wallpaperInitialized = true
        }
    } catch (err) {
        console.error('Failed to initialize default wallpaper:', err)
    }
}
