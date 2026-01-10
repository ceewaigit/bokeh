"use client"

import React, { createContext, useContext, useCallback, useMemo, useRef } from 'react'

export interface TimelineUIContextValue {
    scrollLeftRef: React.MutableRefObject<number>
    scrollTopRef: React.MutableRefObject<number>
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
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const scrollLeftRef = useRef(0)
    const scrollTopRef = useRef(0)

    const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget
        scrollLeftRef.current = target.scrollLeft
        scrollTopRef.current = target.scrollTop
    }, [])

    const setScrollPos = useCallback((left: number, top: number) => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo(left, top)
            scrollLeftRef.current = left
            scrollTopRef.current = top
        }
    }, [])

    const value = useMemo<TimelineUIContextValue>(() => ({
        scrollLeftRef,
        scrollTopRef,
        setScrollPos,
        onScroll,
        scrollContainerRef
    }), [setScrollPos, onScroll])

    return (
        <TimelineUIContext.Provider value={value}>
            {children}
        </TimelineUIContext.Provider>
    )
}
