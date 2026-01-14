import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'

interface UseScrollSpyOptions {
  /** IDs of sections to observe */
  sectionIds: string[]
  /** Scroll container ref */
  containerRef: RefObject<HTMLElement | null>
  /** Offset from top for activation (default: 120) */
  offset?: number
}

interface UseScrollSpyReturn {
  /** Currently active section ID */
  activeSection: string | null
  /** Refs to attach to each section element */
  sectionRefs: Record<string, React.MutableRefObject<HTMLElement | null>>
  /** Programmatically scroll to a section */
  scrollToSection: (sectionId: string) => void
}

/**
 * Hook for tracking which section is currently visible in a scrollable container.
 * Uses IntersectionObserver for efficient scroll tracking without per-frame calculations.
 */
export function useScrollSpy({
  sectionIds,
  containerRef,
  offset = 120,
}: UseScrollSpyOptions): UseScrollSpyReturn {
  const [activeSection, setActiveSection] = useState<string | null>(
    sectionIds[0] ?? null
  )

  // Track which sections are currently visible
  const visibleSectionsRef = useRef<Set<string>>(new Set())

  // Create stable refs for each section
  const sectionRefs = useMemo(() => {
    const refs: Record<string, React.MutableRefObject<HTMLElement | null>> = {}
    sectionIds.forEach(id => {
      refs[id] = { current: null }
    })
    return refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds.join(',')])

  // Helper to update active section based on visible sections and scroll position
  const updateActiveSection = useCallback((container: HTMLElement) => {
    const visibleInOrder = sectionIds.filter(id => visibleSectionsRef.current.has(id))

    if (visibleInOrder.length > 0) {
      // Check if we're at the bottom of the scroll container
      const scrollBottom = container.scrollTop + container.clientHeight
      const scrollHeight = container.scrollHeight
      const isAtBottom = scrollHeight - scrollBottom < 50 // Within 50px of bottom

      if (isAtBottom) {
        // At bottom: show the last visible section
        setActiveSection(visibleInOrder[visibleInOrder.length - 1])
      } else {
        // Normal: show the first visible section (topmost)
        setActiveSection(visibleInOrder[0])
      }
    } else if (visibleSectionsRef.current.size === 0) {
      // No sections visible - default to first section
      setActiveSection(sectionIds[0] ?? null)
    }
  }, [sectionIds])

  useEffect(() => {
    const container = containerRef.current
    if (!container || sectionIds.length === 0) return

    // Reset visible sections when sectionIds change
    visibleSectionsRef.current.clear()

    // Calculate rootMargin to account for offset
    // Negative top margin means "trigger later" (when element is further into view)
    const rootMargin = `-${offset}px 0px 0px 0px`

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const sectionId = entry.target.getAttribute('data-section-id')
          if (!sectionId) return

          if (entry.isIntersecting) {
            visibleSectionsRef.current.add(sectionId)
          } else {
            visibleSectionsRef.current.delete(sectionId)
          }
        })

        updateActiveSection(container)
      },
      {
        root: container,
        rootMargin,
        // Trigger when any part of the section is visible
        threshold: 0,
      }
    )

    // Scroll listener to detect "at bottom" state changes
    const handleScroll = () => {
      updateActiveSection(container)
    }

    // Observe all sections
    sectionIds.forEach(id => {
      const element = sectionRefs[id]?.current
      if (element) {
        element.setAttribute('data-section-id', id)
        observer.observe(element)
      }
    })

    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', handleScroll)
      visibleSectionsRef.current.clear()
    }
  }, [sectionIds, containerRef, offset, sectionRefs, updateActiveSection])

  const scrollToSection = useCallback(
    (sectionId: string) => {
      const container = containerRef.current
      const ref = sectionRefs[sectionId]
      const element = ref?.current

      if (!container || !element) return

      const containerRect = container.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      const scrollTop = container.scrollTop
      const targetTop = elementRect.top - containerRect.top + scrollTop - offset + 20

      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      })
    },
    [containerRef, sectionRefs, offset]
  )

  return {
    activeSection,
    sectionRefs,
    scrollToSection,
  }
}
