import { app, ipcMain, IpcMainInvokeEvent } from 'electron'
import si from 'systeminformation'
import { assertTrustedIpcSender } from '../utils/ipc-security'

type ProcessEntry = {
  pid: number
  ppid: number | null
  type: string
  name: string
  command: string | null
  cpu: number
  memRss: number | null
}

export type BokehProcessSnapshot = {
  timestamp: number
  appName: string
  totalCpu: number
  totalMemRssBytes: number
  gpu: {
    vramTotalBytes: number | null
    vramUsedBytes: number | null
  }
  processes: ProcessEntry[]
}

const toNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value))

export function registerBokehProcessHandlers(): void {
  ipcMain.handle('get-bokeh-processes', async (event: IpcMainInvokeEvent): Promise<BokehProcessSnapshot> => {
    assertTrustedIpcSender(event, 'get-bokeh-processes')
    const appName = app.getName()
    const appMetrics = app.getAppMetrics()
    const [{ list }, graphics] = await Promise.all([si.processes(), si.graphics()])
    const processByPid = new Map<number, any>()
    list.forEach((proc) => {
      const pid = toNumber((proc as any).pid)
      if (Number.isFinite(pid)) {
        processByPid.set(pid, proc)
      }
    })

    const processes: ProcessEntry[] = appMetrics
      .map((metric) => {
        const sysProc = processByPid.get(metric.pid)
        const parentPid = sysProc?.parentPid ?? sysProc?.ppid ?? null
        const memRss = metric.memory?.workingSetSize != null
          ? metric.memory.workingSetSize * 1024
          : (sysProc?.memRss ?? sysProc?.mem_rss ?? null)
        const cpuValue = metric.cpu?.percentCPUUsage ?? sysProc?.cpu ?? 0

        return {
          pid: metric.pid,
          ppid: parentPid != null ? toNumber(parentPid) : null,
          type: metric.type,
          name: sysProc?.name ?? metric.type,
          command: sysProc?.command ?? sysProc?.path ?? null,
          cpu: Number(toNumber(cpuValue).toFixed(1)),
          memRss: memRss != null ? toNumber(memRss) : null
        }
      })
      .sort((a, b) => b.cpu - a.cpu || (b.memRss ?? 0) - (a.memRss ?? 0))

    const totalCpu = Number(processes.reduce((sum, proc) => sum + proc.cpu, 0).toFixed(1))
    const totalMemRssBytes = processes.reduce((sum, proc) => sum + (proc.memRss ?? 0), 0)
    const primaryController = graphics.controllers?.[0]
    const vramTotalBytes = primaryController?.vram != null ? Number(primaryController.vram) * 1024 * 1024 : null
    const vramUsedBytes = primaryController?.vramDynamic != null ? Number(primaryController.vramDynamic) * 1024 * 1024 : null

    return {
      timestamp: Date.now(),
      appName,
      totalCpu,
      totalMemRssBytes,
      gpu: {
        vramTotalBytes,
        vramUsedBytes
      },
      processes
    }
  })
}
