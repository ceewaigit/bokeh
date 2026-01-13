/**
 * Blank Clip Plugin - Solid-color clip for timeline gaps
 */

import React from 'react'
import type { PluginDefinition, PluginRenderProps } from '../../config/plugin-sdk'

interface BlankClipParams {
    backgroundColor: string
    accentColor: string
    label: string
    showLabel: boolean
    showIcon: boolean
    pattern: 'grid' | 'dots' | 'none'
    patternOpacity: number
    borderStrength: number
}

export const BlankClipPlugin: PluginDefinition<BlankClipParams> = {
    id: 'blank-clip',
    name: 'Blank Clip',
    description: 'Generated solid-color clip for timeline gaps',
    icon: 'Pause',
    category: 'background',
    kind: 'clip',
    clip: {
        defaultDurationMs: 2000
    },
    params: {
        backgroundColor: { type: 'color', default: '#0d0f12', label: 'Background' },
        accentColor: { type: 'color', default: '#9aa4b2', label: 'Accent' },
        label: { type: 'string', default: '', label: 'Label' },
        showLabel: { type: 'boolean', default: false, label: 'Show Label' },
        showIcon: { type: 'boolean', default: false, label: 'Show Icon' },
        pattern: {
            type: 'enum',
            default: 'none',
            label: 'Pattern',
            options: [
                { value: 'grid', label: 'Grid' },
                { value: 'dots', label: 'Dots' },
                { value: 'none', label: 'None' },
            ]
        },
        patternOpacity: { type: 'number', default: 30, label: 'Pattern Opacity', min: 0, max: 100, step: 2, unit: '%' },
        borderStrength: { type: 'number', default: 0, label: 'Frame Border', min: 0, max: 100, step: 4, unit: '%' },
    },
    render(props: PluginRenderProps<BlankClipParams>) {
        const { params, width, height } = props
        const {
            backgroundColor,
            accentColor,
            label,
            showLabel,
            showIcon,
            pattern,
            patternOpacity,
            borderStrength
        } = params

        // Calculate responsive base unit (1% of width)
        // For a 1920px canvas, baseUnit is ~19px
        const baseUnit = Math.max(width / 100, 1)

        const borderAlpha = Math.max(0, Math.min(1, borderStrength / 100))
        const patternAlpha = Math.max(0, Math.min(1, patternOpacity / 100))
        const hasLabel = showLabel && label.trim().length > 0

        // Scaled dimensions
        // Icon box: 72px at 1080p -> ~3.75vw
        // Icon size for svg: half of box
        // Font size: 12px at 1080p -> ~0.6vw
        // Border thickness: scaled

        const iconBoxSize = baseUnit * 4  // ~76px on 1080p
        const iconSize = iconBoxSize * 0.5
        const fontSize = baseUnit * 0.8   // ~15px on 1080p
        const borderRadius = baseUnit * 1 // ~19px on 1080p
        const iconBorderWidth = Math.max(2, baseUnit * 0.15)
        const gapSize = baseUnit * 0.8

        // Pattern dimensions (scaled)
        const gridSize = baseUnit * 5      // 5% grid
        const dotSize = baseUnit * 4       // 4% dot spacing
        const dotRadius = baseUnit * 0.35  // dot size
        const strokeWidth = baseUnit * 0.15 // stroke

        // Frame border scaling
        const frameBorderSize = baseUnit * (0.1 + borderAlpha * 0.4)
        const framePadding = baseUnit * 6 // 6% margin
        const frameRadius = baseUnit * 1.5

        return (
            <div style={{
                position: 'absolute',
                inset: 0,
                background: backgroundColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
                color: accentColor,
            }}>
                <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio="xMidYMid slice"

                    style={{
                        position: 'absolute',
                        inset: 0,
                        opacity: patternAlpha,
                    }}
                >
                    <defs>
                        <pattern id="blank-clip-grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke={accentColor} strokeWidth={strokeWidth} />
                        </pattern>
                        <pattern id="blank-clip-dots" width={dotSize} height={dotSize} patternUnits="userSpaceOnUse">
                            <circle cx={dotSize * 0.2} cy={dotSize * 0.2} r={dotRadius} fill={accentColor} />
                        </pattern>
                    </defs>
                    {pattern !== 'none' && (
                        <rect width="100%" height="100%" fill={`url(#blank-clip-${pattern})`} />
                    )}
                </svg>

                {borderAlpha > 0 && (
                    <div style={{
                        position: 'absolute',
                        inset: framePadding,
                        borderRadius: frameRadius,
                        border: `${frameBorderSize}px solid ${accentColor}`,
                        opacity: 0.35 + borderAlpha * 0.4,
                        boxShadow: `0 0 0 ${baseUnit * (0.5 + borderAlpha)}px ${backgroundColor}`,
                    }} />
                )}

                {(showIcon || hasLabel) && (
                    <div style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: gapSize,
                        textAlign: 'center',
                    }}>
                        {showIcon && (
                            <div style={{
                                width: iconBoxSize,
                                height: iconBoxSize,
                                borderRadius: borderRadius,
                                border: `${iconBorderWidth}px solid ${accentColor}`,
                                display: 'grid',
                                placeItems: 'center',
                                background: 'rgba(255,255,255,0.04)',
                                boxShadow: `0 ${baseUnit}px ${baseUnit * 2}px ${backgroundColor}`,
                            }}>
                                <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
                                    <rect x="6" y="4.5" width="4.2" height="15" rx="1.4" fill={accentColor} />
                                    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" fill={accentColor} />
                                </svg>
                            </div>
                        )}
                        {hasLabel && (
                            <div style={{
                                fontSize: fontSize,
                                letterSpacing: '0.24em',
                                textTransform: 'uppercase',
                                fontWeight: 600,
                            }}>
                                {label}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }
}
