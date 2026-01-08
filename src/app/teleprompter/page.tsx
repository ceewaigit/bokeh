"use client"

import { useEffect, useState, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/shared/utils/utils'

/**
 * Teleprompter page - A floating notes window for recording preparation
 * Notes are stored in localStorage per-project (using current project ID if available)
 * 
 * Design: Minimal, Apple-esque interface with clean typography
 */
function TeleprompterContent() {
    const [notes, setNotes] = useState('')
    const [isMounted, setIsMounted] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Storage key - use a simple key for now (could be enhanced with project ID)
    const storageKey = 'teleprompter-notes'

    // Word count calculation
    const wordCount = useMemo(() => {
        const trimmed = notes.trim()
        if (!trimmed) return 0
        return trimmed.split(/\s+/).filter(Boolean).length
    }, [notes])

    // Load notes from storage on mount
    useEffect(() => {
        const saved = localStorage.getItem(storageKey)
        if (saved) {
            setNotes(saved)
        }
        // Trigger mount animation
        setIsMounted(true)
    }, [])

    // Save notes to storage on change (debounced)
    useEffect(() => {
        const timeout = setTimeout(() => {
            localStorage.setItem(storageKey, notes)
        }, 500)
        return () => clearTimeout(timeout)
    }, [notes])

    // Setup body styles using design tokens
    useEffect(() => {
        document.body.style.margin = '0'
        document.body.style.padding = '0'
        document.body.style.overflow = 'hidden'
        // Use CSS variable for theme-aware background
        document.body.style.background = 'hsl(var(--background))'
    }, [])

    return (
        <motion.div
            className="flex flex-col w-full h-screen overflow-hidden bg-background"
            initial={{ opacity: 0 }}
            animate={{ opacity: isMounted ? 1 : 0 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
        >
            {/* Header - minimal, draggable, matches app aesthetic */}
            {/* Left padding accommodates macOS traffic lights when using hiddenInset */}
            <div
                className={cn(
                    "drag-region flex items-center justify-between",
                    "h-11 pl-[86px] pr-4",
                    "border-b border-border/30"
                )}
            >
                <span className="text-sm font-medium text-foreground tracking-[-0.01em]">
                    Notes
                </span>
                <motion.span
                    className="text-xs text-muted-foreground/60 tabular-nums font-medium"
                    key={wordCount}
                    initial={{ opacity: 0.4 }}
                    animate={{ opacity: 0.6 }}
                    transition={{ duration: 0.1 }}
                >
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                </motion.span>
            </div>

            {/* Notes textarea container */}
            <div className="flex-1 relative">
                <textarea
                    ref={textareaRef}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Type your notes here..."
                    className={cn(
                        "w-full h-full resize-none",
                        "px-4 py-3",
                        "bg-transparent border-none",
                        // Typography: clean, readable, using UI font
                        "text-foreground/90 text-ui-sm leading-relaxed",
                        "font-[family-name:var(--font-ui)]",
                        "tracking-[-0.008em]",
                        // Placeholder styling
                        "placeholder:text-muted-foreground/30",
                        "placeholder:transition-opacity placeholder:duration-150",
                        // Focus states
                        "focus:outline-none focus:ring-0",
                        "focus:placeholder:text-muted-foreground/20",
                        // Smart auto-hiding scrollbar
                        "scrollbar-smart"
                    )}
                    autoFocus
                    spellCheck={false}
                />
            </div>
        </motion.div>
    )
}

export default function TeleprompterPage() {
    return <TeleprompterContent />
}