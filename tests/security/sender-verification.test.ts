/**
 * Sender Verification Tests
 *
 * These tests verify that IPC handlers properly block untrusted senders.
 * Tests call actual handler code with mock events to verify security.
 */

import {
  createMockEvent,
  createUntrustedMockEvent,
  createTrustedMockEvent,
} from './helpers/ipc-test-helpers'

// Mock electron before importing handlers
jest.mock('electron', () => {
  const handlers = new Map<string, Function>()
  const listeners = new Map<string, Function>()

  return {
    ipcMain: {
      handle: (channel: string, handler: Function) => {
        handlers.set(channel, handler)
      },
      on: (channel: string, handler: Function) => {
        listeners.set(channel, handler)
      },
      removeHandler: jest.fn(),
    },
    app: {
      getPath: (name: string) => {
        if (name === 'userData') return '/tmp/test-user-data'
        if (name === 'temp') return '/tmp'
        if (name === 'downloads') return '/tmp/downloads'
        return '/tmp'
      },
      getAppPath: () => '/tmp/app',
      getName: () => 'Bokeh',
      getAppMetrics: () => [],
      isPackaged: false,
    },
    BrowserWindow: {
      fromWebContents: jest.fn(() => ({
        id: 1,
        getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
        setBounds: jest.fn(),
        isDestroyed: () => false,
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: () => true,
        isMinimized: () => false,
        restore: jest.fn(),
        hasShadow: () => true,
        setHasShadow: jest.fn(),
        webContents: {
          capturePage: jest.fn(() => Promise.resolve({ toBitmap: () => Buffer.alloc(4) })),
          executeJavaScript: jest.fn(() => Promise.resolve({})),
        },
      })),
    },
    globalShortcut: {
      register: jest.fn(),
      unregister: jest.fn(),
    },
    systemPreferences: {
      getUserDefault: jest.fn(() => 'Maximize'),
    },
    nativeImage: {
      createFromPath: jest.fn(() => ({
        isEmpty: () => true,
        getSize: () => ({ width: 100, height: 100 }),
      })),
      createFromBuffer: jest.fn(() => ({
        isEmpty: () => true,
      })),
    },
    // Export the handlers map for test access
    __handlers: handlers,
    __listeners: listeners,
  }
})

// Also mock the window modules to avoid errors
jest.mock('../../electron/main/windows/countdown-window', () => ({
  createCountdownWindow: jest.fn(),
  showCountdown: jest.fn(),
}))

jest.mock('../../electron/main/windows/monitor-overlay', () => ({
  showRecordingOverlay: jest.fn(),
  hideRecordingOverlay: jest.fn(),
  hideMonitorOverlay: jest.fn(),
}))

jest.mock('../../electron/main/windows/teleprompter-window', () => ({
  showTeleprompterWindow: jest.fn(),
  hideTeleprompterWindow: jest.fn(),
  toggleTeleprompterWindow: jest.fn(() => true),
}))

jest.mock('../../electron/main/windows/webcam-preview-window', () => ({
  showWebcamPreview: jest.fn(),
  hideWebcamPreview: jest.fn(),
}))

jest.mock('../../electron/main/windows/workspace-window', () => ({
  openWorkspaceWindow: jest.fn(),
}))

jest.mock('systeminformation', () => ({
  processes: jest.fn(() => Promise.resolve({ list: [] })),
  graphics: jest.fn(() => Promise.resolve({ controllers: [] })),
}))

// Get access to the mock handlers
const electron = require('electron')
const handlers: Map<string, Function> = electron.__handlers

// Helper to call a handler and catch errors
async function callHandler(channel: string, event: any, ...args: any[]): Promise<any> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`Handler not registered: ${channel}`)
  }
  try {
    return await handler(event, ...args)
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

describe('Sender Verification - wallpapers.ts', () => {
  beforeAll(() => {
    // Register the handlers
    const { registerWallpaperHandlers } = require('../../electron/main/ipc/wallpapers')
    registerWallpaperHandlers()
  })

  it('get-macos-wallpapers should BLOCK untrusted sender', async () => {
    const untrustedEvent = createUntrustedMockEvent('http://evil.com')
    const result = await callHandler('get-macos-wallpapers', untrustedEvent)

    expect(result.error).toBeDefined()
    expect(result.error.toLowerCase()).toContain('untrusted')
  })

  it('get-macos-wallpapers should ALLOW trusted sender', async () => {
    const trustedEvent = createTrustedMockEvent()
    const result = await callHandler('get-macos-wallpapers', trustedEvent)

    // Should not have an error (might have wallpapers or empty array)
    expect(result.error).toBeUndefined()
  })

  it('get-wallpaper-thumbnails should BLOCK untrusted sender', async () => {
    const untrustedEvent = createUntrustedMockEvent('http://evil.com')
    const result = await callHandler('get-wallpaper-thumbnails', untrustedEvent, [])

    expect(result.error).toBeDefined()
    expect(result.error.toLowerCase()).toContain('untrusted')
  })

  it('load-wallpaper-image should BLOCK untrusted sender', async () => {
    const untrustedEvent = createUntrustedMockEvent('http://evil.com')
    const result = await callHandler('load-wallpaper-image', untrustedEvent, '/some/path.jpg')

    expect(result.error).toBeDefined()
    expect(result.error.toLowerCase()).toContain('untrusted')
  })
})

describe('Sender Verification - system-stats.ts', () => {
  beforeAll(() => {
    const { registerBokehProcessHandlers } = require('../../electron/main/ipc/system-stats')
    registerBokehProcessHandlers()
  })

  it('get-bokeh-processes should BLOCK untrusted sender', async () => {
    const untrustedEvent = createUntrustedMockEvent('http://evil.com')
    const result = await callHandler('get-bokeh-processes', untrustedEvent)

    expect(result.error).toBeDefined()
    expect(result.error.toLowerCase()).toContain('untrusted')
  })

  it('get-bokeh-processes should ALLOW trusted sender', async () => {
    const trustedEvent = createTrustedMockEvent()
    const result = await callHandler('get-bokeh-processes', trustedEvent)

    // Should return process info, not an error
    expect(result.error).toBeUndefined()
    expect(result.timestamp).toBeDefined()
  })
})

describe('Sender Verification - recording-windows.ts', () => {
  beforeAll(() => {
    const { registerRecordingWindowHandlers } = require('../../electron/main/ipc/recording-windows')
    registerRecordingWindowHandlers()
  })

  const recordingHandlers = [
    'set-recording-state',
    'show-countdown',
    'hide-countdown',
    'show-recording-overlay',
    'hide-recording-overlay',
  ]

  recordingHandlers.forEach(handler => {
    it(`${handler} should BLOCK untrusted sender`, async () => {
      const untrustedEvent = createUntrustedMockEvent('http://evil.com')
      // Pass appropriate args based on handler
      let args: any[] = []
      if (handler === 'set-recording-state') args = [true]
      if (handler === 'show-countdown') args = [3]
      if (handler === 'show-recording-overlay') args = [{ x: 0, y: 0, width: 100, height: 100 }]

      const result = await callHandler(handler, untrustedEvent, ...args)

      expect(result.error).toBeDefined()
      expect(result.error.toLowerCase()).toContain('untrusted')
    })
  })
})

describe('Sender Verification - utility-windows.ts', () => {
  beforeAll(() => {
    const { registerUtilityWindowHandlers } = require('../../electron/main/ipc/utility-windows')
    registerUtilityWindowHandlers()
  })

  const utilityHandlers = [
    'toggle-teleprompter-window',
    'show-teleprompter-window',
    'hide-teleprompter-window',
    'show-webcam-preview',
    'hide-webcam-preview',
  ]

  utilityHandlers.forEach(handler => {
    it(`${handler} should BLOCK untrusted sender`, async () => {
      const untrustedEvent = createUntrustedMockEvent('http://evil.com')
      let args: any[] = []
      if (handler === 'show-webcam-preview') args = ['device-id']

      const result = await callHandler(handler, untrustedEvent, ...args)

      expect(result.error).toBeDefined()
      expect(result.error.toLowerCase()).toContain('untrusted')
    })
  })
})

describe('Sender Verification - window-controls.ts', () => {
  beforeAll(() => {
    const { registerWindowControlHandlers } = require('../../electron/main/ipc/window-controls')
    registerWindowControlHandlers()
  })

  const windowControlHandlers = [
    'minimize-record-button',
    'show-record-button',
    'get-main-window-id',
    'set-window-content-size',
  ]

  windowControlHandlers.forEach(handler => {
    it(`${handler} should BLOCK untrusted sender`, async () => {
      const untrustedEvent = createUntrustedMockEvent('http://evil.com')
      let args: any[] = []
      if (handler === 'show-record-button') args = [{}]
      if (handler === 'set-window-content-size') args = [{ width: 100, height: 100 }]

      const result = await callHandler(handler, untrustedEvent, ...args)

      expect(result.error).toBeDefined()
      expect(result.error.toLowerCase()).toContain('untrusted')
    })
  })
})

describe('Sender Verification - assets.ts', () => {
  beforeAll(() => {
    const { registerAssetHandlers } = require('../../electron/main/ipc/assets')
    registerAssetHandlers()
  })

  const assetHandlers = [
    'list-parallax-presets',
    'list-preinstalled-wallpapers',
    'list-available-mockups',
  ]

  assetHandlers.forEach(handler => {
    it(`${handler} should BLOCK untrusted sender`, async () => {
      const untrustedEvent = createUntrustedMockEvent('http://evil.com')
      const result = await callHandler(handler, untrustedEvent)

      expect(result.error).toBeDefined()
      expect(result.error.toLowerCase()).toContain('untrusted')
    })
  })
})

describe('Sender Verification - area-selection.ts', () => {
  beforeAll(() => {
    jest.mock('../../electron/main/services/area-selection-service', () => ({
      areaSelectionService: {
        selectArea: jest.fn(() => Promise.resolve({ x: 0, y: 0, width: 100, height: 100 })),
      },
    }))
    const { registerAreaSelectionHandlers } = require('../../electron/main/ipc/area-selection')
    registerAreaSelectionHandlers()
  })

  it('select-screen-area should BLOCK untrusted sender', async () => {
    const untrustedEvent = createUntrustedMockEvent('http://evil.com')
    const result = await callHandler('select-screen-area', untrustedEvent)

    expect(result.error).toBeDefined()
    expect(result.error.toLowerCase()).toContain('untrusted')
  })
})

describe('Sender Verification - window-surface.ts', () => {
  beforeAll(() => {
    const { registerWindowSurfaceHandlers } = require('../../electron/main/ipc/window-surface')
    registerWindowSurfaceHandlers()
  })

  const windowSurfaceHandlers = [
    'signal-renderer-ready',
    'get-window-debug-state',
    'get-element-at-point',
    'get-elements-at-point',
    'get-window-alpha-samples',
    'set-window-vibrancy',
    'set-window-has-shadow',
  ]

  windowSurfaceHandlers.forEach(handler => {
    it(`${handler} should BLOCK untrusted sender`, async () => {
      const untrustedEvent = createUntrustedMockEvent('http://evil.com')
      let args: any[] = []
      if (handler === 'get-element-at-point') args = [100, 100]
      if (handler === 'get-elements-at-point') args = [100, 100, 5]
      if (handler === 'set-window-vibrancy') args = ['dark']
      if (handler === 'set-window-has-shadow') args = [true]

      const result = await callHandler(handler, untrustedEvent, ...args)

      expect(result.error).toBeDefined()
      expect(result.error.toLowerCase()).toContain('untrusted')
    })
  })
})
