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

// =============================================================================
// APPLE-STYLE PROGRESS BAR
// =============================================================================

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

// Easing for smooth progress animation
const _easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t)

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

// =============================================================================
// APPLE TEXT REVEAL - Iconic Apple commercial text animations
// =============================================================================

interface AppleTextRevealParams {
    // Content
    text: string

    // Typography
    fontSize: number
    fontWeight: 'light' | 'regular' | 'medium' | 'semibold' | 'bold'
    textColor: string
    textAlign: 'left' | 'center' | 'right'
    letterSpacing: number
    lineHeight: number

    // Background
    backgroundColor: string

    // Animation
    animationStyle: 'fade' | 'blur-fade' | 'slide-fade' | 'scale-fade'
    stagger: 'none' | 'words' | 'lines'
    staggerDelay: number
    fadeInDuration: number
    holdDuration: number
    fadeOutDuration: number
    fadeOutStyle: 'together' | 'sequential' | 'reverse'

    // Effects
    blurAmount: number
    slideDistance: number
    scaleFrom: number
}

export const AppleTextRevealPlugin: PluginDefinition<AppleTextRevealParams> = {
    id: 'apple-text-reveal',
    name: 'Text Reveal',
    description: 'Apple commercial-style text fade in/out animations',
    icon: 'Type',
    category: 'transition',
    params: {
        text: {
            type: 'string',
            default: 'bokeh.',
            label: 'Text'
        },
        fontSize: {
            type: 'number',
            default: 8,
            label: 'Font Size',
            min: 3,
            max: 20,
            step: 0.5,
            unit: '%'
        },
        fontWeight: {
            type: 'enum',
            default: 'light',
            label: 'Weight',
            options: [
                { value: 'light', label: 'Light' },
                { value: 'regular', label: 'Regular' },
                { value: 'medium', label: 'Medium' },
                { value: 'semibold', label: 'Semibold' },
                { value: 'bold', label: 'Bold' },
            ]
        },
        textColor: { type: 'color', default: '#000000', label: 'Text Color' },
        textAlign: {
            type: 'enum',
            default: 'center',
            label: 'Align',
            options: [
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
            ]
        },
        letterSpacing: {
            type: 'number',
            default: -0.02,
            label: 'Letter Spacing',
            min: -0.1,
            max: 0.2,
            step: 0.01,
            unit: 'em'
        },
        lineHeight: {
            type: 'number',
            default: 1.2,
            label: 'Line Height',
            min: 0.8,
            max: 2,
            step: 0.1
        },
        backgroundColor: { type: 'color', default: '#ffffff', label: 'Background' },
        animationStyle: {
            type: 'enum',
            default: 'blur-fade',
            label: 'Animation',
            options: [
                { value: 'fade', label: 'Fade' },
                { value: 'blur-fade', label: 'Blur Fade' },
                { value: 'slide-fade', label: 'Slide Fade' },
                { value: 'scale-fade', label: 'Scale Fade' },
            ]
        },
        stagger: {
            type: 'enum',
            default: 'words',
            label: 'Stagger',
            options: [
                { value: 'none', label: 'None' },
                { value: 'words', label: 'Words' },
                { value: 'lines', label: 'Lines' },
            ]
        },
        staggerDelay: {
            type: 'number',
            default: 80,
            label: 'Stagger Delay',
            min: 20,
            max: 300,
            step: 10,
            unit: 'ms'
        },
        fadeInDuration: {
            type: 'number',
            default: 30,
            label: 'Fade In',
            min: 10,
            max: 50,
            step: 5,
            unit: '%'
        },
        holdDuration: {
            type: 'number',
            default: 40,
            label: 'Hold',
            min: 10,
            max: 60,
            step: 5,
            unit: '%'
        },
        fadeOutDuration: {
            type: 'number',
            default: 30,
            label: 'Fade Out',
            min: 10,
            max: 50,
            step: 5,
            unit: '%'
        },
        fadeOutStyle: {
            type: 'enum',
            default: 'reverse',
            label: 'Fade Out Style',
            options: [
                { value: 'together', label: 'Together' },
                { value: 'sequential', label: 'Sequential' },
                { value: 'reverse', label: 'Reverse' },
            ]
        },
        blurAmount: {
            type: 'number',
            default: 12,
            label: 'Blur Amount',
            min: 0,
            max: 30,
            step: 2,
            unit: 'px'
        },
        slideDistance: {
            type: 'number',
            default: 30,
            label: 'Slide Distance',
            min: 0,
            max: 100,
            step: 5,
            unit: 'px'
        },
        scaleFrom: {
            type: 'number',
            default: 95,
            label: 'Scale From',
            min: 80,
            max: 100,
            step: 1,
            unit: '%'
        },
    },
    render(props: PluginRenderProps<AppleTextRevealParams>) {
        const { params, frame, width: _canvasWidth, height: canvasHeight } = props
        const {
            text,
            fontSize,
            fontWeight,
            textColor,
            textAlign,
            letterSpacing,
            lineHeight,
            backgroundColor,
            animationStyle,
            stagger,
            staggerDelay,
            fadeInDuration,
            holdDuration,
            fadeOutDuration,
            fadeOutStyle,
            blurAmount,
            slideDistance,
            scaleFrom,
        } = params

        const progress = frame.progress
        const fps = frame.fps || 30

        // Easing functions
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
        const easeInOutQuad = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

        // Normalize durations (they should sum to 100%)
        const totalDuration = fadeInDuration + holdDuration + fadeOutDuration
        const fadeInEnd = fadeInDuration / totalDuration
        const holdEnd = (fadeInDuration + holdDuration) / totalDuration

        // Font weight mapping
        const fontWeightMap: Record<string, number> = {
            light: 300,
            regular: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
        }

        // Parse text into elements based on stagger mode
        const parseText = (): { type: 'word' | 'line'; content: string; lineIndex: number }[] => {
            const lines = text.split('\n').filter(l => l.trim())
            const elements: { type: 'word' | 'line'; content: string; lineIndex: number }[] = []

            if (stagger === 'none') {
                // Return entire text as single element
                return [{ type: 'line', content: text, lineIndex: 0 }]
            }

            if (stagger === 'lines') {
                return lines.map((line, i) => ({ type: 'line', content: line, lineIndex: i }))
            }

            // Words mode
            lines.forEach((line, lineIndex) => {
                const words = line.split(/\s+/).filter(w => w)
                words.forEach(word => {
                    elements.push({ type: 'word', content: word, lineIndex })
                })
            })

            return elements
        }

        const elements = parseText()
        const elementCount = elements.length
        const staggerDelayNormalized = staggerDelay / 1000 / (frame.durationFrames / fps) // Convert ms to progress units

        // Calculate animation state for each element
        const getElementState = (index: number, total: number) => {
            // Calculate stagger offset
            const fadeInStaggerOffset = index * staggerDelayNormalized

            // Calculate fade out index based on style
            let fadeOutIndex = index
            if (fadeOutStyle === 'reverse') {
                fadeOutIndex = total - 1 - index
            } else if (fadeOutStyle === 'together') {
                fadeOutIndex = 0 // All start at same time
            }
            const fadeOutStaggerOffset = fadeOutIndex * staggerDelayNormalized

            // Determine phase and local progress
            let opacity = 0
            let blur = blurAmount
            let translateY = slideDistance
            let scale = scaleFrom / 100

            if (progress < fadeInEnd) {
                // Fade in phase
                const phaseProgress = progress / fadeInEnd
                const elementProgress = clamp((phaseProgress - fadeInStaggerOffset / fadeInEnd) / (1 - fadeInStaggerOffset), 0, 1)
                const easedProgress = easeOutCubic(elementProgress)

                opacity = easedProgress
                blur = blurAmount * (1 - easedProgress)
                translateY = slideDistance * (1 - easedProgress)
                scale = (scaleFrom / 100) + ((1 - scaleFrom / 100) * easedProgress)
            } else if (progress < holdEnd) {
                // Hold phase - fully visible
                opacity = 1
                blur = 0
                translateY = 0
                scale = 1
            } else {
                // Fade out phase
                const phaseProgress = (progress - holdEnd) / (1 - holdEnd)
                const adjustedStagger = fadeOutStyle === 'together' ? 0 : fadeOutStaggerOffset / (1 - holdEnd)
                const elementProgress = clamp((phaseProgress - adjustedStagger) / (1 - adjustedStagger), 0, 1)
                const easedProgress = easeInOutQuad(elementProgress)

                opacity = 1 - easedProgress
                blur = blurAmount * easedProgress
                translateY = -slideDistance * easedProgress // Slide up on exit
                scale = 1 - ((1 - scaleFrom / 100) * easedProgress)
            }

            return { opacity, blur, translateY, scale }
        }

        // Build transform string based on animation style
        const getTransform = (state: { translateY: number; scale: number }) => {
            const transforms: string[] = []

            if (animationStyle === 'slide-fade' || animationStyle === 'scale-fade') {
                if (animationStyle === 'slide-fade') {
                    transforms.push(`translateY(${state.translateY}px)`)
                }
                if (animationStyle === 'scale-fade') {
                    transforms.push(`scale(${state.scale})`)
                }
            }

            return transforms.length > 0 ? transforms.join(' ') : 'none'
        }

        // Group elements by line for rendering
        const lineGroups: Map<number, typeof elements> = new Map()
        elements.forEach(el => {
            if (!lineGroups.has(el.lineIndex)) {
                lineGroups.set(el.lineIndex, [])
            }
            lineGroups.get(el.lineIndex)!.push(el)
        })

        const calculatedFontSize = (fontSize / 100) * canvasHeight

        return (
            <div style={{
                position: 'absolute',
                inset: 0,
                background: backgroundColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
                justifyContent: 'center',
                padding: '10%',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                fontSize: calculatedFontSize,
                fontWeight: fontWeightMap[fontWeight] || 400,
                color: textColor,
                letterSpacing: `${letterSpacing}em`,
                lineHeight: lineHeight,
                textAlign: textAlign,
                overflow: 'hidden',
            }}>
                {Array.from(lineGroups.entries()).map(([lineIndex, lineElements]) => (
                    <div key={lineIndex} style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
                        gap: stagger === 'words' ? `0 ${calculatedFontSize * 0.3}px` : 0,
                    }}>
                        {lineElements.map((el, elIndex) => {
                            // Calculate global index for this element
                            let globalIndex = 0
                            for (let i = 0; i < lineIndex; i++) {
                                globalIndex += lineGroups.get(i)?.length || 0
                            }
                            globalIndex += elIndex

                            const state = getElementState(globalIndex, elementCount)
                            const transform = getTransform(state)

                            return (
                                <span
                                    key={`${lineIndex}-${elIndex}`}
                                    style={{
                                        display: 'inline-block',
                                        opacity: state.opacity,
                                        filter: animationStyle === 'blur-fade' || animationStyle === 'fade'
                                            ? `blur(${state.blur}px)`
                                            : 'none',
                                        transform: transform,
                                        willChange: 'opacity, filter, transform',
                                    }}
                                >
                                    {el.content}
                                </span>
                            )
                        })}
                    </div>
                ))}
            </div>
        )
    }
}

// Register demo plugins (cast to any to satisfy registry's generic constraint)
PluginRegistry.register(WindowSlideOverPlugin as PluginDefinition)
PluginRegistry.register(SpotlightPlugin as PluginDefinition)
PluginRegistry.register(ProgressBarPlugin as PluginDefinition)
PluginRegistry.register(BlankClipPlugin as PluginDefinition)
PluginRegistry.register(AppleTextRevealPlugin as PluginDefinition)
