export const formatBytes = (bytes?: number): string => {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = unitIndex === 0 ? 0 : unitIndex <= 2 ? 1 : 2
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}
