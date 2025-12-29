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
                                // eslint-disable-next-line @typescript-eslint/no-require-imports
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

// Apple-esque easing functions for refined motion
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4)
const easeInOutQuart = (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2

// Utility to parse hex color to rgba
const hexToRgba = (hex: string, alpha: number): string => {
    const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i
    hex = hex.replace(shorthand, (_, r, g, b) => r + r + g + g + b + b)
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return `rgba(0, 0, 0, ${alpha})`
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`
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
        const { params, frame, width: canvasWidth } = props
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

// Register demo plugins (cast to any to satisfy registry's generic constraint)
PluginRegistry.register(WindowSlideOverPlugin as PluginDefinition)
PluginRegistry.register(SpotlightPlugin as PluginDefinition)
PluginRegistry.register(ProgressBarPlugin as PluginDefinition)
PluginRegistry.register(BlankClipPlugin as PluginDefinition)
