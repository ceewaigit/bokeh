'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { BackgroundEffectData, Effect } from '@/types/project'
import { BackgroundType } from '@/types/project'
import { DEFAULT_PARALLAX_LAYERS, DEFAULT_BACKGROUND_DATA } from '@/lib/constants/default-effects'
import { GRADIENT_PRESETS, COLOR_PRESETS } from './constants'
import { getElectronAssetUrl } from '@/lib/assets/electron-asset-url'
import { InfoTooltip } from './info-tooltip'

interface BackgroundTabProps {
  backgroundEffect: Effect | undefined
  onUpdateBackground: (updates: any) => void
}

type ParallaxPreset = { id: string; name: string; folder: string; files: string[] }

let cachedMacOSWallpapers: any[] | null = null
let macOSWallpapersPromise: Promise<any[] | null> | null = null

const WALLPAPERS_PER_PAGE = 12
const DEFAULT_WALLPAPER_NAME = 'Sonoma'

type PreinstalledWallpaper = { id: string; name: string; path: string; absolutePath: string; thumbnail?: string }

export function BackgroundTab({ backgroundEffect, onUpdateBackground }: BackgroundTabProps) {
  const [backgroundType, setBackgroundType] = useState<BackgroundType>(BackgroundType.Gradient)
  const [preinstalledWallpapers, setPreinstalledWallpapers] = useState<PreinstalledWallpaper[]>([])
  const [macOSWallpapers, setMacOSWallpapers] = useState<{ wallpapers: any[] }>({
    wallpapers: cachedMacOSWallpapers || []
  })
  const [loadingWallpapers, setLoadingWallpapers] = useState(false)
  const [loadingWallpaperId, setLoadingWallpaperId] = useState<string | null>(null)
  const [wallpaperPage, setWallpaperPage] = useState(0)
  const [wallpaperThumbnails, setWallpaperThumbnails] = useState<Record<string, string>>({})
  const pendingWallpaperThumbsRef = useRef<Set<string>>(new Set())
  const [parallaxPresets, setParallaxPresets] = useState<ParallaxPreset[]>([])
  const [selectedParallaxPresetId, setSelectedParallaxPresetId] = useState<string | null>(null)
  const [loadingParallaxPresets, setLoadingParallaxPresets] = useState(false)

  // Combined wallpapers: preinstalled first, then macOS
  const allWallpapers = useMemo(() => {
    // Convert preinstalled wallpapers to the same format
    const preinstalled = preinstalledWallpapers.map(w => ({
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

    return [...preinstalled, ...macOS.map(w => ({ ...w, isPreinstalled: false }))]
  }, [preinstalledWallpapers, macOSWallpapers.wallpapers])

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
        .then((data) => {
          const wallpapers = data?.wallpapers || []
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
  }, [backgroundType])

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

  useEffect(() => {
    if (backgroundType !== BackgroundType.Parallax) return
    if (loadingParallaxPresets) return
    if (parallaxPresets.length > 0) return

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
      setTimeout(() => resolve(buildFallbackPresets()), 3000)
    })

    const loader = Promise.race([electronLoader, timeoutPromise])

    loader
      .then((presets) => {
        const sanitized = (presets || []).filter(p => p.files?.length)
        // If we got empty results or timed out, use fallback
        const finalPresets = sanitized.length > 0 ? sanitized : buildFallbackPresets()
        setParallaxPresets(finalPresets)
        setSelectedParallaxPresetId(prev => prev ?? pickDefaultPresetId(finalPresets))
      })
      .catch(() => {
        const fallback = buildFallbackPresets()
        setParallaxPresets(fallback)
        setSelectedParallaxPresetId(prev => prev ?? pickDefaultPresetId(fallback))
      })
      .finally(() => setLoadingParallaxPresets(false))
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
      <div className="relative">
        {/* Left scroll arrow */}
        <button
          onClick={() => {
            const container = document.getElementById('bg-tabs-container')
            if (container) container.scrollBy({ left: -100, behavior: 'smooth' })
          }}
          className="absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center w-6 bg-gradient-to-r from-muted/80 to-transparent opacity-0 hover:opacity-100 transition-opacity"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>

        <div
          id="bg-tabs-container"
          className="flex p-0.5 bg-muted/50 rounded-lg gap-0.5 overflow-x-auto hide-scrollbar scroll-smooth"
        >
          {([BackgroundType.Wallpaper, BackgroundType.Parallax, BackgroundType.Gradient, BackgroundType.Color, BackgroundType.Image] as const).map(type => (
            <button
              key={type}
              onClick={() => setBackgroundType(type)}
              className={cn(
                "flex-shrink-0 py-1.5 px-2.5 rounded-md text-xs font-medium transition-all capitalize whitespace-nowrap",
                backgroundType === type
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Right scroll arrow */}
        <button
          onClick={() => {
            const container = document.getElementById('bg-tabs-container')
            if (container) container.scrollBy({ left: 100, behavior: 'smooth' })
          }}
          className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center w-6 bg-gradient-to-l from-muted/80 to-transparent opacity-0 hover:opacity-100 transition-opacity"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="border-t border-border/30 pt-2">
        {/* macOS Wallpapers */}
        {backgroundType === BackgroundType.Wallpaper && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-muted-foreground">Select Wallpaper</h4>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setWallpaperPage(p => Math.max(0, p - 1))}
                    disabled={wallpaperPage === 0}
                    className="p-1 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-muted-foreground min-w-[32px] text-center tabular-nums">
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

                  return (
                    <button
                      key={wallpaperId}
                      onClick={async () => {
                        setLoadingWallpaperId(wallpaperId)
                        try {
                          if (wallpaper.isPreinstalled) {
                            // For preinstalled wallpapers, load via absolutePath
                            const dataUrl = await window.electronAPI?.loadImageAsDataUrl?.(wallpaper.absolutePath)
                            if (dataUrl) {
                              onUpdateBackground({
                                type: BackgroundType.Wallpaper,
                                wallpaper: dataUrl
                              })
                            }
                          } else {
                            // For macOS wallpapers, use loadWallpaperImage
                            const dataUrl = await window.electronAPI?.loadWallpaperImage?.(wallpaper.path)
                            if (dataUrl) {
                              onUpdateBackground({
                                type: BackgroundType.Wallpaper,
                                wallpaper: dataUrl
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
                        "aspect-video rounded-md overflow-hidden ring-1 ring-border/20 hover:ring-2 hover:ring-primary/50 transition-all transform hover:scale-105 relative group disabled:opacity-50 disabled:cursor-wait",
                        isDefault && "ring-2 ring-primary/30"
                      )}
                      title={wallpaper.name + (isDefault ? ' (Default)' : '')}
                    >
                      {resolvedThumbnail ? (
                        <img
                          src={resolvedThumbnail.startsWith('data:') ? resolvedThumbnail : (wallpaper.isPreinstalled ? getElectronAssetUrl(resolvedThumbnail) : resolvedThumbnail)}
                          alt={wallpaper.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                          <span className="text-[10px] leading-none text-white/70 truncate px-1">{wallpaper.name}</span>
                        </div>
                      )}
                      {isLoading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 p-1 bg-black/50 text-[10px] leading-none text-white/80 truncate opacity-0 group-hover:opacity-100 transition-opacity">
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
              <h4 className="text-xs font-medium text-muted-foreground">Parallax Layers</h4>
              {parallaxPresets.length > 1 && (
                <select
                  value={selectedParallaxPresetId ?? ''}
                  onChange={(e) => setSelectedParallaxPresetId(e.target.value)}
                  className="text-xs bg-background/80 border border-border/40 rounded px-1.5 py-0.5"
                  aria-label="Parallax preset"
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
              className="relative aspect-video rounded-lg overflow-hidden ring-1 ring-border/20 bg-gradient-to-b from-sky-400 to-sky-600"
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
              <div className="absolute inset-0 flex items-end justify-center">
                <div className="relative w-full h-3/4">
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
                      <img
                        key={layer.image}
                        src={getElectronAssetUrl(layer.image)}
                        alt=""
                        className="absolute bottom-0 w-full"
                        style={{
                          opacity,
                          filter: 'grayscale(40%)',
                          transform: `translate3d(${moveX}px, ${moveY}px, 0) scale(1.05)`,
                          transition: parallaxPreviewMouse.active ? 'transform 40ms linear' : 'transform 200ms ease-out',
                          willChange: 'transform',
                        }}
                      />
                    )
                  })}
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <span className="text-white text-xs font-medium px-2 py-1 bg-black/40 rounded">Hill Parallax</span>
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
              {bgData?.type === BackgroundType.Parallax ? 'Parallax Active' : 'Apply Parallax'}
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
              Background follows recorded mouse movement during playback and export.
            </p>
          </div>
        )}

        {/* Gradient Presets */}
        {backgroundType === BackgroundType.Gradient && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">Select Gradient</h4>
            <div className="grid grid-cols-5 gap-2">
              {GRADIENT_PRESETS.map(wallpaper => (
                <button
                  key={wallpaper.id}
                  onClick={() => {
                    onUpdateBackground({
                      type: BackgroundType.Gradient,
                      gradient: {
                        type: 'linear',
                        colors: wallpaper.colors,
                        angle: 135
                      }
                    })
                  }}
                  className="aspect-square rounded-md overflow-hidden ring-1 ring-border/20 hover:ring-2 hover:ring-primary/50 transition-all transform hover:scale-105"
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
            <h4 className="text-xs font-medium text-muted-foreground">Select Color</h4>

            {/* Color picker - streamlined single section */}
            <div className="flex gap-2 items-center p-4 bg-background/40 rounded-xl">
              <input
                type="color"
                value={bgData?.type === BackgroundType.Color ? (bgData?.color || '#000000') : '#000000'}
                onChange={(e) => {
                  onUpdateBackground({
                    type: BackgroundType.Color,
                    color: e.target.value
                  })
                }}
                className="w-12 h-12 rounded-md cursor-pointer border-0 bg-transparent"
                style={{ backgroundColor: bgData?.type === BackgroundType.Color ? (bgData?.color || '#000000') : '#000000' }}
              />
              <input
                type="text"
                value={bgData?.type === BackgroundType.Color ? (bgData?.color || '#000000') : '#000000'}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                    if (value.length === 7) {
                      onUpdateBackground({
                        type: BackgroundType.Color,
                        color: value
                      })
                    }
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value.length > 0) {
                    onUpdateBackground({
                      type: BackgroundType.Color,
                      color: e.target.value.padEnd(7, '0')
                    })
                  }
                }}
                className="flex-1 px-3 py-2 text-sm font-mono bg-background/50 rounded"
                placeholder="#000000"
                maxLength={7}
              />
            </div>

            {/* Preset colors */}
            <div className="grid grid-cols-6 gap-2">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    onUpdateBackground({
                      type: BackgroundType.Color,
                      color
                    })
                  }}
                  className={cn(
                    "aspect-square rounded-md transition-all hover:scale-110",
                    bgData?.type === BackgroundType.Color && bgData?.color?.toUpperCase() === color.toUpperCase()
                      ? "ring-2 ring-primary shadow-lg"
                      : "ring-1 ring-border/30 hover:ring-border/50"
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}

        {/* Custom Image */}
        {backgroundType === BackgroundType.Image && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">Custom Image</h4>
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
              Choose Image File...
            </button>
            {bgData?.image && (
              <div className="relative aspect-video rounded-md overflow-hidden ring-1 ring-border/20">
                <img
                  src={bgData.image}
                  alt="Background"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => {
                    onUpdateBackground({
                      type: BackgroundType.Image,
                      image: undefined
                    })
                  }}
                  className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded text-white text-xs"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        {/* Background Blur - Only show for image-based backgrounds */}
        {(backgroundType === BackgroundType.Wallpaper || backgroundType === BackgroundType.Image) && (
          <div className="space-y-3 mt-4 pt-4 border-t border-border/30">
            <h4 className="text-xs font-medium text-muted-foreground">Background Blur</h4>
            <div className="p-4 bg-background/40 rounded-xl space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2 text-xs">
                  Enable Blur
                  <InfoTooltip content="Blurs the background to help the video stand out." />
                </span>
                <Switch
                  checked={bgData?.blur ? bgData.blur > 0 : false}
                  onCheckedChange={(checked) =>
                    onUpdateBackground({ blur: checked ? 10 : undefined })
                  }
                />
              </label>
              {bgData?.blur && bgData.blur > 0 && (
                <div className="space-y-2">
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
