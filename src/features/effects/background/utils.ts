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
        // If running in Electron, try to load the default wallpaper
        if (typeof window !== 'undefined' && window.electronAPI?.loadWallpaperImage) {
            const dataUrl = await window.electronAPI.loadWallpaperImage('/System/Library/Desktop Pictures/Sonoma.heic')
            if (dataUrl) {
                setDefaultWallpaper(dataUrl)
            }
            wallpaperInitialized = true
        }
    } catch (err) {
        console.error('Failed to initialize default wallpaper:', err)
    }
}
