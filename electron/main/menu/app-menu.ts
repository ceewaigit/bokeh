import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { isDev } from '../config'

type MenuActions = {
  openWorkspace: () => void
  openSettings: () => void
  showRecordButton: () => void
  toggleTeleprompter: () => void
}

type MenuRole = NonNullable<MenuItemConstructorOptions['role']>

function role(role: MenuRole, overrides?: Omit<MenuItemConstructorOptions, 'role'>): MenuItemConstructorOptions {
  return { role, ...(overrides ?? {}) }
}

function separator(): MenuItemConstructorOptions {
  return { type: 'separator' }
}

function focusAnyWindow(): void {
  const win = BrowserWindow.getAllWindows().find(w => w.isVisible()) ?? BrowserWindow.getFocusedWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function installAppMenu(actions: MenuActions): void {
  const isMac = process.platform === 'darwin'

  if (isMac) {
    app.setAboutPanelOptions({
      applicationName: app.getName(),
      applicationVersion: app.getVersion(),
      // Avoid showing Electron's version in parentheses on macOS.
      version: process.env.BOKEH_BUILD_VERSION || (app.isPackaged ? '1' : 'dev'),
      copyright: `© ${new Date().getFullYear()} Bokeh`,
      credits:
        'Bokeh is a local-first screen recorder and editor.\n' +
        'Record your screen, polish clips, and export high-quality video.\n\n'
    })
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
        {
          label: app.getName(),
          submenu: [
            role('about'),
            separator(),
            { label: 'Settings…', accelerator: 'Command+,', click: actions.openSettings },
            separator(),
            role('services'),
            separator(),
            role('hide'),
            role('hideOthers'),
            role('unhide'),
            separator(),
            role('quit'),
          ],
        },
      ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Recording Library', accelerator: isMac ? 'Command+O' : 'Ctrl+O', click: actions.openWorkspace },
        separator(),
        ...(isMac ? [role('close')] : []),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        role('undo'),
        role('redo'),
        separator(),
        role('cut'),
        role('copy'),
        role('paste'),
        role('pasteAndMatchStyle'),
        role('delete'),
        role('selectAll'),
        ...(isMac
          ? [
            separator(),
            role('startSpeaking'),
            role('stopSpeaking'),
          ]
          : []),
      ],
    },
    {
      label: 'View',
      submenu: [
        role('resetZoom'),
        role('zoomIn'),
        role('zoomOut'),
        separator(),
        role('togglefullscreen'),
        ...(isDev ? [role('toggleDevTools')] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        role('minimize'),
        ...(isMac ? [role('zoom')] : []),
        separator(),
        { label: 'Show Recorder', click: actions.showRecordButton },
        { label: 'Toggle Teleprompter', accelerator: isMac ? 'Command+Shift+T' : 'Ctrl+Shift+T', click: actions.toggleTeleprompter },
        separator(),
        role('front'),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Focus Window', click: focusAnyWindow },
        ...(isDev
          ? [
            separator(),
            { label: 'Open DevTools', click: () => BrowserWindow.getFocusedWindow()?.webContents.openDevTools({ mode: 'detach' }) },
          ]
          : []),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  if (isMac && app.dock) {
    const dockTemplate: MenuItemConstructorOptions[] = [
      { label: 'Recording Library', click: actions.openWorkspace },
      { label: 'Settings…', click: actions.openSettings },
      separator(),
      { label: 'Show Recorder', click: actions.showRecordButton },
      { label: 'Toggle Teleprompter', click: actions.toggleTeleprompter },
    ]
    app.dock.setMenu(Menu.buildFromTemplate(dockTemplate))
  }
}
