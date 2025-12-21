import { getElectronAssetUrl } from '@/lib/assets/electron-asset-url'

describe('getElectronAssetUrl', () => {
  const originalElectronAPI = (window as any).electronAPI

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
  })

  it('returns a normalized web path when not in Electron', () => {
    delete (window as any).electronAPI
    expect(getElectronAssetUrl('parallax/hill/5.png')).toBe('/parallax/hill/5.png')
    expect(getElectronAssetUrl('/parallax/hill/5.png')).toBe('/parallax/hill/5.png')
  })

  it('uses the video-stream assets protocol in Electron', () => {
    ;(window as any).electronAPI = {}
    expect(getElectronAssetUrl('/parallax/hill/5.png')).toBe('video-stream://assets/parallax/hill/5.png')
  })
})
