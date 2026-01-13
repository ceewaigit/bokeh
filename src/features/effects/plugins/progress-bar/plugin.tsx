/**
 * Progress Bar Plugin - Apple-style progress indicator
 */

import React from 'react'
import type { PluginDefinition, PluginRenderProps } from '../../config/plugin-sdk'

interface ProgressBarParams {
    style: 'line' | 'pill' | 'ring'
    position: 'top' | 'bottom' | 'center'
    color: string
    trackColor: string
    thickness: number
    width: number
    size: number
    showLabel: boolean
    labelPosition: 'above' | 'below' | 'center' | 'inside'
    opacity: number
}

export const ProgressBarPlugin: PluginDefinition<ProgressBarParams> = {
    id: 'progress-bar',
    name: 'Progress Bar',
    description: 'Minimal Apple-style progress indicator',
    icon: 'Loader',
    category: 'foreground',
    params: {
        style: {
            type: 'enum',
            default: 'line',
            label: 'Style',
            options: [
                { value: 'line', label: 'Line' },
                { value: 'pill', label: 'Pill' },
                { value: 'ring', label: 'Ring' },
            ]
        },
        position: {
            type: 'enum',
            default: 'bottom',
            label: 'Position',
            options: [
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'center', label: 'Center' },
            ]
        },
        color: { type: 'color', default: '#000000', label: 'Fill Color' },
        trackColor: { type: 'color', default: '#e5e5e5', label: 'Track Color' },
        thickness: { type: 'number', default: 4, label: 'Thickness', min: 2, max: 12, step: 1, unit: 'px' },
        width: { type: 'number', default: 60, label: 'Width', min: 20, max: 95, step: 5, unit: '%' },
        size: { type: 'number', default: 15, label: 'Ring Size', min: 8, max: 30, step: 1, unit: '%' },
        showLabel: { type: 'boolean', default: true, label: 'Show Label' },
        labelPosition: {
            type: 'enum',
            default: 'below',
            label: 'Label Position',
            options: [
                { value: 'above', label: 'Above' },
                { value: 'below', label: 'Below' },
                { value: 'center', label: 'Center' },
                { value: 'inside', label: 'Inside' },
            ]
        },
        opacity: { type: 'number', default: 100, label: 'Opacity', min: 20, max: 100, step: 5, unit: '%' },
    },
    render(props: PluginRenderProps<ProgressBarParams>) {
        const { params, frame, width: canvasWidth, height: canvasHeight } = props
        const {
            style,
            position,
            color,
            trackColor,
            thickness,
            width,
            size,
            showLabel,
            labelPosition,
            opacity
        } = params

        const progress = frame.progress
        const percentage = Math.round(progress * 100)
        const containerOpacity = opacity / 100

        // Typography - Apple SF Pro style
        const labelStyle: React.CSSProperties = {
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
            fontWeight: 400,
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
            color: color,
        }

        // Render ring progress (SVG-based)
        if (style === 'ring') {
            const ringSize = (size / 100) * Math.min(canvasWidth, canvasHeight)
            const strokeWidth = thickness * 1.5
            const radius = (ringSize - strokeWidth) / 2
            const circumference = 2 * Math.PI * radius
            const strokeDashoffset = circumference * (1 - progress)

            return (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: containerOpacity,
                    pointerEvents: 'none',
                }}>
                    <div style={{
                        position: 'relative',
                        width: ringSize,
                        height: ringSize,
                    }}>
                        <svg
                            width={ringSize}
                            height={ringSize}
                            style={{
                                transform: 'rotate(-90deg)',
                            }}
                        >
                            {/* Track */}
                            <circle
                                cx={ringSize / 2}
                                cy={ringSize / 2}
                                r={radius}
                                fill="none"
                                stroke={trackColor}
                                strokeWidth={strokeWidth}
                                opacity={0.3}
                            />
                            {/* Progress */}
                            <circle
                                cx={ringSize / 2}
                                cy={ringSize / 2}
                                r={radius}
                                fill="none"
                                stroke={color}
                                strokeWidth={strokeWidth}
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                style={{
                                    transition: 'stroke-dashoffset 0.1s ease-out',
                                }}
                            />
                        </svg>
                        {/* Center label */}
                        {showLabel && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                ...labelStyle,
                                fontSize: ringSize * 0.22,
                                fontWeight: 300,
                            }}>
                                {percentage}%
                            </div>
                        )}
                    </div>
                </div>
            )
        }

        // Line and Pill styles
        const barWidth = (width / 100) * canvasWidth
        const barHeight = style === 'pill' ? thickness * 2.5 : thickness
        const borderRadius = style === 'pill' ? barHeight / 2 : thickness / 2
        const padding = 32

        // Position calculation
        const getPositionStyle = (): React.CSSProperties => {
            const base: React.CSSProperties = {
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
            }

            if (position === 'center') {
                return {
                    ...base,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                }
            }

            return {
                ...base,
                [position]: padding,
            }
        }

        // Label positioning
        const getLabelContainerStyle = (): React.CSSProperties => {
            const base: React.CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                gap: 12,
            }

            if (labelPosition === 'above' || labelPosition === 'below') {
                return {
                    ...base,
                    flexDirection: labelPosition === 'above' ? 'column-reverse' : 'column',
                    gap: 8,
                }
            }

            return base
        }

        return (
            <div style={{
                ...getPositionStyle(),
                opacity: containerOpacity,
                pointerEvents: 'none',
            }}>
                <div style={getLabelContainerStyle()}>
                    {/* Progress bar */}
                    <div style={{
                        position: 'relative',
                        width: barWidth,
                        height: barHeight,
                        background: trackColor,
                        borderRadius,
                        overflow: 'hidden',
                        boxShadow: style === 'pill'
                            ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                            : 'none',
                    }}>
                        {/* Fill */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: `${progress * 100}%`,
                            background: color,
                            borderRadius,
                            boxShadow: style === 'pill'
                                ? '0 1px 2px rgba(0,0,0,0.1)'
                                : 'none',
                        }} />

                        {/* Inside label */}
                        {showLabel && labelPosition === 'inside' && style === 'pill' && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                ...labelStyle,
                                fontSize: barHeight * 0.5,
                                fontWeight: 500,
                                color: progress > 0.5 ? '#ffffff' : color,
                                mixBlendMode: 'difference',
                            }}>
                                {percentage}%
                            </div>
                        )}
                    </div>

                    {/* External label */}
                    {showLabel && labelPosition !== 'inside' && (
                        <div style={{
                            ...labelStyle,
                            fontSize: Math.max(14, barHeight * 1.2),
                            fontWeight: 300,
                            opacity: 0.9,
                        }}>
                            {percentage}%
                        </div>
                    )}
                </div>
            </div>
        )
    }
}
