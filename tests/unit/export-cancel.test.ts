import { RemotionExportService } from '@/lib/export/remotion-export-service'
import { MockIpcBridge } from '@/lib/bridges/mock-ipc-bridge'
import { resetIpcBridge, setIpcBridge } from '@/lib/bridges'

describe('export cancellation', () => {
  test('abort triggers export-cancel IPC', async () => {
    ;(window as any).electronAPI = {
      ...(window as any).electronAPI,
      ipcRenderer: {}
    }

    const bridge = new MockIpcBridge()

    let cancelInvocations = 0
    bridge.registerHandler('export-cancel', async () => {
      cancelInvocations++
      return { success: true }
    })

    let exportResolver!: (value: any) => void
    const exportVideoPromise = new Promise<any>((resolve) => {
      exportResolver = resolve
    })
    bridge.registerHandler('export-video', async () => await exportVideoPromise)

    setIpcBridge(bridge)

    const service = new RemotionExportService()
    const abortController = new AbortController()

    const exportPromise = service.export(
      [],
      new Map(),
      new Map(),
      {
        format: 'mp4',
        quality: 'high',
        resolution: { width: 1920, height: 1080 },
        framerate: 30,
        outputPath: ''
      } as any,
      undefined,
      abortController.signal
    )

    await Promise.resolve()
    abortController.abort()
    await new Promise((r) => setTimeout(r, 0))

    expect(cancelInvocations).toBe(1)

    exportResolver({ success: false, error: 'Export cancelled' })
    await expect(exportPromise).rejects.toBeTruthy()

    resetIpcBridge()
  })
})
