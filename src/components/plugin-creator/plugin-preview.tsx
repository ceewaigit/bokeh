'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as Babel from '@babel/standalone'
import { Sparkles } from 'lucide-react'
import type { GeneratedPlugin } from './page'

interface PluginPreviewProps {
    plugin: GeneratedPlugin | null
    progress: number
    onError?: (error: Error) => void
}

export function PluginPreview({
    plugin,
    progress,
    onError
}: PluginPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    // Compile the render function when code changes
    const [renderFn, setRenderFn] = useState<Function | null>(null)

    useEffect(() => {
        if (!plugin?.renderCode) {
            setRenderFn(null)
            return
        }

        // Clear previous function reference before compiling new one
        // This helps garbage collection by releasing the old closure
        setRenderFn(null)

        let isMounted = true

        const compile = () => {
            try {
                // Wrap in a function to allow top-level return during transpilation
                const wrappedCode = `function _render() {
                    ${plugin.renderCode}
                }`

                // Transpile JSX to JS using Babel
                const transpiled = Babel.transform(wrappedCode, {
                    presets: ['react']
                }).code

                if (!transpiled) throw new Error('Failed to transpile code')

                // Extract the body from the transpiled function
                const body = transpiled
                    .replace(/function\s+_render\s*\(\)\s*\{/, '')
                    .replace(/\}\s*$/, '')
                    .trim()

                // Create a function from the transpiled body
                // Variable names must match what the LLM generates: params, frame, width, height
                const fn = new Function(
                    'params', 'frame', 'width', 'height', 'React',
                    `try {
              ${body}
            } catch (e) {
              // We re-throw to let the component handle the error state
              throw e;
            }`
                )

                if (isMounted) {
                    setRenderFn(() => fn)
                }
            } catch (error) {
                console.error('Plugin compilation error:', error)
                if (isMounted) {
                    setRenderFn(null)
                }
            }
        }

        // Use a timeout to avoid blocking the main thread immediately
        const timer = setTimeout(compile, 0)

        return () => {
            isMounted = false
            clearTimeout(timer)
        }
    }, [plugin?.renderCode])

    // Render the plugin content
    // We don't use useMemo here to avoid overhead on every frame
    let content: React.ReactNode = null
    let error: Error | null = null

    if (renderFn && plugin) {
        try {
            // Get default param values
            const defaultParams: Record<string, unknown> = {}
            if (plugin.params) {
                for (const [key, def] of Object.entries(plugin.params)) {
                    if (typeof def === 'object' && def !== null && 'default' in def) {
                        defaultParams[key] = (def as { default: unknown }).default
                    }
                }
            }

            // Build frame context directly
            const frameContext = {
                frame: Math.floor(progress * 180), // 3 seconds at 60fps
                fps: 60,
                progress,
                durationFrames: 180,
                width: 1920,
                height: 1080
            }

            // Execute with the imported React instance
            const result = renderFn(defaultParams, frameContext, frameContext.width, frameContext.height, React)

            if (result && typeof result === 'object' && 'error' in result) {
                error = result.error as Error
            } else {
                content = result as React.ReactNode
            }
        } catch (e) {
            error = e as Error
        }
    }

    // Responsive scaling
    const [scale, setScale] = useState(1)
    useEffect(() => {
        if (!containerRef.current) return

        const updateSize = () => {
            if (!containerRef.current) return
            const { clientWidth, clientHeight } = containerRef.current

            // Calculate scale to fit (contain)
            const targetWidth = 1920
            const targetHeight = 1080
            const padding = 60 // Increased padding for better breathing room

            const availableWidth = clientWidth - padding * 2
            const availableHeight = clientHeight - padding * 2

            const scaleX = availableWidth / targetWidth
            const scaleY = availableHeight / targetHeight

            // Use the smaller scale to ensure it fits entirely
            // We allow upscaling (remove the , 1 limit) to fill the space if the container is large
            setScale(Math.min(scaleX, scaleY))
        }

        updateSize()
        const observer = new ResizeObserver(updateSize)
        observer.observe(containerRef.current)

        return () => observer.disconnect()
    }, [])

    const width = 1920
    const height = 1080
    const zIndex = getZIndexForCategory(plugin?.category ?? 'overlay')

    // Mock cursor position based on progress
    const cursorX = `${30 + progress * 40}%`
    const cursorY = `${40 + Math.sin(progress * Math.PI * 4) * 10}%`


    return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gradient-to-b from-background via-muted/30 to-background relative group overflow-hidden">
            {/* Grid Pattern Background */}
            <div
                className="absolute inset-0 opacity-[0.12] pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(rgba(0,0,0,0.12) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                    maskImage: 'radial-gradient(circle at center, black 45%, transparent 100%)'
                }}
            />

            {/* Canvas Container */}
            <div
                className="relative shadow-2xl shadow-black/70 overflow-hidden bg-black transition-transform duration-300 ease-out will-change-transform ring-1 ring-border/60"
                style={{
                    width: width,
                    height: height,
                    transform: `scale(${scale})`,
                    transformOrigin: 'center',
                    borderRadius: '20px',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 50px 100px -20px rgba(0,0,0,0.6)',
                    // Ensure it doesn't shrink
                    flexShrink: 0
                }}
            >
                {/* Mock Video Content */}
                <div className="absolute inset-0 bg-muted flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/30 to-muted/60" />

                    {/* Mock Window */}
                    <div className="w-[80%] h-[70%] bg-background/90 rounded-2xl shadow-2xl border border-border/70 flex flex-col overflow-hidden transform transition-transform duration-700 hover:scale-[1.005] group-hover:shadow-foreground/10">
                        <div className="h-10 bg-muted/60 border-b border-border/60 flex items-center px-4 gap-2">
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm" />
                                <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm" />
                                <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm" />
                            </div>
                        </div>
                        <div className="flex-1 p-8 space-y-6 bg-gradient-to-b from-background/60 to-background">
                            <div className="h-6 w-1/3 bg-muted-foreground/10 rounded-md animate-pulse" />
                            <div className="space-y-3">
                                <div className="h-4 w-full bg-muted-foreground/5 rounded-md" />
                                <div className="h-4 w-5/6 bg-muted-foreground/5 rounded-md" />
                                <div className="h-4 w-4/5 bg-muted-foreground/5 rounded-md" />
                            </div>
                            <div className="pt-4 flex gap-4">
                                <div className="h-24 w-32 bg-muted-foreground/5 rounded-lg border border-border/60" />
                                <div className="h-24 w-32 bg-muted-foreground/5 rounded-lg border border-border/60" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Render the plugin */}
                <div className="absolute inset-0 z-[var(--z-index)]" style={{ '--z-index': zIndex } as React.CSSProperties}>
                    {error ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 backdrop-blur-sm p-4">
                            <div className="bg-destructive/90 border border-destructive/20 text-destructive-foreground p-6 rounded-xl text-sm font-mono max-w-2xl overflow-auto shadow-2xl flex flex-col gap-4">
                                <div>
                                    <div className="font-bold mb-2 text-destructive-foreground flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                                        Runtime Error
                                    </div>
                                    <div className="opacity-80 whitespace-pre-wrap">{error.message}</div>
                                </div>
                                {onError && (
                                    <button
                                        onClick={() => onError(error)}
                                        className="self-start px-4 py-2 bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground rounded-lg border border-destructive/30 transition-colors flex items-center gap-2 text-xs font-medium"
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        Fix with AI
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        content
                    )}
                </div>

                {/* Mock Cursor */}
                <div
                    className="absolute w-6 h-6 pointer-events-none z-[95] transition-transform duration-75 ease-out"
                    style={{
                        left: cursorX,
                        top: cursorY,
                        transform: 'translate(-50%, -50%)',
                        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))'
                    }}
                >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="white" stroke="black" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                </div>

                {/* No plugin message */}
                {!plugin && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-background/70 backdrop-blur-xl rounded-3xl p-10 text-center max-w-md border border-border/70 shadow-2xl transform transition-all hover:scale-105 hover:bg-background/80 group-hover:border-border/50">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-background to-muted/60 flex items-center justify-center mx-auto mb-6 border border-border/70 shadow-inner">
                                <Sparkles className="w-8 h-8 text-foreground" />
                            </div>
                            <h3 className="text-2xl font-semibold mb-3 text-foreground tracking-tight">Ready to Create</h3>
                            <p className="text-muted-foreground text-base leading-relaxed">
                                Describe an effect in the chat to generate<br />a custom plugin preview instantly.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function getZIndexForCategory(category: string): number {
    switch (category) {
        case 'transition': return 100
        case 'foreground': return 90
        case 'overlay': return 60
        case 'underlay': return 20
        case 'background': return -5
        default: return 50
    }
}
