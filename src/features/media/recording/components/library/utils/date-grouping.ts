import { isToday, isYesterday, subDays, startOfDay } from 'date-fns'

export type DateCategoryId = 'today' | 'yesterday' | 'past7days' | 'past30days' | 'older'

export interface DateCategory {
  id: DateCategoryId
  label: string
  icon: string
}

export const DATE_CATEGORIES: DateCategory[] = [
  { id: 'today', label: 'Today', icon: 'sun' },
  { id: 'yesterday', label: 'Yesterday', icon: 'clock' },
  { id: 'past7days', label: 'Past 7 days', icon: 'calendar' },
  { id: 'past30days', label: 'Past 30 days', icon: 'calendar-days' },
  { id: 'older', label: 'Older', icon: 'archive' },
]

/**
 * Determines which date category a given date belongs to
 */
export function getDateCategory(date: Date): DateCategoryId {
  if (isToday(date)) return 'today'
  if (isYesterday(date)) return 'yesterday'

  const now = new Date()
  const weekAgo = startOfDay(subDays(now, 7))
  const monthAgo = startOfDay(subDays(now, 30))
  const dateStart = startOfDay(date)

  if (dateStart >= weekAgo) return 'past7days'
  if (dateStart >= monthAgo) return 'past30days'
  return 'older'
}

/**
 * Groups an array of items by date category
 * Items should have a timestamp property of type Date
 */
export function groupByDateCategory<T extends { timestamp: Date }>(
  items: T[]
): Map<DateCategoryId, T[]> {
  const groups = new Map<DateCategoryId, T[]>()

  // Initialize all groups (maintains order)
  DATE_CATEGORIES.forEach(cat => groups.set(cat.id, []))

  // Group each item
  items.forEach(item => {
    const category = getDateCategory(item.timestamp)
    groups.get(category)!.push(item)
  })

  return groups
}

/**
 * Returns category counts (only non-empty categories)
 */
export function getCategoryCounts<T extends { timestamp: Date }>(
  items: T[]
): Record<DateCategoryId, number> {
  const counts: Record<DateCategoryId, number> = {
    today: 0,
    yesterday: 0,
    past7days: 0,
    past30days: 0,
    older: 0,
  }

  items.forEach(item => {
    const category = getDateCategory(item.timestamp)
    counts[category]++
  })

  return counts
}

/**
 * Returns only categories that have items (for hiding empty categories)
 */
export function getNonEmptyCategories<T extends { timestamp: Date }>(
  items: T[]
): DateCategory[] {
  const counts = getCategoryCounts(items)
  return DATE_CATEGORIES.filter(cat => counts[cat.id] > 0)
}
