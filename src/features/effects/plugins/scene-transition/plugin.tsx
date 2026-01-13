/**
 * Scene Transition Plugin - Cinematic transitions with wipe, fade, iris, and zoom effects
 */

import React from 'react'
import type { PluginDefinition, PluginRenderProps } from '../../config/plugin-sdk'
import { easeOutCubic, easeInOutCubic, easeOutQuart, easeInOutQuart } from '@/features/rendering/canvas/math'
import { hexToRgba } from '../utils/color'

interface SceneTransitionParams {
    transitionType: 'fade' | 'wipe' | 'slide' | 'push' | 'zoom' | 'iris'
    direction: 'left' | 'right' | 'top' | 'bottom' | 'center'
    color: string
    intensity: number
    feather: number
}

export const WindowSlideOverPlugin: PluginDefinition<SceneTransitionParams> = {
    id: 'window-slide-over',
    name: 'Scene Transition',
    description: 'Refined cinematic transitions with wipe, fade, iris, and zoom effects',
    icon: 'Clapperboard',
    category: 'transition',
    params: {
        transitionType: {
            type: 'enum',
            default: 'wipe',
            label: 'Type',
            options: [
                { value: 'fade', label: 'Fade' },
                { value: 'wipe', label: 'Wipe' },
                { value: 'slide', label: 'Slide' },
                { value: 'push', label: 'Push' },
                { value: 'zoom', label: 'Zoom' },
                { value: 'iris', label: 'Iris' },
            ]
        },
        direction: {
            type: 'enum',
            default: 'right',
            label: 'Direction',
            options: [
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'center', label: 'Center' },
            ]
        },
        color: { type: 'color', default: '#0a0a0a', label: 'Color' },
        intensity: { type: 'number', default: 100, label: 'Intensity', min: 0, max: 100, step: 5, unit: '%' },
        feather: { type: 'number', default: 35, label: 'Feather', min: 0, max: 100, step: 5, unit: '%' },
    },
    render(props: PluginRenderProps<SceneTransitionParams>) {
        const { params, frame, width, height } = props
        const { transitionType, direction, color, intensity, feather } = params

        // Transition logic: 0-0.5 = IN, 0.5-1.0 = OUT with refined timing
        const progress = frame.progress
        const isTransitioningIn = progress < 0.5
        const rawProgress = isTransitioningIn
            ? progress * 2
            : (1 - progress) * 2

        const alphaMultiplier = intensity / 100
        const softFeather = (feather / 100)
        const diag = Math.sqrt(width * width + height * height)

        switch (transitionType) {
            case 'fade': {
                // Elegant fade with subtle blur during transition
                const eased = easeInOutCubic(rawProgress)
                const blurAmount = Math.sin(rawProgress * Math.PI) * 8 * softFeather

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                    }}>
                        {/* Soft background layer */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: color,
                            opacity: eased * alphaMultiplier,
                        }} />
                        {/* Subtle blur overlay for depth */}
                        {blurAmount > 0.5 && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                backdropFilter: `blur(${blurAmount}px)`,
                                WebkitBackdropFilter: `blur(${blurAmount}px)`,
                                opacity: eased * 0.5,
                            }} />
                        )}
                    </div>
                )
            }

            case 'wipe': {
                // Refined wipe with subtle gradient and soft edge
                const eased = easeOutQuart(rawProgress)

                // Feather as percentage of the gradient
                const featherSize = 5 + softFeather * 20
                const gradientBlur = softFeather * 10

                // Extend wipe position to ensure full coverage at end
                // wipePos goes from 0 to (100 + featherSize) so gradient fully exits
                const wipePos = eased * (100 + featherSize * 2)

                // Direction-based gradient
                let angle = 90
                switch (direction) {
                    case 'left': angle = 270; break
                    case 'right': angle = 90; break
                    case 'top': angle = 0; break
                    case 'bottom': angle = 180; break
                    case 'center': angle = 90; break
                }

                // Gradient stops - solid color transitions to transparent at the edge
                const solidStop = Math.max(0, wipePos - featherSize * 2)
                const midStop = Math.max(0, wipePos - featherSize)
                const fadeStop = Math.min(100, wipePos)

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                    }}>
                        {/* Main wipe surface */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `linear-gradient(${angle}deg,
                                ${color} 0%,
                                ${color} ${solidStop}%,
                                ${hexToRgba(color, 0.7)} ${midStop}%,
                                transparent ${fadeStop}%,
                                transparent 100%)`,
                            opacity: alphaMultiplier,
                        }} />
                        {/* Soft edge glow for depth */}
                        {gradientBlur > 0 && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: `linear-gradient(${angle}deg,
                                    transparent ${Math.max(0, wipePos - featherSize * 3)}%,
                                    ${hexToRgba(color, 0.12)} ${Math.max(0, wipePos - featherSize)}%,
                                    transparent ${fadeStop}%)`,
                                filter: `blur(${gradientBlur}px)`,
                            }} />
                        )}
                    </div>
                )
            }

            case 'slide': {
                // Elegant slide with soft shadow and subtle motion blur
                const eased = easeOutCubic(rawProgress)
                const slideAmount = (1 - eased) * 100

                let transform = ''
                let shadowAngle = 0
                switch (direction) {
                    case 'left':
                        transform = `translateX(${-slideAmount}%)`
                        shadowAngle = 90
                        break
                    case 'right':
                        transform = `translateX(${slideAmount}%)`
                        shadowAngle = 270
                        break
                    case 'top':
                        transform = `translateY(${-slideAmount}%)`
                        shadowAngle = 180
                        break
                    case 'bottom':
                        transform = `translateY(${slideAmount}%)`
                        shadowAngle = 0
                        break
                    case 'center':
                        transform = `scale(${eased})`
                        shadowAngle = 0
                        break
                }

                // Refined shadow that follows the edge
                const shadowIntensity = (1 - eased) * 0.4 * softFeather
                const shadowSize = 60 + softFeather * 100

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                    }}>
                        {/* Soft ambient shadow */}
                        <div style={{
                            position: 'absolute',
                            inset: `-${shadowSize}px`,
                            background: `linear-gradient(${shadowAngle}deg,
                                ${hexToRgba(color, shadowIntensity)} 0%,
                                transparent 50%)`,
                            filter: `blur(${shadowSize * 0.5}px)`,
                            transform,
                        }} />
                        {/* Main slide surface */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: color,
                            transform,
                            opacity: alphaMultiplier,
                            boxShadow: direction !== 'center'
                                ? `0 0 ${shadowSize}px ${hexToRgba(color, 0.5)}`
                                : 'none',
                        }} />
                    </div>
                )
            }

            case 'push': {
                // Refined push with 3D depth and elegant motion
                const eased = easeInOutQuart(rawProgress)
                const pushAmount = (1 - eased) * 100
                const depthScale = 0.92 + eased * 0.08

                let transform = ''
                let perspective = ''
                switch (direction) {
                    case 'left':
                        transform = `translateX(${-pushAmount}%) scale(${depthScale})`
                        break
                    case 'right':
                        transform = `translateX(${pushAmount}%) scale(${depthScale})`
                        break
                    case 'top':
                        transform = `translateY(${-pushAmount}%) scale(${depthScale})`
                        break
                    case 'bottom':
                        transform = `translateY(${pushAmount}%) scale(${depthScale})`
                        break
                    case 'center':
                        transform = `scale(${0.85 + eased * 0.15})`
                        perspective = 'perspective(1200px) rotateX(2deg)'
                        break
                }

                // Subtle gradient overlay for depth
                const glowOpacity = (1 - eased) * 0.12

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                    }}>
                        {/* Main push surface with subtle gradient */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `linear-gradient(160deg,
                                ${hexToRgba(color, 1)} 0%,
                                ${color} 40%,
                                ${hexToRgba(color, 0.95)} 100%)`,
                            transform: perspective ? `${perspective} ${transform}` : transform,
                            transformOrigin: 'center center',
                            opacity: alphaMultiplier,
                        }} />
                        {/* Subtle highlight on edge */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `linear-gradient(135deg,
                                rgba(255,255,255,${glowOpacity}) 0%,
                                transparent 30%)`,
                            transform,
                            opacity: alphaMultiplier,
                        }} />
                    </div>
                )
            }

            case 'zoom': {
                // Elegant zoom with depth blur and refined scaling
                const eased = easeInOutCubic(rawProgress)
                const scale = 1.15 - eased * 0.15
                const blurAmount = (1 - eased) * 20 * softFeather

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                    }}>
                        {/* Ambient backdrop blur */}
                        {blurAmount > 1 && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                backdropFilter: `blur(${blurAmount}px)`,
                                WebkitBackdropFilter: `blur(${blurAmount}px)`,
                                opacity: (1 - eased) * 0.6,
                            }} />
                        )}
                        {/* Main zoom surface */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: direction === 'center'
                                ? `radial-gradient(ellipse at center, ${color} 0%, ${hexToRgba(color, 0.92)} 70%)`
                                : color,
                            transform: `scale(${scale})`,
                            transformOrigin: 'center center',
                            opacity: eased * alphaMultiplier,
                            borderRadius: direction === 'center' ? '100%' : 0,
                        }} />
                        {/* Subtle vignette for depth */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `radial-gradient(ellipse at center,
                                transparent 30%,
                                ${hexToRgba(color, 0.1)} 100%)`,
                            opacity: eased,
                        }} />
                    </div>
                )
            }

            case 'iris': {
                // Refined circular iris with soft feathered edge
                const eased = easeInOutCubic(rawProgress)
                const maxRadius = diag / 2
                const radius = eased * maxRadius

                // Much softer feather for elegant look
                const featherPx = 15 + (softFeather * maxRadius * 0.12)
                const innerRadius = Math.max(0, radius - featherPx * 0.5)
                const outerRadius = radius + featherPx

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                    }}>
                        {/* Main iris with refined gradient */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `radial-gradient(circle at center,
                                transparent 0%,
                                transparent ${innerRadius}px,
                                ${hexToRgba(color, 0.6)} ${radius}px,
                                ${color} ${outerRadius}px,
                                ${color} 100%)`,
                            opacity: alphaMultiplier,
                        }} />
                        {/* Subtle inner glow ring */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `radial-gradient(circle at center,
                                transparent ${Math.max(0, radius - 5)}px,
                                rgba(255, 255, 255, 0.06) ${radius}px,
                                transparent ${radius + 10}px)`,
                            opacity: alphaMultiplier * 0.8,
                        }} />
                        {/* Soft blur edge */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `radial-gradient(circle at center,
                                transparent ${Math.max(0, radius - featherPx)}px,
                                ${hexToRgba(color, 0.2)} ${radius}px,
                                transparent ${outerRadius + featherPx}px)`,
                            filter: `blur(${featherPx * 0.5}px)`,
                        }} />
                    </div>
                )
            }

            default:
                return null
        }
    }
}
