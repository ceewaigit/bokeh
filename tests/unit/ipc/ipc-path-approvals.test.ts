/**
 * @jest-environment node
 */

describe('ipc-path-approvals', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('treats approved read paths as usable across senders', async () => {
    const { approveReadPaths, isApprovedReadPath } = await import('../../../electron/main/utils/ipc-path-approvals')

    const senderA = { id: 1 } as any
    const senderB = { id: 2 } as any

    const absPath = process.platform === 'win32' ? 'C:\\tmp\\video.mp4' : '/tmp/video.mp4'

    approveReadPaths(senderA, [absPath])
    expect(isApprovedReadPath(senderA, absPath)).toBe(true)
    expect(isApprovedReadPath(senderB, absPath)).toBe(true)
  })

  it('normalizes video-stream URLs to a filesystem path', async () => {
    const { approveReadPaths, isApprovedReadPath } = await import('../../../electron/main/utils/ipc-path-approvals')

    const sender = { id: 1 } as any

    const absPath = process.platform === 'win32' ? 'C:\\tmp\\video.mp4' : '/tmp/video.mp4'
    const encoded = encodeURIComponent(absPath)
    const url = `video-stream://local/${encoded}`

    approveReadPaths(sender, [url])
    expect(isApprovedReadPath(sender, absPath)).toBe(true)
    expect(isApprovedReadPath(sender, url)).toBe(true)
  })
})

