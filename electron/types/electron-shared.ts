/**
 * Shared Electron types used by both main and preload processes
 */

export interface MouseTrackingOptions {
  intervalMs?: number
  sourceType?: 'screen' | 'window'
  sourceId?: string
}

export interface MousePosition {
  x: number
  y: number
  timestamp?: number
}

export interface DesktopSourceOptions {
  types?: string[]
  thumbnailSize?: { width: number; height: number }
}

export interface DesktopSource {
  id: string
  name: string
  display_id?: number
  thumbnail?: string
  displayInfo?: {
    id: number
    isPrimary: boolean
    isInternal: boolean
    bounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
  }
}

export interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning'
  buttons?: string[]
  defaultId?: number
  title?: string
  message: string
  detail?: string
  checkboxLabel?: string
  checkboxChecked?: boolean
  cancelId?: number
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{ name: string; extensions: string[] }>
  message?: string
  nameFieldLabel?: string
  showsTagField?: boolean
}

export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{ name: string; extensions: string[] }>
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>
}