import { BrowserWindow, Menu, clipboard, type MenuItemConstructorOptions, shell } from 'electron'
import { isDev } from '../config'

export function installNativeContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = []

    if (params.isEditable) {
      template.push(
        { role: 'undo', enabled: params.editFlags.canUndo },
        { role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { role: 'pasteAndMatchStyle', enabled: params.editFlags.canPaste },
        { role: 'selectAll' }
      )
    } else if (params.selectionText) {
      template.push({ role: 'copy' })
    }

    if (params.linkURL) {
      if (template.length) template.push({ type: 'separator' })
      template.push(
        { label: 'Open Link', click: () => void shell.openExternal(params.linkURL) },
        { label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) }
      )
    }

    if (isDev) {
      if (template.length) template.push({ type: 'separator' })
      template.push({
        label: 'Inspect Element',
        click: () => {
          window.webContents.inspectElement(params.x, params.y)
          window.webContents.openDevTools({ mode: 'detach' })
        },
      })
    }

    if (!template.length) return
    Menu.buildFromTemplate(template).popup({ window })
  })
}
