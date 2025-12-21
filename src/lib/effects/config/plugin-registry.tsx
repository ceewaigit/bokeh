/**
 * Plugin Registry - Central store for all plugins (built-in + community)
 * 
 * Plugins are registered here and can be enabled/disabled per project.
 * The sidebar uses this registry to render plugin controls.
 * All plugins are validated before registration.
 */

import React from 'react'
import type { PluginDefinition, PluginRenderProps } from './plugin-sdk'
import { validatePluginDefinition } from './plugin-sdk'

// =============================================================================
// REGISTRY
// =============================================================================

class PluginRegistryClass {
    private plugins = new Map<string, PluginDefinition>()
    private enabledPlugins = new Set<string>()

    constructor() {
        // Load persisted plugins on initialization (client-side only)
        if (typeof window !== 'undefined') {
            this.load()
        }
    }

    /**
     * Register a plugin (with validation)
     */
    register(plugin: PluginDefinition): boolean {
        // Validate before registering
        const validation = validatePluginDefinition(plugin)
        if (!validation.valid) {
            console.error(`[PluginRegistry] Rejected plugin "${plugin.id}":`, validation.errors)
            return false
        }

        if (this.plugins.has(plugin.id)) {
            // console.warn(`Plugin "${plugin.id}" already registered, overwriting`)
        }
        this.plugins.set(plugin.id, plugin)
        return true
    }

    unregister(id: string): void {
        this.plugins.delete(id)
        this.enabledPlugins.delete(id)
        this.persist() // Save changes
    }

    get(id: string): PluginDefinition | undefined {
        return this.plugins.get(id)
    }

    getAll(): PluginDefinition[] {
        return Array.from(this.plugins.values())
    }

    getByCategory(category: 'overlay' | 'background'): PluginDefinition[] {
        return this.getAll().filter(p => p.category === category)
    }

    enable(id: string): void {
        if (this.plugins.has(id)) {
            this.enabledPlugins.add(id)
        }
    }

    disable(id: string): void {
        this.enabledPlugins.delete(id)
    }

    isEnabled(id: string): boolean {
        return this.enabledPlugins.has(id)
    }

    getEnabled(): PluginDefinition[] {
        return Array.from(this.enabledPlugins)
            .map(id => this.plugins.get(id))
            .filter((p): p is PluginDefinition => p !== undefined)
    }

    /**
     * Persist custom plugins to localStorage
     */
    persist() {
        if (typeof window === 'undefined') return

        const customPlugins = Array.from(this.plugins.values())
            .filter(p => p.renderCode) // Only persist plugins with renderCode (custom ones)
            .map(p => ({
                ...p,
                render: undefined // Don't persist the function
            }))

        try {
            localStorage.setItem('bokeh_custom_plugins', JSON.stringify(customPlugins))
        } catch (e) {
            console.error('Failed to save plugins:', e)
        }
    }

    /**
     * Load custom plugins from localStorage
     */
    load() {
        if (typeof window === 'undefined') return

        try {
            const stored = localStorage.getItem('bokeh_custom_plugins')
            if (!stored) return

            const plugins = JSON.parse(stored) as PluginDefinition[]

            // We need Babel to hydrate the render function
            // We'll import it dynamically to avoid SSR issues
            import('@babel/standalone').then(Babel => {
                plugins.forEach(p => {
                    if (p.renderCode) {
                        try {
                            // Hydrate the render function
                            const wrappedCode = `function _render() { ${p.renderCode} }`
                            const transpiled = Babel.transform(wrappedCode, { presets: ['react'] }).code

                            if (!transpiled) return

                            const body = transpiled
                                .replace(/function\s+_render\s*\(\)\s*\{/, '')
                                .replace(/\}\s*$/, '')
                                .trim()

                            // Create the render function
                            // It receives props which contains: params, frame, width, height
                            // We need to destructure props inside the function or pass them as args
                            // The SDK expects: render(props)
                            // So we create a wrapper that calls our dynamic function

                            p.render = (props: PluginRenderProps) => {
                                const { params, frame, width, height } = props
                                const React = require('react')
                                const sandboxPrelude = `
                                    'use strict';
                                    const window = undefined;
                                    const document = undefined;
                                    const navigator = undefined;
                                    const globalThis = undefined;
                                    const localStorage = undefined;
                                    const sessionStorage = undefined;
                                    const indexedDB = undefined;
                                    const fetch = undefined;
                                    const XMLHttpRequest = undefined;
                                    const WebSocket = undefined;
                                    const Worker = undefined;
                                    const importScripts = undefined;
                                    const Function = undefined;
                                    const eval = undefined;
                                    const require = undefined;
                                    const process = undefined;
                                `
                                const fn = new Function(
                                    'params', 'ctx', 'width', 'height', 'React',
                                    `${sandboxPrelude} try { ${body} } catch(e) { return React.createElement('div', { style: { color: 'red' } }, e.message) }`
                                )

                                return fn(params, frame, width, height, React)
                            }

                            this.register(p)
                        } catch (e) {
                            console.error(`Failed to hydrate plugin ${p.id}:`, e)
                        }
                    }
                })
            })
        } catch (e) {
            console.error('Failed to load plugins:', e)
        }
    }
}

export const PluginRegistry = new PluginRegistryClass()

// =============================================================================
// DEMO PLUGINS
// =============================================================================

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
    description: 'Cinematic transitions with wipe, fade, iris, and zoom effects',
    icon: 'Clapperboard',
    category: 'transition',  // Renders ABOVE cursor layer
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
        feather: { type: 'number', default: 20, label: 'Feather', min: 0, max: 100, step: 5, unit: '%' },
    },
    render(props: PluginRenderProps<SceneTransitionParams>) {
        const { params, frame, width, height } = props
        const { transitionType, direction, color, intensity, feather } = params

        // Transition logic: 0-0.5 = transition IN, 0.5-1.0 = transition OUT
        const progress = frame.progress
        const isTransitioningIn = progress < 0.5
        const normalizedProgress = isTransitioningIn
            ? progress * 2 // 0 to 1 during first half
            : (1 - progress) * 2 // 1 to 0 during second half

        // Ease the progress
        const eased = 1 - Math.pow(1 - normalizedProgress, 3)
        const alphaMultiplier = intensity / 100

        // Feather creates soft edges
        const featherPx = (feather / 100) * Math.max(width, height) * 0.3

        switch (transitionType) {
            case 'fade': {
                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: color,
                        opacity: eased * alphaMultiplier,
                        pointerEvents: 'none',
                    }} />
                )
            }

            case 'wipe': {
                let gradientDirection = ''
                switch (direction) {
                    case 'left': gradientDirection = 'to left'; break
                    case 'right': gradientDirection = 'to right'; break
                    case 'top': gradientDirection = 'to top'; break
                    case 'bottom': gradientDirection = 'to bottom'; break
                    case 'center': gradientDirection = 'to right'; break
                }

                const wipePos = eased * 100
                const featherPercent = (feather / 100) * 30

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(${gradientDirection}, 
                            ${color} 0%, 
                            ${color} ${Math.max(0, wipePos - featherPercent)}%, 
                            transparent ${Math.min(100, wipePos + featherPercent)}%, 
                            transparent 100%)`,
                        opacity: alphaMultiplier,
                        pointerEvents: 'none',
                    }} />
                )
            }

            case 'slide': {
                let transform = ''
                const slideAmount = 100 - eased * 100
                switch (direction) {
                    case 'left': transform = `translateX(${-slideAmount}%)`; break
                    case 'right': transform = `translateX(${slideAmount}%)`; break
                    case 'top': transform = `translateY(${-slideAmount}%)`; break
                    case 'bottom': transform = `translateY(${slideAmount}%)`; break
                    case 'center': transform = `scale(${eased})`; break
                }

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: color,
                        transform,
                        opacity: alphaMultiplier,
                        pointerEvents: 'none',
                        boxShadow: `0 0 ${featherPx}px ${featherPx / 2}px ${color}`,
                    }} />
                )
            }

            case 'push': {
                let transform = ''
                const pushAmount = 100 - eased * 100
                switch (direction) {
                    case 'left': transform = `translateX(${-pushAmount}%)`; break
                    case 'right': transform = `translateX(${pushAmount}%)`; break
                    case 'top': transform = `translateY(${-pushAmount}%)`; break
                    case 'bottom': transform = `translateY(${pushAmount}%)`; break
                    case 'center': transform = `scale(${0.5 + eased * 0.5})`; break
                }

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(135deg, ${color} 0%, ${color}ee 50%, ${color}dd 100%)`,
                        transform,
                        opacity: alphaMultiplier,
                        pointerEvents: 'none',
                    }} />
                )
            }

            case 'zoom': {
                const scale = 1 + (1 - eased) * 2
                const opacity = eased * alphaMultiplier

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                    }}>
                        <div style={{
                            width: '100%',
                            height: '100%',
                            background: color,
                            transform: `scale(${scale})`,
                            opacity,
                            borderRadius: direction === 'center' ? '50%' : 0,
                        }} />
                    </div>
                )
            }

            case 'iris': {
                // Circular iris wipe from center
                const maxRadius = Math.sqrt(width * width + height * height) / 2
                const radius = eased * maxRadius

                return (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        background: `radial-gradient(circle at center, 
                            transparent 0%, 
                            transparent ${Math.max(0, radius - featherPx)}px, 
                            ${color} ${radius + featherPx}px, 
                            ${color} 100%)`,
                        opacity: alphaMultiplier,
                    }} />
                )
            }

            default:
                return null
        }
    }
}

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

interface ProgressBarParams {
    position: 'top' | 'bottom' | 'center'
    width: number
    height: number
    color: string
    backgroundColor: string
    borderRadius: number
    showOverlay: boolean
    overlayOpacity: number
    style: 'solid' | 'gradient' | 'glow' | 'glass' | 'neon' | 'segmented'
    showPercentage: boolean
    segments: number
}

export const ProgressBarPlugin: PluginDefinition<ProgressBarParams> = {
    id: 'progress-bar',
    name: 'Progress Bar',
    description: 'Premium progress indicator with multiple styles',
    icon: 'Minus',
    category: 'foreground',
    params: {
        position: {
            type: 'enum',
            default: 'center',
            label: 'Position',
            options: [
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'center', label: 'Center' },
            ]
        },
        width: { type: 'number', default: 50, label: 'Width', min: 20, max: 90, step: 5, unit: '%' },
        height: { type: 'number', default: 12, label: 'Height', min: 4, max: 48, step: 2, unit: 'px' },
        color: { type: 'color', default: '#3b82f6', label: 'Color' },
        backgroundColor: { type: 'color', default: '#1e293b', label: 'Bar BG' },
        borderRadius: { type: 'number', default: 6, label: 'Roundness', min: 0, max: 24, step: 1, unit: 'px' },
        showOverlay: { type: 'boolean', default: true, label: 'Show Overlay' },
        overlayOpacity: { type: 'number', default: 60, label: 'Overlay Opacity', min: 0, max: 100, step: 5, unit: '%' },
        style: {
            type: 'enum',
            default: 'glass',
            label: 'Style',
            options: [
                { value: 'solid', label: 'Solid' },
                { value: 'gradient', label: 'Gradient' },
                { value: 'glow', label: 'Glow' },
                { value: 'glass', label: 'Glass' },
                { value: 'neon', label: 'Neon' },
                { value: 'segmented', label: 'Segmented' },
            ]
        },
        showPercentage: { type: 'boolean', default: true, label: 'Show %' },
        segments: { type: 'number', default: 10, label: 'Segments', min: 2, max: 50, step: 1 },
    },
    render(props: PluginRenderProps<ProgressBarParams>) {
        const { params, frame, width: canvasWidth, height: canvasHeight } = props
        const {
            position,
            width,
            height,
            color,
            backgroundColor,
            borderRadius,
            showOverlay,
            overlayOpacity,
            style,
            showPercentage,
            segments
        } = params

        const barWidth = (width / 100) * canvasWidth
        const containerPadding = 24

        // Calculate bar fill based on style
        let barBackground = color
        let boxShadow = 'none'
        let containerBg = backgroundColor
        let containerBorder = 'none'
        let containerShadow = 'none'
        let containerBackdrop = 'none'

        switch (style) {
            case 'gradient':
                barBackground = `linear-gradient(90deg, ${color}cc, ${color}, ${color}cc)`
                break
            case 'glow':
                boxShadow = `0 0 ${height * 1.5}px ${color}, 0 0 ${height * 3}px ${color}66`
                break
            case 'glass':
                containerBg = 'rgba(255, 255, 255, 0.08)'
                containerBorder = '1px solid rgba(255,255,255,0.15)'
                containerShadow = '0 8px 32px rgba(0,0,0,0.2)'
                containerBackdrop = 'blur(16px)'
                barBackground = `linear-gradient(90deg, ${color}dd, ${color})`
                boxShadow = `0 0 ${height}px ${color}44`
                break
            case 'neon':
                containerBg = '#000000'
                containerBorder = `1px solid ${color}44`
                containerShadow = `0 0 20px ${color}22, inset 0 0 20px ${color}11`
                barBackground = color
                boxShadow = `0 0 10px ${color}, 0 0 20px ${color}, 0 0 40px ${color}`
                break
            case 'segmented':
                // Handled in render logic below
                break
        }

        // Position calculation
        const isCenter = position === 'center'
        const positionStyle: React.CSSProperties = isCenter
            ? {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
            }
            : {
                left: '50%',
                transform: 'translateX(-50%)',
                [position]: containerPadding,
            }

        const percentage = Math.round(frame.progress * 100)

        // Segmented bar logic
        const renderSegments = () => {
            const segmentGap = 4
            const totalGap = (segments - 1) * segmentGap
            const segmentWidth = (barWidth - totalGap) / segments
            const activeSegments = Math.ceil(frame.progress * segments)

            return (
                <div style={{
                    display: 'flex',
                    gap: segmentGap,
                    width: barWidth,
                    height,
                }}>
                    {Array.from({ length: segments }).map((_, i) => (
                        <div key={i} style={{
                            flex: 1,
                            height: '100%',
                            background: i < activeSegments ? color : backgroundColor,
                            borderRadius: borderRadius / 2,
                            boxShadow: i < activeSegments && style === 'neon' ? `0 0 10px ${color}` : 'none',
                            opacity: i < activeSegments ? 1 : 0.3,
                        }} />
                    ))}
                </div>
            )
        }

        return (
            <>
                {/* Optional backdrop overlay */}
                {showOverlay && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: `rgba(0, 0, 0, ${overlayOpacity / 100})`,
                        backdropFilter: style === 'glass' ? 'blur(8px)' : 'none',
                        pointerEvents: 'none',
                    }} />
                )}

                {/* Progress container */}
                <div style={{
                    position: 'absolute',
                    ...positionStyle,
                    width: barWidth + containerPadding * 2,
                    padding: containerPadding,
                    background: style === 'glass'
                        ? 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))'
                        : 'transparent',
                    backdropFilter: containerBackdrop,
                    borderRadius: style === 'glass' ? borderRadius * 2 : borderRadius,
                    border: containerBorder,
                    boxShadow: containerShadow,
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 16,
                }}>
                    {/* Percentage label */}
                    {showPercentage && (
                        <div style={{
                            color: 'white',
                            fontSize: Math.max(16, height * 1.2),
                            fontWeight: 700,
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                            letterSpacing: '0.02em',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {percentage}%
                        </div>
                    )}

                    {/* Progress bar track */}
                    {style === 'segmented' ? renderSegments() : (
                        <div style={{
                            width: barWidth,
                            height,
                            background: containerBg,
                            borderRadius,
                            overflow: 'hidden',
                            boxShadow: style === 'glass' ? 'inset 0 2px 4px rgba(0,0,0,0.2)' : 'none',
                            border: style === 'neon' ? `1px solid ${color}33` : 'none',
                        }}>
                            {/* Progress bar fill */}
                            <div style={{
                                height: '100%',
                                width: `${frame.progress * 100}%`,
                                background: barBackground,
                                borderRadius,
                                boxShadow,
                                transition: 'none',
                            }} />
                        </div>
                    )}
                </div>
            </>
        )
    }
}

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
        patternOpacity: { type: 'number', default: 0, label: 'Pattern Opacity', min: 0, max: 100, step: 2, unit: '%' },
        borderStrength: { type: 'number', default: 0, label: 'Frame Border', min: 0, max: 100, step: 4, unit: '%' },
    },
    render(props: PluginRenderProps<BlankClipParams>) {
        const { params, frame } = props
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

        const borderAlpha = Math.max(0, Math.min(1, borderStrength / 100))
        const patternAlpha = Math.max(0, Math.min(1, patternOpacity / 100))
        const hasLabel = showLabel && label.trim().length > 0

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
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        opacity: patternAlpha,
                    }}
                >
                    <defs>
                        <pattern id="blank-clip-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke={accentColor} strokeWidth="0.6" />
                        </pattern>
                        <pattern id="blank-clip-dots" width="8" height="8" patternUnits="userSpaceOnUse">
                            <circle cx="1.6" cy="1.6" r="0.7" fill={accentColor} />
                        </pattern>
                    </defs>
                    {pattern !== 'none' && (
                        <rect width="100" height="100" fill={`url(#blank-clip-${pattern})`} />
                    )}
                </svg>

                {borderAlpha > 0 && (
                    <div style={{
                        position: 'absolute',
                        inset: '6%',
                        borderRadius: 24,
                        border: `${1 + borderAlpha * 3}px solid ${accentColor}`,
                        opacity: 0.35 + borderAlpha * 0.4,
                        boxShadow: `0 0 0 ${8 + borderAlpha * 12}px ${backgroundColor}`,
                    }} />
                )}

                {(showIcon || hasLabel) && (
                    <div style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'center',
                    }}>
                        {showIcon && (
                            <div style={{
                                width: 72,
                                height: 72,
                                borderRadius: 18,
                                border: `2px solid ${accentColor}`,
                                display: 'grid',
                                placeItems: 'center',
                                background: 'rgba(255,255,255,0.04)',
                                boxShadow: `0 12px 30px ${backgroundColor}`,
                            }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                                    <rect x="6" y="4.5" width="4.2" height="15" rx="1.4" fill={accentColor} />
                                    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" fill={accentColor} />
                                </svg>
                            </div>
                        )}
                        {hasLabel && (
                            <div style={{
                                fontSize: 12,
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

// Register demo plugins (cast to any to satisfy registry's generic constraint)
PluginRegistry.register(WindowSlideOverPlugin as PluginDefinition)
PluginRegistry.register(SpotlightPlugin as PluginDefinition)
PluginRegistry.register(ProgressBarPlugin as PluginDefinition)
PluginRegistry.register(BlankClipPlugin as PluginDefinition)
