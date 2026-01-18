"use client"

import { useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Clock, HardDrive } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { type DateCategory, type DateCategoryId } from '../utils/date-grouping'

// ============================================================================
// GREETING SYSTEM - Simplified and elegant
// ============================================================================

interface Greeting {
  text: string
  emphasis: string
  hours?: [number, number]
}

const GREETINGS: Greeting[] = [
  // Time-based greetings
  { text: 'Good morning', emphasis: 'morning', hours: [5, 12] },
  { text: 'Rise and create', emphasis: 'create', hours: [5, 10] },
  { text: 'Fresh start', emphasis: 'Fresh', hours: [6, 9] },
  { text: 'Good afternoon', emphasis: 'afternoon', hours: [12, 17] },
  { text: 'Afternoon session', emphasis: 'session', hours: [13, 17] },
  { text: 'Good evening', emphasis: 'evening', hours: [17, 22] },
  { text: 'Evening edit', emphasis: 'edit', hours: [18, 22] },
  { text: 'Night owl', emphasis: 'Night', hours: [22, 5] },
  { text: 'Late night edit', emphasis: 'edit', hours: [23, 4] },
  { text: 'Burning midnight oil', emphasis: 'midnight', hours: [0, 4] },

  // Creative & inspiring
  { text: 'Your library', emphasis: 'library' },
  { text: 'Your recordings', emphasis: 'recordings' },
  { text: 'Your stories', emphasis: 'stories' },
  { text: 'Your moments', emphasis: 'moments' },
  { text: 'Your work', emphasis: 'work' },
  { text: 'Welcome back', emphasis: 'back' },
  { text: 'Ready to create', emphasis: 'create' },
  { text: 'Make something', emphasis: 'something' },
  { text: "Let's edit", emphasis: 'edit' },
  { text: 'Creative space', emphasis: 'Creative' },
  { text: 'Your canvas', emphasis: 'canvas' },
  { text: 'Start here', emphasis: 'here' },
  { text: 'Pick up where you left off', emphasis: 'left off' },
  { text: 'Back to work', emphasis: 'work' },
  { text: 'In the flow', emphasis: 'flow' },
  { text: 'Make it happen', emphasis: 'happen' },
  { text: 'Create something', emphasis: 'something' },
  { text: 'Your projects', emphasis: 'projects' },
  { text: 'Continue creating', emphasis: 'creating' },
]

function getGreeting(): Greeting {
  const hour = new Date().getHours()
  const timeGreetings = GREETINGS.filter(g => {
    if (!g.hours) return false
    const [start, end] = g.hours
    return start > end ? (hour >= start || hour < end) : (hour >= start && hour < end)
  })
  const genericGreetings = GREETINGS.filter(g => !g.hours)

  // 70% time-based for a more personal feel
  if (timeGreetings.length > 0 && Math.random() < 0.7) {
    return timeGreetings[Math.floor(Math.random() * timeGreetings.length)]
  }
  return genericGreetings[Math.floor(Math.random() * genericGreetings.length)]
}

// ============================================================================
// FORMATTERS
// ============================================================================

function formatDuration(ms: number): string {
  if (ms === 0) return '0m'
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatStorage(bytes: number): string {
  if (bytes === 0) return '0 MB'
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${Math.round(bytes / (1024 ** 2))} MB`
}

// ============================================================================
// BRAND ICON
// ============================================================================

function BokehIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 375 375"
      fill="currentColor"
    >
      <path d="M113.15 244.33c-2.34-.97-4.28-2.62-5.83-4.95-1.56-2.32-2.33-4.75-2.33-7.28V91.83c0-3.49 1.3-6.54 3.92-9.16 2.63-2.62 5.68-3.94 9.16-3.94h30.56c2.72 0 5.15.82 7.28 2.47 2.13 1.65 3.69 3.64 4.66 5.97l11.06 10.77c2.52 2.52 3.78 5.34 3.78 8.44v1.47h14.27c7.96 0 15.23 1.89 21.83 5.67 6.6 3.78 11.84 8.78 15.72 14.98l7.86 7.58c4.07 4.07 7.27 8.78 9.6 14.1 2.33 5.34 3.5 11.1 3.5 17.31v43.67c0 8.15-1.95 15.57-5.83 22.27-3.88 6.69-9.17 12.02-15.87 15.99-6.69 3.98-14.12 5.97-22.27 5.97h-16.58c-5.82 0-11.36-1.06-16.6-3.19-.97.77-2.14 1.5-3.5 2.17-1.36.68-2.81 1.02-4.36 1.02h-30.56c-3.1 0-5.92-1.26-8.44-3.78l-11.02-10.77z" />
      <path d="M238.93 74.71l-2.36-2.36c-1.86-1.16-3.36-2.74-4.51-4.74-1.16-2-1.73-4.22-1.73-6.65v-13.03c0-2.5.59-4.77 1.78-6.8 1.19-2.03 2.81-3.65 4.84-4.88 2.03-1.22 4.3-1.83 6.78-1.83h11.92c2.38 0 4.55.58 6.53 1.73 1.97 1.16 3.55 2.68 4.74 4.57l2.36 2.27c1.22 1.22 2.18 2.59 2.88 4.12.7 1.53 1.05 3.18 1.05 4.96v13.03c0 2.44-.58 4.62-1.73 6.56-1.16 1.94-2.74 3.48-4.74 4.63-2 1.16-4.22 1.73-6.65 1.73h-11.92c-1.81 0-3.5-.35-5.06-1.05-1.56-.7-2.93-1.66-4.18-2.88v.62z" />
    </svg>
  )
}

// ============================================================================
// SIDEBAR COMPONENT
// ============================================================================

interface LibrarySidebarProps {
  categories: DateCategory[]
  counts: Record<DateCategoryId, number>
  activeCategory: string | null
  onCategoryClick: (categoryId: DateCategoryId) => void
  totalCount: number
  collapsed?: boolean
  totalDurationMs?: number
  totalStorageBytes?: number
  lastRecordedDate?: Date | null
}

export function LibrarySidebar({
  categories,
  counts,
  activeCategory,
  onCategoryClick,
  totalCount,
  collapsed = false,
  totalDurationMs = 0,
  totalStorageBytes = 0,
}: LibrarySidebarProps) {
  const reduceMotion = useReducedMotion()
  const greeting = useMemo(() => getGreeting(), [])

  const renderGreeting = () => {
    const { text, emphasis } = greeting
    const parts = text.split(emphasis)
    return (
      <>
        {parts[0] && <span className="font-normal">{parts[0]}</span>}
        <span className="font-display italic">{emphasis}</span>
        {parts[1] && <span className="font-normal">{parts[1]}</span>}
      </>
    )
  }

  // Stats visibility - always show if available
  const hasStats = totalDurationMs > 0 || totalStorageBytes > 0

  return (
    <aside
      className={cn(
        "h-full flex flex-col justify-center",
        collapsed && "items-center"
      )}
    >
      <div className={cn("py-6", collapsed ? "px-2" : "px-0")}>
        {/* Brand + Greeting */}
        {!collapsed && (
          <div className="mb-10">
            {/* Brand icon */}
            <div className="mb-4">
              <BokehIcon className="w-8 h-8 text-foreground/70" />
            </div>

            {/* Greeting */}
            <h1 className="text-2xl xl:text-3xl tracking-tight text-foreground leading-tight font-medium">
              {renderGreeting()}
            </h1>

            {/* Subtitle - count */}
            <p className="mt-2 text-sm text-muted-foreground">
              {totalCount} {totalCount === 1 ? 'recording' : 'recordings'}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="space-y-2">
          {!collapsed && (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 px-2.5 mb-2">
              Timeline
            </p>
          )}
          <nav className="flex flex-col -mx-1">
            {categories.map((category) => (
              <NavItem
                key={category.id}
                label={category.label}
                count={counts[category.id]}
                isActive={activeCategory === category.id}
                collapsed={collapsed}
                onClick={() => onCategoryClick(category.id)}
                reduceMotion={reduceMotion ?? false}
              />
            ))}
          </nav>
        </div>

        {/* Stats section */}
        {!collapsed && hasStats && (
          <div className="mt-8 pt-6 border-t border-border/50">
            <div className="space-y-3">
              <StatItem
                icon={Clock}
                label="Total Duration"
                value={formatDuration(totalDurationMs)}
              />
              <StatItem
                icon={HardDrive}
                label="Storage"
                value={formatStorage(totalStorageBytes)}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

// ============================================================================
// STAT ITEM
// ============================================================================

interface StatItemProps {
  icon: typeof Clock
  label: string
  value: string
}

function StatItem({ icon: Icon, label, value }: StatItemProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-muted-foreground min-w-0">
        <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
        <span className="text-sm truncate">{label}</span>
      </div>
      <span className="text-xs text-foreground tabular-nums font-medium ml-3">
        {value}
      </span>
    </div>
  )
}

// ============================================================================
// NAV ITEM
// ============================================================================

interface NavItemProps {
  label: string
  count: number
  isActive: boolean
  collapsed: boolean
  onClick: () => void
  reduceMotion: boolean
}

function NavItem({ label, count, isActive, collapsed, onClick, reduceMotion }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center w-full",
        "py-2 px-2.5 rounded-lg",
        "text-left text-sm font-normal",
        "transition-colors duration-100 ease-out",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        collapsed && "justify-center"
      )}
    >
      {/* Active indicator - refined pill that slides */}
      {isActive && (
        <motion.div
          layoutId="sidebar-nav-indicator"
          className="absolute inset-0 rounded-md bg-foreground/[0.06]"
          transition={reduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        />
      )}

      {/* Content */}
      <div className="relative flex items-center justify-between flex-1 min-w-0">
        {/* Label and count */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="flex items-center justify-between flex-1 min-w-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <span className="truncate flex-1">{label}</span>
              <span className={cn(
                "text-xs ml-3 tabular-nums",
                isActive ? "text-muted-foreground" : "text-muted-foreground/50"
              )}>
                {count}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </button>
  )
}

// ============================================================================
// SKELETON
// ============================================================================

export function LibrarySidebarSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <aside className={cn(
      "h-full flex flex-col justify-center",
      collapsed && "items-center"
    )}>
      <div className={cn("py-6", collapsed ? "px-2" : "px-0")}>
        {!collapsed && (
          <div className="mb-8">
            <div className="w-7 h-7 rounded-lg bg-muted/15 animate-pulse mb-3" />
            <div className="h-6 w-36 bg-muted/12 rounded-md animate-pulse" />
            <div className="h-4 w-24 bg-muted/8 rounded-md animate-pulse mt-2" />
          </div>
        )}

        {/* Section header skeleton */}
        {!collapsed && (
          <div className="mb-4">
            <div className="h-2.5 w-16 bg-muted/10 rounded animate-pulse" />
          </div>
        )}

        <nav className="flex flex-col -mx-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center py-1.5 px-2">
              <div className="w-3 flex-shrink-0 mr-1" />
              {!collapsed && (
                <div className="flex-1 flex items-center justify-between">
                  <div
                    className="h-3 rounded bg-muted/12 animate-pulse"
                    style={{ width: `${50 + i * 15}px`, opacity: 1 - i * 0.12 }}
                  />
                  <div className="h-2.5 w-4 rounded bg-muted/8 animate-pulse" />
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  )
}
