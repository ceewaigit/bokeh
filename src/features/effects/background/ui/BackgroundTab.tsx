'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { Monitor, Layers, Droplets, Palette, Image as ImageIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BackgroundEffectData, Effect } from '@/types/project'
import { BackgroundType } from '@/types/project'
import { DEFAULT_PARALLAX_LAYERS, DEFAULT_BACKGROUND_DATA } from '../config'
import { GRADIENT_PRESETS } from '@/features/effects/components/constants'
import { ColorPickerPopover } from '@/components/ui/color-picker'
import { getElectronAssetUrl } from '@/shared/assets/electron-asset-url'
import { InfoTooltip } from '@/features/effects/components/info-tooltip'

interface Wallpaper {
  name: string
  path: string
  absolutePath?: string
  thumbnail?: string
  isPreinstalled?: boolean
}

interface BackgroundTabProps {
  backgroundEffect: Effect | undefined
  onUpdateBackground: (updates: Partial<BackgroundEffectData>) => void
}

type ParallaxPreset = { id: string; name: string; folder: string; files: string[] }

let cachedMacOSWallpapers: Wallpaper[] | null = null
let macOSWallpapersPromise: Promise<Wallpaper[] | null> | null = null

const WALLPAPERS_PER_PAGE = 12
const DEFAULT_WALLPAPER_NAME = 'Sonoma'

type PreinstalledWallpaper = { id: string; name: string; path: string; absolutePath: string; thumbnail?: string }

export function BackgroundTab({ backgroundEffect, onUpdateBackground }: BackgroundTabProps) {
  const backgroundTypeOptions: Array<{
    type: BackgroundType
    label: string
    description: string
    icon: React.ComponentType<{ className?: string }>
  }> = [
      { type: BackgroundType.Wallpaper, label: 'Scenes', description: 'Dynamic wallpaper backgrounds', icon: Monitor },
      { type: BackgroundType.Parallax, label: 'Depth', description: 'Layered parallax effect', icon: Layers },
      { type: BackgroundType.Gradient, label: 'Blend', description: 'Smooth color gradients', icon: Droplets },
      { type: BackgroundType.Color, label: 'Solid', description: 'Single solid color', icon: Palette },
      { type: BackgroundType.Image, label: 'Photo', description: 'Custom image background', icon: ImageIcon },
    ]
  const [backgroundType, setBackgroundType] = useState<BackgroundType>(BackgroundType.Gradient)
  const [preinstalledWallpapers, setPreinstalledWallpapers] = useState<PreinstalledWallpaper[]>([])
  const [macOSWallpapers, setMacOSWallpapers] = useState<{ wallpapers: Wallpaper[] }>({
    wallpapers: cachedMacOSWallpapers || []
  })
  const [loadingWallpapers, setLoadingWallpapers] = useState(false)
  const [loadingWallpaperId, setLoadingWallpaperId] = useState<string | null>(null)
  const [wallpaperPage, setWallpaperPage] = useState(0)
  const [wallpaperThumbnails, setWallpaperThumbnails] = useState<Record<string, string>>({})
  const pendingWallpaperThumbsRef = useRef<Set<string>>(new Set())
  const autoAppliedDefaultWallpaperRef = useRef(false)
  const repairedWallpaperKeyRef = useRef(false)
  const [parallaxPresets, setParallaxPresets] = useState<ParallaxPreset[]>([])
  const [selectedParallaxPresetId, setSelectedParallaxPresetId] = useState<string | null>(null)
  const [loadingParallaxPresets, setLoadingParallaxPresets] = useState(false)

  const defaultWallpaperKey = useMemo(() => {
    const match = macOSWallpapers.wallpapers.find(w => w.name === DEFAULT_WALLPAPER_NAME)
    return match?.path
  }, [macOSWallpapers.wallpapers])

  const selectedWallpaperKey = useMemo(() => {
    const data = backgroundEffect?.data as BackgroundEffectData | undefined
    if (data?.type !== BackgroundType.Wallpaper) return undefined
    if (data.wallpaperKey) return data.wallpaperKey
    if (data.wallpaper) return undefined
    return defaultWallpaperKey
  }, [backgroundEffect, defaultWallpaperKey])

  // Combined wallpapers: preinstalled first, then macOS
  const allWallpapers = useMemo(() => {
    // Convert preinstalled wallpapers to the same format
    const preinstalled: Wallpaper[] = preinstalledWallpapers.map(w => ({
      ...w,
      thumbnail: w.thumbnail,
      isPreinstalled: true
    }))

    // Sort macOS wallpapers with default first
    const macOS = [...macOSWallpapers.wallpapers]

    const defaultIndex = macOS.findIndex(w => w.name === DEFAULT_WALLPAPER_NAME)
    if (defaultIndex > 0) {
      const defaultWallpaper = macOS.splice(defaultIndex, 1)[0]
      macOS.unshift(defaultWallpaper)
    }

    const combined = [...preinstalled, ...macOS.map(w => ({ ...w, isPreinstalled: false }))]

    if (!selectedWallpaperKey) return combined

    const selectedIndex = combined.findIndex((w) => (w.absolutePath || w.path) === selectedWallpaperKey)
    if (selectedIndex <= 0) return combined

    const next = [...combined]
    const [selected] = next.splice(selectedIndex, 1)
    next.unshift(selected)
    return next
  }, [preinstalledWallpapers, macOSWallpapers.wallpapers, selectedWallpaperKey])

  const totalPages = Math.ceil(allWallpapers.length / WALLPAPERS_PER_PAGE)
  const paginatedWallpapers = allWallpapers.slice(
    wallpaperPage * WALLPAPERS_PER_PAGE,
    (wallpaperPage + 1) * WALLPAPERS_PER_PAGE
  )

  // Sync backgroundType with actual background effect type
  useEffect(() => {
    if (backgroundEffect?.data) {
      const bgData = backgroundEffect.data as BackgroundEffectData
      if (bgData.type) {
        setBackgroundType(bgData.type)
      }
    }
  }, [backgroundEffect])

  // Load preinstalled wallpapers when wallpaper tab is selected
  useEffect(() => {
    if (backgroundType !== BackgroundType.Wallpaper) return
    if (preinstalledWallpapers.length > 0) return

    window.electronAPI?.listPreinstalledWallpapers?.()
      .then((wallpapers) => {
        if (wallpapers?.length) {
          setPreinstalledWallpapers(wallpapers)
        }
      })
      .catch((error) => {
        console.error('Failed to load preinstalled wallpapers:', error)
      })
  }, [backgroundType, preinstalledWallpapers.length])

  // Load macOS wallpapers when wallpaper tab is selected
  useEffect(() => {
    if (backgroundType !== BackgroundType.Wallpaper) return
    if (macOSWallpapers.wallpapers.length > 0 || loadingWallpapers) return

    if (cachedMacOSWallpapers && cachedMacOSWallpapers.length > 0) {
      setMacOSWallpapers({ wallpapers: cachedMacOSWallpapers })
      return
    }

    if (macOSWallpapersPromise) {
      setLoadingWallpapers(true)
      macOSWallpapersPromise.then((wallpapers) => {
        if (wallpapers) setMacOSWallpapers({ wallpapers })
      }).finally(() => setLoadingWallpapers(false))
      return
    }

    if (window.electronAPI?.getMacOSWallpapers) {
      setLoadingWallpapers(true)
      macOSWallpapersPromise = window.electronAPI.getMacOSWallpapers()
        .then((data: { wallpapers: Wallpaper[] }) => {
          const wallpapers = (data?.wallpapers || []) as Wallpaper[]
          cachedMacOSWallpapers = wallpapers
          setMacOSWallpapers({ wallpapers })
          return wallpapers
        })
        .catch((error) => {
          console.error('Failed to load macOS wallpapers:', error)
          cachedMacOSWallpapers = []
          setMacOSWallpapers({ wallpapers: [] })
          return []
        })
        .finally(() => {
          macOSWallpapersPromise = null
          setLoadingWallpapers(false)
        })
    } else {
      cachedMacOSWallpapers = []
      setMacOSWallpapers({ wallpapers: [] })
      setLoadingWallpapers(false)
    }
  }, [backgroundType, loadingWallpapers, macOSWallpapers.wallpapers.length])

  // Load thumbnails for the current wallpaper page in a batch
  useEffect(() => {
    if (backgroundType !== BackgroundType.Wallpaper) return
    if (!window.electronAPI?.getWallpaperThumbnails) return

    const pending = pendingWallpaperThumbsRef.current
    const pages = [wallpaperPage]
    const total = Math.max(1, Math.ceil(allWallpapers.length / WALLPAPERS_PER_PAGE))
    if (wallpaperPage + 1 < total) pages.push(wallpaperPage + 1)

    const targets = pages.flatMap((page) => {
      return allWallpapers.slice(
        page * WALLPAPERS_PER_PAGE,
        (page + 1) * WALLPAPERS_PER_PAGE
      )
    })

    const missing = targets
      .map((wallpaper) => {
        const key = wallpaper.absolutePath || wallpaper.path
        return key ? { key, path: key } : null
      })
      .filter((entry): entry is { key: string; path: string } => Boolean(entry))
      .filter(({ key }) => !wallpaperThumbnails[key] && !pending.has(key))

    if (missing.length === 0) return

    for (const { key } of missing) pending.add(key)

    window.electronAPI.getWallpaperThumbnails(missing.map(({ path }) => path))
      .then((result) => {
        if (!result) return
        setWallpaperThumbnails((prev) => {
          const next = { ...prev }
          for (const [path, dataUrl] of Object.entries(result)) {
            if (dataUrl) next[path] = dataUrl
          }
          return next
        })
      })
      .catch((error) => {
        console.error('Failed to load wallpaper thumbnails:', error)
      })
      .finally(() => {
        for (const { key } of missing) pending.delete(key)
      })
  }, [backgroundType, wallpaperPage, allWallpapers, wallpaperThumbnails])

  const bgData = backgroundEffect?.data as BackgroundEffectData
  const [localBlur, setLocalBlur] = useState<number | null>(null)
  const parallaxPreviewRef = useRef<HTMLDivElement | null>(null)
  const parallaxPreviewRafRef = useRef<number | null>(null)
  const [parallaxPreviewMouse, setParallaxPreviewMouse] = useState({ x: 0.5, y: 0.5, active: false })
  const softFocusEnabled = (bgData?.blur ?? 0) > 0

  // Ensure the selected wallpaper is visible after reordering.
  useEffect(() => {
    if (backgroundType !== BackgroundType.Wallpaper) return
    if (!selectedWallpaperKey) return
    setWallpaperPage(0)
  }, [backgroundType, selectedWallpaperKey])

  // Auto-apply the default wallpaper once when Wallpaper is active but no image has been applied yet.
  useEffect(() => {
    if (backgroundType !== BackgroundType.Wallpaper) return
    if (bgData?.type !== BackgroundType.Wallpaper) return
    if (bgData.wallpaper) return
    if (!selectedWallpaperKey) return
    if (autoAppliedDefaultWallpaperRef.current) return
    if (!window.electronAPI?.loadWallpaperImage) return

    autoAppliedDefaultWallpaperRef.current = true
    window.electronAPI.loadWallpaperImage(selectedWallpaperKey)
      .then((dataUrl) => {
        if (!dataUrl) return
        onUpdateBackground({
          type: BackgroundType.Wallpaper,
          wallpaper: dataUrl,
          wallpaperKey: selectedWallpaperKey
        })
      })
      .catch((error) => {
        console.error('Failed to auto-apply default wallpaper:', error)
      })
  }, [backgroundType, bgData?.type, bgData?.wallpaper, onUpdateBackground, selectedWallpaperKey])

  // Repair `wallpaperKey` for legacy state (wallpaper dataUrl stored, key missing) so we can indicate selection + reorder.
  useEffect(() => {
    if (backgroundType !== BackgroundType.Wallpaper) return
    if (bgData?.type !== BackgroundType.Wallpaper) return
    if (!bgData.wallpaper) return
    if (bgData.wallpaperKey) return
    if (repairedWallpaperKeyRef.current) return

    const loadImageAsDataUrl = window.electronAPI?.loadImageAsDataUrl
    const loadWallpaperImage = window.electronAPI?.loadWallpaperImage
    if (!loadImageAsDataUrl && !loadWallpaperImage) return
    if (allWallpapers.length === 0) return

    repairedWallpaperKeyRef.current = true
    let cancelled = false

    ;(async () => {
      for (const candidate of allWallpapers) {
        if (cancelled) return
        const candidateKey = candidate.absolutePath || candidate.path
        if (!candidateKey) continue

        try {
          const dataUrl = candidate.isPreinstalled && candidate.absolutePath && loadImageAsDataUrl
            ? await loadImageAsDataUrl(candidate.absolutePath)
            : loadWallpaperImage
              ? await loadWallpaperImage(candidate.path)
              : null

          if (cancelled) return
          if (dataUrl && dataUrl === bgData.wallpaper) {
            onUpdateBackground({ wallpaperKey: candidateKey })
            return
          }
        } catch {
          // ignore and keep searching
        }
      }
    })()

    return () => { cancelled = true }
  }, [allWallpapers, backgroundType, bgData?.type, bgData?.wallpaper, bgData?.wallpaperKey, onUpdateBackground])

  useEffect(() => {
    if (backgroundType !== BackgroundType.Parallax) return
    if (loadingParallaxPresets) return
    if (parallaxPresets.length > 0) return
    let isActive = true
    let timeoutId: number | null = null

    const buildFallbackPresets = (): ParallaxPreset[] => {
      const byFolder = new Map<string, Set<string>>()
      for (const layer of (bgData?.parallaxLayers?.length ? bgData.parallaxLayers : DEFAULT_PARALLAX_LAYERS)) {
        const parts = layer.image.split('/').filter(Boolean)
        const parallaxIndex = parts.indexOf('parallax')
        if (parallaxIndex === -1) continue
        const folder = parts[parallaxIndex + 1]
        const file = parts[parallaxIndex + 2]
        if (!folder || !file) continue
        if (!byFolder.has(folder)) byFolder.set(folder, new Set())
        byFolder.get(folder)!.add(file)
      }
      return Array.from(byFolder.entries()).map(([folder, files]) => ({
        id: folder,
        name: folder,
        folder,
        files: Array.from(files).sort((a, b) => a.localeCompare(b)),
      }))
    }

    const pickDefaultPresetId = (presets: ParallaxPreset[]) => {
      if (presets.some(p => p.id === 'hill')) return 'hill'
      return presets[0]?.id ?? null
    }

    setLoadingParallaxPresets(true)
    const maybeElectron = window.electronAPI?.listParallaxPresets
    const electronLoader = maybeElectron ? maybeElectron() : Promise.resolve(buildFallbackPresets())

    // Add timeout to prevent infinite loading - fallback to defaults after 3s
    const timeoutPromise = new Promise<ParallaxPreset[]>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(buildFallbackPresets()), 3000)
    })

    const loader = Promise.race([electronLoader, timeoutPromise])

    loader
      .then((presets) => {
        if (!isActive) return
        const sanitized = (presets || []).filter(p => p.files?.length)
        // If we got empty results or timed out, use fallback
        const finalPresets = sanitized.length > 0 ? sanitized : buildFallbackPresets()
        setParallaxPresets(finalPresets)
        setSelectedParallaxPresetId(prev => prev ?? pickDefaultPresetId(finalPresets))
      })
      .catch(() => {
        if (!isActive) return
        const fallback = buildFallbackPresets()
        setParallaxPresets(fallback)
        setSelectedParallaxPresetId(prev => prev ?? pickDefaultPresetId(fallback))
      })
      .finally(() => {
        if (isActive) {
          setLoadingParallaxPresets(false)
        }
      })
    return () => {
      isActive = false
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [backgroundType, bgData?.parallaxLayers, loadingParallaxPresets, parallaxPresets.length])

  const selectedParallaxPreset = useMemo(() => {
    if (!selectedParallaxPresetId) return null
    return parallaxPresets.find(p => p.id === selectedParallaxPresetId) ?? null
  }, [parallaxPresets, selectedParallaxPresetId])

  const previewParallaxLayers = useMemo(() => {
    const files = selectedParallaxPreset?.files
    const folder = selectedParallaxPreset?.folder

    if (!files?.length || !folder) {
      return (bgData?.parallaxLayers?.length ? bgData.parallaxLayers : DEFAULT_PARALLAX_LAYERS)
    }

    const sorted = [...files].sort((a, b) => {
      const ak = Number((a.match(/(\d+)(?!.*\d)/)?.[1]) ?? Number.NEGATIVE_INFINITY)
      const bk = Number((b.match(/(\d+)(?!.*\d)/)?.[1]) ?? Number.NEGATIVE_INFINITY)
      if (ak !== bk) return bk - ak
      return a.localeCompare(b)
    })

    const maxFactor = 50
    const minFactor = 10
    const steps = Math.max(1, sorted.length - 1)

    return sorted.map((file, index) => {
      const t = steps === 0 ? 0 : index / steps
      const factor = Math.round(maxFactor + (minFactor - maxFactor) * t)
      return { image: `/parallax/${folder}/${file}`, factor, zIndex: index + 1 }
    })
  }, [bgData?.parallaxLayers, selectedParallaxPreset])

  useEffect(() => {
    if (bgData?.blur != null) setLocalBlur(bgData.blur)
    else setLocalBlur(null)
  }, [bgData?.blur])

  return (
    <div className="space-y-4">

      {/* Horizontal Background Type Tabs with scroll arrows */}
      <div className="rounded-md bg-background/40 p-2.5 space-y-2">
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Source</div>
        <div className="grid grid-cols-5 gap-1.5">
          {backgroundTypeOptions.map((option) => {
            const Icon = option.icon
            const isSelected = backgroundType === option.type
            return (
              <Tooltip key={option.type} delayDuration={400}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setBackgroundType(option.type)}
                    className={cn(
                      'group flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center transition-all',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 text-foreground shadow-sm'
                        : 'border-border/40 bg-background/40 text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md border",
                        isSelected ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 bg-background/60 text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="text-2xs font-medium leading-none">{option.label}</div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {option.description}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>

      <div className="border-t border-border/30 pt-2">
        {/* macOS Wallpapers */}
        {backgroundType === BackgroundType.Wallpaper && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Scenes</h4>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setWallpaperPage(p => Math.max(0, p - 1))}
                    disabled={wallpaperPage === 0}
                    className="p-1 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-2xs text-muted-foreground min-w-8 text-center tabular-nums">
                    {wallpaperPage + 1}/{totalPages}
                  </span>
                  <button
                    onClick={() => setWallpaperPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={wallpaperPage >= totalPages - 1}
                    className="p-1 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {loadingWallpapers ? (
              <div className="text-xs text-muted-foreground">Loading wallpapers...</div>
            ) : paginatedWallpapers.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {paginatedWallpapers.map((wallpaper, index) => {
                  const globalIndex = wallpaperPage * WALLPAPERS_PER_PAGE + index
                  const wallpaperId = `${wallpaper.path}-${globalIndex}`
                  const isLoading = loadingWallpaperId === wallpaperId
                  const isDefault = wallpaper.name === DEFAULT_WALLPAPER_NAME
                  const wallpaperKey = wallpaper.absolutePath || wallpaper.path
                  const resolvedThumbnail = wallpaperKey ? (wallpaperThumbnails[wallpaperKey] || wallpaper.thumbnail) : wallpaper.thumbnail
                  const isSelected = Boolean(selectedWallpaperKey && wallpaperKey && wallpaperKey === selectedWallpaperKey)

                  return (
                    <button
                      key={wallpaperId}
                      onClick={async () => {
                        setLoadingWallpaperId(wallpaperId)
                        try {
                          if (wallpaper.isPreinstalled && wallpaper.absolutePath) {
                            // For preinstalled wallpapers, load via absolutePath
                            const dataUrl = await window.electronAPI?.loadImageAsDataUrl?.(wallpaper.absolutePath)
                            if (dataUrl) {
                              onUpdateBackground({
                                type: BackgroundType.Wallpaper,
                                wallpaper: dataUrl,
                                wallpaperKey: wallpaper.absolutePath
                              })
                            }
                          } else {
                            // For macOS wallpapers, use loadWallpaperImage
                            const dataUrl = await window.electronAPI?.loadWallpaperImage?.(wallpaper.path)
                            if (dataUrl) {
                              const stableKey = wallpaper.absolutePath || wallpaper.path
                              onUpdateBackground({
                                type: BackgroundType.Wallpaper,
                                wallpaper: dataUrl,
                                wallpaperKey: stableKey
                              })
                            }
                          }
                        } catch (error) {
                          console.error('Failed to load wallpaper:', error)
                        } finally {
                          setLoadingWallpaperId(null)
                        }
                      }}
                      disabled={isLoading}
                      className={cn(
                        "aspect-video rounded-md overflow-hidden hover:scale-105 relative group disabled:opacity-50 disabled:cursor-wait",
                        isSelected ? "border-2 border-primary/60" : (isDefault && "border-2 border-primary/30")
                      )}
                      title={wallpaper.name + (isDefault ? ' (Default)' : '')}
                    >
                      {resolvedThumbnail ? (
                        <Image
                          unoptimized
                          src={resolvedThumbnail.startsWith('data:') ? resolvedThumbnail : (wallpaper.isPreinstalled ? getElectronAssetUrl(resolvedThumbnail) : resolvedThumbnail)}
                          alt={wallpaper.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                          <span className="text-xs leading-none text-white/70 truncate px-1">{wallpaper.name}</span>
                        </div>
                      )}
                      {isLoading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-pill animate-spin" />
                        </div>
                      )}
                      {isSelected && !isLoading && (
                        <div className="absolute top-1 right-1 rounded-pill bg-primary text-primary-foreground p-1 shadow">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 p-1 bg-black/50 text-xs leading-none text-white/80 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        {wallpaper.name}{isDefault ? ' ★' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No wallpapers found. Use gradient presets instead.
              </div>
            )}
          </div>
        )}

        {/* Parallax Background */}
        {backgroundType === BackgroundType.Parallax && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-muted-foreground">Depth Layers</h4>
              {parallaxPresets.length > 1 && (
                <select
                  value={selectedParallaxPresetId ?? ''}
                  onChange={(e) => setSelectedParallaxPresetId(e.target.value)}
                  className="text-xs bg-background/80 border border-border/40 rounded px-1.5 py-0.5"
                  aria-label="Depth preset"
                >
                  {parallaxPresets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div
              ref={parallaxPreviewRef}
              className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-b from-sky-400 to-sky-600"
              onMouseEnter={() => setParallaxPreviewMouse(m => ({ ...m, active: true }))}
              onMouseLeave={() => {
                if (parallaxPreviewRafRef.current !== null) {
                  cancelAnimationFrame(parallaxPreviewRafRef.current)
                  parallaxPreviewRafRef.current = null
                }
                setParallaxPreviewMouse({ x: 0.5, y: 0.5, active: false })
              }}
              onMouseMove={(e) => {
                const el = parallaxPreviewRef.current
                if (!el) return

                const rect = el.getBoundingClientRect()
                if (rect.width <= 0 || rect.height <= 0) return

                const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))

                if (parallaxPreviewRafRef.current !== null) return
                parallaxPreviewRafRef.current = requestAnimationFrame(() => {
                  parallaxPreviewRafRef.current = null
                  setParallaxPreviewMouse({ x, y, active: true })
                })
              }}
            >
              {/* Preview of layered parallax effect */}
              <div className="absolute inset-0 overflow-hidden rounded-lg">
                {(previewParallaxLayers || []).slice().sort((a, b) => a.zIndex - b.zIndex).map((layer, index, all) => {
                  const steps = Math.max(1, all.length - 1)
                  const t = steps === 0 ? 0 : index / steps
                  const opacity = 0.6 + t * 0.4
                  const intensityMultiplier = (bgData?.parallaxIntensity ?? 50) / 50
                  const offsetX = (parallaxPreviewMouse.x - 0.5) * 120 * intensityMultiplier
                  const offsetY = (parallaxPreviewMouse.y - 0.5) * 80 * intensityMultiplier

                  const moveX = offsetX / layer.factor
                  const moveY = offsetY / layer.factor

                  return (
                    <div
                      key={layer.image}
                      className="absolute inset-0 w-full h-full"
                      style={{
                        opacity,
                        filter: 'grayscale(40%)',
                        transform: `translate3d(${moveX}px, ${moveY}px, 0) scale(1.05)`,
                        transition: parallaxPreviewMouse.active ? 'transform 40ms linear' : 'transform 200ms ease-out',
                        willChange: 'transform',
                      }}
                    >
                      <Image
                        unoptimized
                        src={getElectronAssetUrl(layer.image)}
                        alt=""
                        fill
                        className="object-cover object-bottom"
                      />
                    </div>
                  )
                })}
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <span className="text-white text-xs font-medium px-2 py-1 bg-black/40 rounded">Hill Depth</span>
              </div>
            </div>
            <button
              onClick={() => {
                onUpdateBackground({
                  type: BackgroundType.Parallax,
                  parallaxLayers: previewParallaxLayers,
                  parallaxIntensity: bgData?.parallaxIntensity ?? DEFAULT_BACKGROUND_DATA.parallaxIntensity ?? 50
                })
              }}
              className={cn(
                "w-full py-2 px-3 rounded-md text-xs font-medium transition-all",
                bgData?.type === BackgroundType.Parallax
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/10 hover:bg-primary/20 text-primary"
              )}
            >
              {bgData?.type === BackgroundType.Parallax ? 'Depth On' : 'Apply Depth'}
            </button>

            {/* Intensity Slider - only show when parallax is active */}
            {bgData?.type === BackgroundType.Parallax && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Movement Intensity</label>
                  <span className="text-xs text-muted-foreground">{bgData?.parallaxIntensity ?? DEFAULT_BACKGROUND_DATA.parallaxIntensity ?? 50}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bgData?.parallaxIntensity ?? DEFAULT_BACKGROUND_DATA.parallaxIntensity ?? 50}
                  onChange={(e) => {
                    onUpdateBackground({
                      parallaxIntensity: parseInt(e.target.value)
                    })
                  }}
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground/70 leading-snug">
              Moves subtly as you move the pointer
            </p>
          </div>
        )}

        {/* Gradient Presets */}
        {backgroundType === BackgroundType.Gradient && (
          <div className="space-y-3">
            <h4 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Blends</h4>
            <div className="grid grid-cols-5 gap-2">
              {GRADIENT_PRESETS.map(wallpaper => (
                <button
                  key={wallpaper.id}
                  onClick={() => {
                    onUpdateBackground({
                      type: BackgroundType.Gradient,
                      gradient: {
                        colors: wallpaper.colors,
                        angle: 135
                      }
                    })
                  }}
                  className="aspect-square rounded-md overflow-hidden border border-border/20 hover:border-primary/50 transition-all transform hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${wallpaper.colors[0]}, ${wallpaper.colors[1]})`
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Solid Color */}
        {backgroundType === BackgroundType.Color && (
          <div className="space-y-3">
            <h4 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Solids</h4>

            <ColorPickerPopover
              value={bgData?.type === BackgroundType.Color ? (bgData?.color || '#000000') : '#000000'}
              onChange={(value) => {
                onUpdateBackground({
                  type: BackgroundType.Color,
                  color: value
                })
              }}
              label="Pick background"
              className="w-full justify-between"
              swatchClassName="h-5 w-5"
            />
          </div>
        )}

        {/* Custom Image */}
        {backgroundType === BackgroundType.Image && (
          <div className="space-y-3">
            <h4 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Photo</h4>
            <button
              onClick={async () => {
                if (window.electronAPI?.selectImageFile && window.electronAPI?.loadImageAsDataUrl) {
                  const imagePath = await window.electronAPI.selectImageFile()
                  if (imagePath) {
                    const dataUrl = await window.electronAPI.loadImageAsDataUrl(imagePath)
                    if (dataUrl) {
                      onUpdateBackground({
                        type: BackgroundType.Image,
                        image: dataUrl
                      })
                    }
                  }
                }
              }}
              className="w-full py-2 px-3 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
            >
              Choose Photo...
            </button>
            {bgData?.image && (
              <div className="relative aspect-video rounded-md overflow-hidden border border-border/20">
                <Image
                  unoptimized
                  src={bgData.image}
                  alt="Background"
                  fill
                  className="object-cover"
                />
                <button
                  onClick={() => {
                    onUpdateBackground({
                      type: BackgroundType.Image,
                      image: undefined
                    })
                  }}
                  className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded text-white text-xs z-10"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        {/* bokeh. - only show for image-based backgrounds */}
        {(backgroundType === BackgroundType.Wallpaper || backgroundType === BackgroundType.Image) && (
          <div className="space-y-3 mt-4 pt-4 border-t border-border/30">
            <div className="border border-border/20 bg-background/50 shadow-sm rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="flex items-center gap-2 text-left font-[var(--font-display)] text-ui-sm font-semibold tracking-tight text-foreground">
                  bokeh.
                  <InfoTooltip content="Blur for depth of field" />
                </div>
                <Switch
                  checked={softFocusEnabled}
                  onCheckedChange={(checked) => {
                    onUpdateBackground({ blur: checked ? 10 : undefined })
                  }}
                />
              </div>
              <div className="border-t border-border/15 bg-background/60 px-3 py-2">
                {softFocusEnabled && bgData?.blur != null ? (
                  <div className="space-y-2 pt-2">
                    <Slider
                      value={[localBlur ?? bgData.blur]}
                      onValueChange={([value]) => setLocalBlur(value)}
                      onValueCommit={([value]) => onUpdateBackground({ blur: value })}
                      min={1}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                    <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{(localBlur ?? bgData.blur)}px</span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground/70 leading-snug">
                    Toggle on to add depth-of-field blur.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
