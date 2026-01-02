/**
 * Resolves a `public/` asset path for both web and Electron.
 *
 * In Electron, prefer the `video-stream://assets/...` protocol so assets load
 * regardless of whether the renderer is served from a dev server, `file://`, or `app://`.
 */
export function getElectronAssetUrl(publicPath: string): string {
  const normalized = publicPath.startsWith('/') ? publicPath : `/${publicPath}`

  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return `video-stream://assets${normalized}`
  }

  return normalized
}

