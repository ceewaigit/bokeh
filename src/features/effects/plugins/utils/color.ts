/**
 * Color utilities for plugins
 */

/**
 * Convert hex color to rgba string
 */
export const hexToRgba = (hex: string, alpha: number): string => {
    const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i
    hex = hex.replace(shorthand, (_, r, g, b) => r + r + g + g + b + b)
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return `rgba(0, 0, 0, ${alpha})`
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`
}
