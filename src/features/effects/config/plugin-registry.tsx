/**
 * Plugin Registry - Central store for all plugins (built-in + community)
 *
 * Plugins are registered here and can be enabled/disabled per project.
 * The sidebar uses this registry to render plugin controls.
 * All plugins are validated before registration.
 */

import type { PluginDefinition, PluginRenderProps } from './plugin-sdk'
import { validatePluginDefinition } from './plugin-sdk'

// Import built-in plugins from separate files
import {
    SpotlightPlugin,
    ProgressBarPlugin,
    BlankClipPlugin,
    WindowSlideOverPlugin,
    AppleTextRevealPlugin,
} from '../plugins'

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
        const customPluginsEnabled =
            process.env.NODE_ENV === 'development' ||
            process.env.NEXT_PUBLIC_ENABLE_CUSTOM_PLUGINS === '1'
        if (!customPluginsEnabled) return

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

                            // Note: Custom plugins are trusted code - no sandboxing is performed.
                            // Use with caution and only load plugins from trusted sources.
                            p.render = (props: PluginRenderProps) => {
                                const { params, frame, width, height } = props
                                const React = require('react')
                                const fn = new Function(
                                    'params', 'ctx', 'width', 'height', 'React',
                                    `'use strict'; try { ${body} } catch(e) { return React.createElement('div', { style: { color: 'red' } }, e.message) }`
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
// REGISTER BUILT-IN PLUGINS
// =============================================================================

PluginRegistry.register(WindowSlideOverPlugin as PluginDefinition)
PluginRegistry.register(SpotlightPlugin as PluginDefinition)
PluginRegistry.register(ProgressBarPlugin as PluginDefinition)
PluginRegistry.register(BlankClipPlugin as PluginDefinition)
PluginRegistry.register(AppleTextRevealPlugin as PluginDefinition)
