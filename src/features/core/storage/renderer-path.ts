/**
 * Path joining utility for the renderer process.
 * Normalizes separators and handles `.` / `..` without importing Node's `path`.
 */
export const joinRendererPath = (base: string, ...parts: string[]): string => {
  const segments = [base, ...parts].join('/').replace(/\\/g, '/').split('/')
  const filtered: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      filtered.pop()
      continue
    }
    filtered.push(segment)
  }
  return (base.startsWith('/') ? '/' : '') + filtered.join('/')
}

