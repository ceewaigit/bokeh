/**
 * Spotlight Plugin - Vivid glowing spotlight effect
 */

import React from 'react'
import type { PluginDefinition, PluginRenderProps } from '../../config/plugin-sdk'

interface SpotlightParams {
    // Position (0-100% of canvas)
    positionX: number
    positionY: number
    // Size and appearance
    size: number
    blur: number
    intensity: number
    color: string
    innerGlow: number
    // Animation
    animationType: 'static' | 'pulse' | 'orbit' | 'breathe'
    loops: number
    orbitRadius: number
}

export const SpotlightPlugin: PluginDefinition<SpotlightParams> = {
    id: 'spotlight',
    name: 'Spotlight',
    description: 'Add a vivid glowing spotlight effect that can pulse, orbit, or breathe',
    icon: 'Sun',
    category: 'underlay',  // Renders behind cursor
    positioning: {
        enabled: true,
        defaultX: 50,
        defaultY: 50,
    },
    params: {
        // Position
        positionX: { type: 'number', default: 50, label: 'X Position', min: 0, max: 100, step: 1, unit: '%' },
        positionY: { type: 'number', default: 50, label: 'Y Position', min: 0, max: 100, step: 1, unit: '%' },
        // Size and appearance - increased defaults for visibility
        size: { type: 'number', default: 400, label: 'Size', min: 50, max: 1200, step: 25, unit: 'px' },
        blur: { type: 'number', default: 60, label: 'Blur', min: 0, max: 200, step: 10, unit: 'px' },
        intensity: { type: 'number', default: 85, label: 'Intensity', min: 0, max: 100, step: 5, unit: '%' },
        color: { type: 'color', default: '#fbbf24', label: 'Color' },
        innerGlow: { type: 'number', default: 40, label: 'Inner Glow', min: 0, max: 100, step: 5, unit: '%' },
        // Animation
        animationType: {
            type: 'enum',
            default: 'breathe',
            label: 'Animation',
            options: [
                { value: 'static', label: 'Static' },
                { value: 'pulse', label: 'Pulse' },
                { value: 'orbit', label: 'Orbit' },
                { value: 'breathe', label: 'Breathe' },
            ]
        },
        loops: { type: 'number', default: 2, label: 'Loops', min: 1, max: 10, step: 1 },
        orbitRadius: { type: 'number', default: 15, label: 'Orbit Size', min: 5, max: 50, step: 5, unit: '%' },
    },
    render(props: PluginRenderProps<SpotlightParams>) {
        const { params, frame, width, height } = props
        const { positionX, positionY, size, blur, intensity, color, innerGlow, animationType, loops, orbitRadius } = params

        // Calculate animation based on type
        const loopProgress = (frame.progress * loops) % 1

        let x = (positionX / 100) * width
        let y = (positionY / 100) * height
        let currentSize = size
        let currentIntensity = intensity / 100
        let currentInnerGlow = innerGlow / 100

        switch (animationType) {
            case 'pulse':
                // Sharp pulse
                const pulseAmount = Math.sin(loopProgress * Math.PI * 2)
                currentSize = size * (1 + pulseAmount * 0.4)
                currentIntensity = (intensity / 100) * (0.6 + Math.abs(pulseAmount) * 0.4)
                break
            case 'orbit':
                // Orbit around the center position
                const angle = loopProgress * Math.PI * 2
                const radius = (orbitRadius / 100) * Math.min(width, height)
                x += Math.cos(angle) * radius
                y += Math.sin(angle) * radius
                break
            case 'breathe':
                // Gentle breathing effect
                const breathe = Math.sin(loopProgress * Math.PI * 2) * 0.5 + 0.5
                currentSize = size * (0.85 + breathe * 0.3)
                currentIntensity = (intensity / 100) * (0.75 + breathe * 0.25)
                currentInnerGlow = (innerGlow / 100) * (0.8 + breathe * 0.2)
                break
            // 'static' - no animation
        }

        // Create a layered glow effect for better visibility
        const innerSize = currentSize * 0.3
        const middleSize = currentSize * 0.6

        return (
            <div style={{
                position: 'absolute',
                left: x - currentSize / 2,
                top: y - currentSize / 2,
                width: currentSize,
                height: currentSize,
                pointerEvents: 'none',
            }}>
                {/* Outer glow layer */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${color}66 0%, ${color}22 40%, transparent 70%)`,
                    filter: `blur(${blur}px)`,
                    opacity: currentIntensity,
                }} />
                {/* Middle glow layer */}
                <div style={{
                    position: 'absolute',
                    left: (currentSize - middleSize) / 2,
                    top: (currentSize - middleSize) / 2,
                    width: middleSize,
                    height: middleSize,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${color}aa 0%, ${color}44 50%, transparent 100%)`,
                    filter: `blur(${blur * 0.5}px)`,
                    opacity: currentIntensity,
                }} />
                {/* Inner bright core */}
                <div style={{
                    position: 'absolute',
                    left: (currentSize - innerSize) / 2,
                    top: (currentSize - innerSize) / 2,
                    width: innerSize,
                    height: innerSize,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, #ffffff 0%, ${color} 60%, transparent 100%)`,
                    filter: `blur(${blur * 0.25}px)`,
                    opacity: currentIntensity * currentInnerGlow,
                    boxShadow: `0 0 ${innerSize}px ${color}`,
                }} />
            </div>
        )
    }
}
