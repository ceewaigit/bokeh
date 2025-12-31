'use client'

import type { PluginCategory } from '@/features/effects/config/plugin-sdk'

interface LayerVisualizerProps {
    currentCategory: PluginCategory | null
}

const LAYERS = [
    { category: 'transition', label: 'Transition', zIndex: '100+', color: 'bg-foreground', description: 'Above everything' },
    { category: 'cursor', label: 'Cursor', zIndex: '~95', color: 'bg-foreground/40', description: 'Mouse pointer', isSystem: true },
    { category: 'foreground', label: 'Foreground', zIndex: '80-99', color: 'bg-foreground/60', description: 'Watermarks, progress' },
    { category: 'overlay', label: 'Overlay', zIndex: '50-79', color: 'bg-foreground/30', description: 'Text, shapes' },
    { category: 'video', label: 'Video', zIndex: '~40', color: 'bg-muted-foreground/30', description: 'Recording content', isSystem: true },
    { category: 'underlay', label: 'Underlay', zIndex: '10-29', color: 'bg-muted-foreground/20', description: 'Spotlights, glows' },
    { category: 'background', label: 'Background', zIndex: '-10 to 0', color: 'bg-muted-foreground/10', description: 'Behind video' },
] as const

export function LayerVisualizer({ currentCategory }: LayerVisualizerProps) {
    return (
        <div className="bg-card/80 rounded-xl p-4 h-full flex flex-col min-h-0 border border-border/60">
            <h3 className="text-sm font-medium text-foreground mb-3 shrink-0">Layer Stack</h3>

            <div className="space-y-1.5 flex-1 overflow-y-auto min-h-0 pr-2 -mr-2 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
                {LAYERS.map((layer) => {
                    const isActive = layer.category === currentCategory
                    const isSystem = 'isSystem' in layer && layer.isSystem

                    return (
                        <div
                            key={layer.category}
                            className={`
                flex items-center gap-3 px-3 py-2 rounded-lg transition-all shrink-0
                ${isActive ? 'ring-1 ring-foreground/30 bg-background/80' : 'bg-background/50'}
                ${isSystem ? 'opacity-50' : ''}
              `}
                        >
                            {/* Color indicator */}
                            <div className={`w-3 h-3 rounded-full ${layer.color} ${isActive ? 'animate-pulse' : ''}`} />

                            {/* Layer info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                                        {layer.label}
                                    </span>
                                    {isSystem && (
                                        <span className="text-3xs px-1.5 py-0.5 bg-background/70 rounded-full text-muted-foreground border border-border/60">
                                            System
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-muted-foreground block truncate">{layer.description}</span>
                            </div>

                            {/* Z-index */}
                            <span className="text-xs text-muted-foreground font-mono">{layer.zIndex}</span>

                            {/* Active indicator */}
                            {isActive && (
                                <div className="text-xs px-2 py-0.5 bg-foreground/10 text-foreground rounded-full border border-foreground/10">
                                    Active
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground shrink-0">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-foreground animate-pulse" />
                    <span>Your plugin will render in the highlighted layer</span>
                </div>
            </div>
        </div>
    )
}
