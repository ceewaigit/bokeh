'use client'

import { useState, useEffect, useRef } from 'react'
import { PluginPreview } from './plugin-preview'
import type { GeneratedPlugin } from './page'

interface PluginPlayerProps {
    plugin: GeneratedPlugin | null
    onError?: (error: Error) => void
}

export function PluginPlayer({ plugin, onError }: PluginPlayerProps) {
    const [progress, setProgress] = useState(0)
    const [isPlaying, setIsPlaying] = useState(true)
    const [isScrubbing, setIsScrubbing] = useState(false)

    const progressRef = useRef(progress)
    const animationRef = useRef<number | null>(null)
    const wasPlayingRef = useRef(false)
    const lastTimeRef = useRef<number>(0)

    // Sync ref with state for the animation loop
    useEffect(() => {
        if (!isPlaying && !isScrubbing) {
            progressRef.current = progress
        }
    }, [progress, isPlaying, isScrubbing])

    // Animation Loop
    useEffect(() => {
        if (!isPlaying || isScrubbing) {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
                animationRef.current = null
            }
            return
        }

        const duration = 3000 // 3 second loop

        const animate = (currentTime: number) => {
            if (!lastTimeRef.current) {
                lastTimeRef.current = currentTime
            }

            const delta = currentTime - lastTimeRef.current
            lastTimeRef.current = currentTime

            // Use a smaller max delta to prevent huge jumps if the tab was backgrounded
            const safeDelta = Math.min(delta, 100)

            let next = progressRef.current + safeDelta / duration

            // Smooth looping
            if (next >= 1) {
                next = next % 1
            }

            progressRef.current = next
            setProgress(next)

            animationRef.current = requestAnimationFrame(animate)
        }

        lastTimeRef.current = performance.now()
        animationRef.current = requestAnimationFrame(animate)

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
            }
        }
    }, [isPlaying, isScrubbing])

    // Reset progress when plugin changes
    useEffect(() => {
        setProgress(0)
        progressRef.current = 0
        setIsPlaying(true)
    }, [plugin?.id])


    // Slider Handlers
    const handlePointerDown = () => {
        wasPlayingRef.current = isPlaying
        setIsPlaying(false)
        setIsScrubbing(true)
    }

    const handlePointerUp = () => {
        setIsScrubbing(false)
        if (wasPlayingRef.current) {
            setIsPlaying(true)
        }
    }

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value) / 100
        setProgress(val)
        progressRef.current = val
    }

    return (
        <div className="flex-1 relative overflow-hidden flex flex-col z-10 h-full">
            <div className="flex-1 relative">
                <PluginPreview
                    plugin={plugin}
                    progress={progress}
                    onError={onError}
                />
            </div>

            {/* Playback Controls - Floating bar */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-5 bg-background/85 backdrop-blur-xl rounded-full px-6 py-3 border border-border/70 shadow-2xl shadow-black/30 z-20 transition-all hover:bg-background/95 hover:scale-[1.02] hover:border-border/60 group">
                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-10 h-10 rounded-full bg-foreground text-background hover:bg-foreground/80 flex items-center justify-center transition-all shadow-lg hover:shadow-white/20 active:scale-95"
                >
                    {isPlaying ? (
                        <div className="flex gap-1">
                            <div className="w-1 h-3 bg-black rounded-full" />
                            <div className="w-1 h-3 bg-black rounded-full" />
                        </div>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    )}
                </button>

                <div className="w-80 flex items-center gap-3">
                    <div className="relative flex-1 h-1.5 group/slider">
                        <div className="absolute inset-0 bg-foreground/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-foreground/30 transition-all duration-100 ease-out"
                                style={{ width: `${progress * 100}%` }}
                            />
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={progress * 100}
                            onChange={handleSliderChange}
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUp}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-foreground rounded-full shadow-lg pointer-events-none transition-all duration-100 ease-out group-hover/slider:scale-125"
                            style={{ left: `calc(${progress * 100}% - 6px)` }}
                        />
                    </div>
                </div>

                <span className="text-xs font-mono text-muted-foreground w-12 text-right tabular-nums font-medium flex items-center justify-end">
                    {Math.round(progress * 100)}%
                </span>
            </div>
        </div>
    )
}
