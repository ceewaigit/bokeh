"use client"

import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  /** Pixels before bottom to trigger load (default: 200) */
  threshold?: number
  /** Whether currently loading more items */
  isLoading?: boolean
  /** Whether more items exist to load */
  hasMore: boolean
  /** Callback to load more items */
  onLoadMore: () => void
}

/**
 * Hook for infinite scroll using IntersectionObserver
 * Returns a ref to attach to a sentinel element at the bottom of the scrollable content
 */
export function useInfiniteScroll({
  threshold = 200,
  isLoading = false,
  hasMore,
  onLoadMore,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(onLoadMore)

  // Keep loadMore callback fresh
  loadMoreRef.current = onLoadMore

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry?.isIntersecting && hasMore && !isLoading) {
        loadMoreRef.current()
      }
    },
    [hasMore, isLoading]
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(handleIntersect, {
      // Trigger when sentinel is within threshold pixels of viewport
      rootMargin: `${threshold}px`,
      threshold: 0,
    })

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [handleIntersect, threshold])

  return { sentinelRef }
}
