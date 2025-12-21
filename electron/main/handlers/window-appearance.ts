import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron'

export function registerWindowAppearanceHandlers(): void {
  ipcMain.handle('get-window-debug-state', async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false }

    try {
      let rendererState: any = null
      try {
        rendererState = await event.sender.executeJavaScript(
          `(() => {
            const root = document.documentElement;
            const cs = getComputedStyle(root);
            return {
              hash: window.location.hash,
              windowSurface: root.dataset.windowSurface ?? null,
              surfaceOpacity: cs.getPropertyValue('--window-surface-opacity').trim(),
              surfaceBlur: cs.getPropertyValue('--window-surface-blur').trim(),
              rootBg: cs.backgroundColor,
              bodyBg: getComputedStyle(document.body).backgroundColor,
            };
          })()`,
          true
        )
      } catch { }

      return {
        success: true,
        platform: process.platform,
        isVisible: window.isVisible(),
        hasShadow: window.hasShadow(),
        backgroundColor: window.getBackgroundColor(),
        isDestroyed: window.isDestroyed(),
        bounds: window.getBounds(),
        url: event.sender.getURL(),
        rendererState,
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-element-at-point', async (event: IpcMainInvokeEvent, x: number, y: number) => {
    try {
      const result = await event.sender.executeJavaScript(
        `(() => {
          const el = document.elementFromPoint(${Number(x)}, ${Number(y)});
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            tagName: el.tagName,
            id: el.id || null,
            className: typeof el.className === 'string' ? el.className : null,
            backgroundColor: cs.backgroundColor,
            opacity: cs.opacity,
            pointerEvents: cs.pointerEvents,
          };
        })()`,
        true
      )
      return { success: true, result }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-elements-at-point', async (event: IpcMainInvokeEvent, x: number, y: number, limit: number = 12) => {
    try {
      const result = await event.sender.executeJavaScript(
        `(() => {
          const els = document.elementsFromPoint(${Number(x)}, ${Number(y)}).slice(0, ${Number(limit)});
          return els.map((el) => {
            const cs = getComputedStyle(el);
            return {
              tagName: el.tagName,
              id: el.id || null,
              className: typeof el.className === 'string' ? el.className : null,
              backgroundColor: cs.backgroundColor,
              opacity: cs.opacity,
              pointerEvents: cs.pointerEvents,
            };
          });
        })()`,
        true
      )
      return { success: true, result }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-window-alpha-samples', async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false }

    try {
      const bounds = window.getBounds()
      const samples: Array<{ x: number; y: number; r: number; g: number; b: number; alpha: number }> = []

      const points = [
        { x: 2, y: 2 },
        { x: Math.max(2, Math.floor(bounds.width / 2)), y: Math.max(2, Math.floor(bounds.height / 2)) },
        { x: Math.max(2, bounds.width - 2), y: Math.max(2, bounds.height - 2) },
      ]

      for (const p of points) {
        const image = await window.webContents.capturePage({ x: p.x, y: p.y, width: 1, height: 1 })
        const bitmap = image.toBitmap() // BGRA
        const b = bitmap[0] ?? 0
        const g = bitmap[1] ?? 0
        const r = bitmap[2] ?? 0
        const alpha = bitmap[3] ?? 255
        samples.push({ x: p.x, y: p.y, r, g, b, alpha })
      }

      return { success: true, samples }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('set-window-vibrancy', async (event: IpcMainInvokeEvent, vibrancy: string | null) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false }

    if (process.platform !== 'darwin') {
      return { success: true }
    }

    try {
      ;(window as any).setVibrancy?.(vibrancy ?? null)
      window.setBackgroundColor('#00000000')
      return { success: true }
    } catch (error) {
      console.warn('[WindowAppearance] Failed to set vibrancy:', error)
      return { success: false }
    }
  })

  ipcMain.handle('set-window-has-shadow', async (event: IpcMainInvokeEvent, hasShadow: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false }

    try {
      window.setHasShadow(Boolean(hasShadow))
      return { success: true }
    } catch (error) {
      console.warn('[WindowAppearance] Failed to set hasShadow:', error)
      return { success: false }
    }
  })
}
