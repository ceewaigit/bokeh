/**
 * Plugin SDK - Secure framework for community plugins
 * 
 * SECURITY MODEL:
 * - Plugins can ONLY render overlay elements (React components)
 * - Plugins receive ONLY: frame number, progress, canvas dimensions
 * - Plugins CANNOT access: mouse/keyboard data, file system, network, electronAPI
 * - Parameters are validated to safe types only (no functions, no arbitrary objects)
 */

import type { EffectSchema, ParamDef } from './effect-schemas'

// Re-export types from effect-schemas for consumers
export type { EffectSchema, ParamDef, NumberParam, BooleanParam, EnumParam, ColorParam, StringParam } from './effect-schemas'

// =============================================================================
// SAFE PARAMETER TYPES (What plugins can use)
// =============================================================================

/**
 * Safe parameter types that community plugins can define.
 * These cannot be used to access privileged functionality.
 */
export type SafeParamType =
    | 'number'     // Numeric values with min/max/step constraints
    | 'boolean'    // Toggle switches
    | 'string'     // Plain text (no HTML/scripts)
    | 'color'      // Hex color codes only
    | 'enum'       // Predefined option list
    | 'position'   // { x: number, y: number } in 0-100% range

// Validated safe values
export type SafeValue = number | boolean | string | { x: number; y: number }

// =============================================================================
// FRAME CONTEXT (Read-only info passed to plugins)
// =============================================================================

/**
 * Frame context passed to plugin render function.
 * This is the ONLY information plugins receive about the current state.
 * 
 * NOT INCLUDED (security):
 * - Mouse position/events
 * - Keyboard events
 * - Recording metadata
 * - File paths
 * - User data
 */
export interface PluginFrameContext {
    /** Current frame number */
    frame: number
    /** Composition FPS */
    fps: number
    /** Progress through effect duration (0-1) */
    progress: number
    /** Total effect duration in frames */
    durationFrames: number
    /** Composition width in pixels */
    width: number
    /** Composition height in pixels */
    height: number
}

/**
 * Props passed to plugin render function.
 *
 * Note: For clip-type plugins that need access to other clips (e.g., for
 * freeze-frame backgrounds), use the useComposition() hook from
 * '@/features/rendering/renderer/context/CompositionContext' to access clips and recordings.
 */
export interface PluginRenderProps<TParams extends Record<string, any> = Record<string, any>> {
    /** Resolved parameter values (validated at runtime) */
    params: TParams
    /** Frame context (read-only) */
    frame: PluginFrameContext
    /** Composition width */
    width: number
    /** Composition height */
    height: number
}

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

/**
 * Plugin category determines z-index layer and default behavior
 * - transition: Fullscreen transitions that cover EVERYTHING including cursor (z: 100+)
 * - overlay: Positionable elements like text, shapes, callouts (z: 50-79)
 * - foreground: Fixed elements like watermarks, progress bars (z: 80-100)
 * - underlay: Effects behind cursor like spotlights (z: 10-29)
 * - background: Full-frame custom backgrounds (z: -10 to 0)
 */
export type PluginCategory = 'transition' | 'overlay' | 'foreground' | 'underlay' | 'background'
export type PluginKind = 'effect' | 'clip'

export interface ClipPluginConfig {
    /** Default duration (ms) when inserting a generated clip */
    defaultDurationMs?: number
}

/**
 * Plugin positioning configuration for drag-to-position overlays
 */
export interface PluginPositioning {
    /** Whether plugin supports drag positioning on canvas */
    enabled: boolean
    /** Default X position (0-100% of canvas) */
    defaultX?: number
    /** Default Y position (0-100% of canvas) */
    defaultY?: number
    /** Whether plugin can be resized */
    resizable?: boolean
    /** Snap to grid when positioning */
    snapToGrid?: boolean
}

/**
 * Plugin definition - what a community plugin exports
 */
export interface PluginDefinition<TParams extends Record<string, any> = Record<string, any>> {
    /** Unique plugin ID (alphanumeric + hyphens only) */
    id: string
    /** Display name (plain text) */
    name: string
    /** Optional description for tooltip */
    description?: string
    /** Lucide icon name */
    icon: string
    /** Effect category determines layer and default z-index */
    category: PluginCategory
    /** Plugin type: visual effect (default) or generated clip */
    kind?: PluginKind
    /** Clip configuration for generated clip plugins */
    clip?: ClipPluginConfig
    /** Parameter definitions (drives sidebar UI) */
    params: Record<keyof TParams, ParamDef>
    /** Render function - returns React element (overlays only) */
    render: (props: PluginRenderProps<TParams>) => React.ReactNode
    /** Optional custom settings panel */
    SettingsPanel?: React.ComponentType<{ params: TParams; onChange: (updates: Partial<TParams>) => void }>
    /** Positioning configuration for drag-to-position support */
    positioning?: PluginPositioning
    /** The raw render code string (for persistence/hydration) */
    renderCode?: string
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

const SAFE_ID_REGEX = /^[a-z0-9-]+$/
const SAFE_COLOR_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const UNSAFE_CODE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\bfetch\b/, label: 'fetch' },
    { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
    { pattern: /\bWebSocket\b/, label: 'WebSocket' },
    { pattern: /\bWorker\b/, label: 'Worker' },
    { pattern: /\bimportScripts\b/, label: 'importScripts' },
    { pattern: /\beval\b/, label: 'eval' },
    { pattern: /\bFunction\b/, label: 'Function' },
    { pattern: /\brequire\b/, label: 'require' },
    { pattern: /\bprocess\b/, label: 'process' },
    { pattern: /\bwindow\b/, label: 'window' },
    { pattern: /\bdocument\b/, label: 'document' },
    { pattern: /\bglobalThis\b/, label: 'globalThis' },
    { pattern: /\blocalStorage\b/, label: 'localStorage' },
    { pattern: /\bsessionStorage\b/, label: 'sessionStorage' },
    { pattern: /\bnavigator\b/, label: 'navigator' },
    { pattern: /\bindexedDB\b/, label: 'indexedDB' },
]

function validateRenderCodeSafety(renderCode: string): string[] {
    const violations: string[] = []
    for (const entry of UNSAFE_CODE_PATTERNS) {
        if (entry.pattern.test(renderCode)) {
            violations.push(entry.label)
        }
    }
    return violations
}

/**
 * Validate plugin ID is safe (alphanumeric + hyphens only)
 */
export function isValidPluginId(id: string): boolean {
    return SAFE_ID_REGEX.test(id) && id.length >= 3 && id.length <= 50
}

/**
 * Validate color is a safe hex color
 */
export function isValidColor(color: string): boolean {
    return SAFE_COLOR_REGEX.test(color)
}

/**
 * Validate a parameter value against its definition
 */
export function validateParamValue(value: any, paramDef: ParamDef): boolean {
    switch (paramDef.type) {
        case 'number':
            if (typeof value !== 'number' || isNaN(value)) return false
            if (paramDef.min !== undefined && value < paramDef.min) return false
            if (paramDef.max !== undefined && value > paramDef.max) return false
            return true

        case 'boolean':
            return typeof value === 'boolean'

        case 'string': {
            if (typeof value !== 'string') return false
            // Basic HTML guard; plugins shouldn't emit HTML via params.
            if (/<[^>]+>/.test(value)) return false
            const maxLength = (paramDef as any).maxLength ?? 200
            return value.length <= maxLength
        }

        case 'enum':
            return paramDef.options?.some(opt => opt.value === value) ?? false

        case 'color':
            return typeof value === 'string' && isValidColor(value)

        default:
            return false
    }
}

/**
 * Validate all plugin parameters
 */
export function validatePluginParams(
    params: Record<string, any>,
    schema: Record<string, ParamDef>
): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    for (const [key, paramDef] of Object.entries(schema)) {
        const value = params[key] ?? paramDef.default
        if (!validateParamValue(value, paramDef)) {
            errors.push(`Invalid value for "${key}": ${JSON.stringify(value)}`)
        }
    }

    return { valid: errors.length === 0, errors }
}

/**
 * Validate a complete plugin definition
 */
export function validatePluginDefinition(plugin: PluginDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validate ID
    if (!isValidPluginId(plugin.id)) {
        errors.push(`Invalid plugin ID "${plugin.id}": must be 3-50 lowercase alphanumeric + hyphens`)
    }

    // Validate category
    if (!['transition', 'overlay', 'foreground', 'underlay', 'background'].includes(plugin.category)) {
        errors.push(`Invalid category "${plugin.category}": must be 'transition', 'overlay', 'foreground', 'underlay', or 'background'`)
    }

    // Validate name (no HTML)
    if (/<[^>]+>/.test(plugin.name)) {
        errors.push('Plugin name cannot contain HTML')
    }

    // Validate params schema
    for (const [key, paramDef] of Object.entries(plugin.params)) {
        if (!['number', 'boolean', 'string', 'enum', 'color'].includes(paramDef.type)) {
            errors.push(`Invalid param type "${paramDef.type}" for "${key}"`)
        }
    }

    // Validate render is a function
    if (typeof plugin.render !== 'function') {
        errors.push('Plugin must have a render function')
    }

    if (plugin.renderCode) {
        const violations = validateRenderCodeSafety(plugin.renderCode)
        if (violations.length > 0) {
            errors.push(`Plugin renderCode contains disallowed references: ${violations.join(', ')}`)
        }
    }

    return { valid: errors.length === 0, errors }
}

// =============================================================================
// DEFINE PLUGIN HELPER
// =============================================================================

/**
 * Define a community plugin with validation
 * 
 * @example
 * ```tsx
 * export default definePlugin({
 *   id: 'confetti',
 *   name: 'Confetti Burst',
 *   icon: 'PartyPopper',
 *   category: 'overlay',
 *   params: {
 *     count: { type: 'number', default: 50, min: 10, max: 200, label: 'Particles' },
 *     color: { type: 'color', default: '#ff0000', label: 'Color' },
 *   },
 *   render({ params, frame }) {
 *     return <ConfettiEffect count={params.count} progress={frame.progress} />
 *   }
 * })
 * ```
 */
export function definePlugin<TParams extends Record<string, any>>(
    definition: PluginDefinition<TParams>
): PluginDefinition<TParams> {
    // Validate on definition (dev-time feedback)
    const validation = validatePluginDefinition(definition as PluginDefinition)
    if (!validation.valid) {
        console.error(`[Plugin SDK] Invalid plugin "${definition.id}":`, validation.errors)
    }

    return definition
}

/**
 * Get default values from plugin params
 */
export function getPluginDefaults<TParams extends Record<string, any>>(
    plugin: PluginDefinition<TParams>
): TParams {
    return Object.fromEntries(
        Object.entries(plugin.params).map(([key, param]) => [key, param.default])
    ) as TParams
}

/**
 * Get default z-index for a plugin category
 * Based on layer stack:
 * - transition: 100 (fullscreen transitions above cursor)
 * - foreground: 90 (watermarks, progress bars)
 * - overlay: 60 (text, shapes, callouts)
 * - underlay: 20 (behind cursor effects)
 * - background: -5 (custom backgrounds)
 */
export function getDefaultZIndexForCategory(category: PluginCategory): number {
    switch (category) {
        case 'transition': return 100
        case 'foreground': return 110
        case 'overlay': return 60
        case 'underlay': return 20
        case 'background': return -5
        default: return 50
    }
}

/**
 * Convert plugin to EffectSchema format (for registry)
 */
export function pluginToSchema(plugin: PluginDefinition): EffectSchema {
    return {
        type: plugin.id,
        displayName: plugin.name,
        icon: plugin.icon,
        category: plugin.category,
        params: plugin.params,
    }
}

// =============================================================================
// SECURITY NOTES FOR PLUGIN AUTHORS
// =============================================================================
/**
 * Community Plugin Security Guidelines:
 * 
 * ✅ ALLOWED:
 * - Render React elements (divs, spans, SVGs)
 * - Use CSS for styling (inline styles, CSS-in-JS)
 * - Animate based on frame.progress
 * - Use bundled assets (images imported at build time)
 * 
 * ❌ BLOCKED (will fail validation or be stripped):
 * - Network requests (fetch, XMLHttpRequest)
 * - File system access
 * - eval() or new Function()
 * - Access to window.electronAPI
 * - Access to mouse/keyboard events
 * - Modifying video source
 * - Accessing localStorage/cookies
 * - Running timers (setTimeout/setInterval)
 */
