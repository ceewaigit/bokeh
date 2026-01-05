import { useCallback, useEffect, useState } from 'react'

export const useLibraryGridCapacity = (gridGapPx: number) => {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null)
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null)
  const [gridCapacity, setGridCapacity] = useState(0)
  const [isExpandedLayout, setIsExpandedLayout] = useState(false)

  const recomputeGridCapacity = useCallback(() => {
    if (!scrollEl || !gridEl) return

    const gridStyle = getComputedStyle(gridEl)
    const columns = Math.max(1, gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length)
    const availableWidth = gridEl.clientWidth

    const headerHeight = headerEl?.offsetHeight ?? 0
    const availableHeight = Math.max(0, scrollEl.clientHeight - headerHeight - 48)

    const cardWidth = (availableWidth - gridGapPx * (columns - 1)) / columns
    const expandedLayout = availableHeight >= 980
    const detailsHeight = expandedLayout ? 72 : 0
    const cardHeight = (cardWidth * 9) / 16 + detailsHeight
    const rows = Math.max(1, Math.floor((availableHeight + gridGapPx) / (cardHeight + gridGapPx)))

    setGridCapacity(columns * rows)
    setIsExpandedLayout((prev) => (prev === expandedLayout ? prev : expandedLayout))
  }, [gridGapPx, gridEl, headerEl, scrollEl])

  useEffect(() => {
    if (!scrollEl || !gridEl) return

    let rafId: number | null = null
    const schedule = () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = null
        recomputeGridCapacity()
      })
    }

    schedule()

    const ro = new ResizeObserver(schedule)
    ro.observe(scrollEl)
    ro.observe(gridEl)
    if (headerEl) ro.observe(headerEl)

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [gridEl, headerEl, recomputeGridCapacity, scrollEl])

  return {
    gridCapacity,
    isExpandedLayout,
    setScrollEl,
    setHeaderEl,
    setGridEl
  }
}
