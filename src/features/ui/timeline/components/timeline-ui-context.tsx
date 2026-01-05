"use client"

import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

export interface TimelineUIContextValue {
    scrollLeft: number
    scrollTop: number
    setScrollPos: (left: number, top: number) => void
    onScroll: (e: React.UIEvent<HTMLDivElement>) => void
    scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

const TimelineUIContext = createContext<TimelineUIContextValue | null>(null)

export function useTimelineUI(): TimelineUIContextValue {
    const ctx = useContext(TimelineUIContext)
    if (!ctx) {
        throw new Error('[useTimelineUI] Must be used within TimelineUIProvider')
    }
    return ctx
}

export function TimelineUIProvider({ children }: { children: React.ReactNode }) {
    const [scrollLeft, setScrollLeft] = useState(0)
    const [scrollTop, setScrollTop] = useState(0)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget
        // Update state to trigger re-renders in consumers (Ruler, Tracks)
        // Note: React 18 automatic batching and concurrent features help here,
        // but generic high-frequency scroll updates might benefit from not using React state 
        // if performance issues arise. For now, KISS: use state.
        setScrollLeft(target.scrollLeft)
        setScrollTop(target.scrollTop)
    }, [])

    const setScrollPos = useCallback((left: number, top: number) => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo(left, top)
            // onScroll will fire naturally, but we can also optimistically update if needed
        }
    }, [])

    const value = {
        scrollLeft,
        scrollTop,
        setScrollPos,
        onScroll,
        scrollContainerRef
    }

    return (
        <TimelineUIContext.Provider value={value}>
            {children}
        </TimelineUIContext.Provider>
    )
}
