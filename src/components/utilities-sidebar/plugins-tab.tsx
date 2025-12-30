'use client'

import React, { useState } from 'react'
import { ChevronDown, Search, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/shared/utils/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'
import { EffectsFactory } from '@/features/effects/effects-factory'
import { getPluginData } from '@/features/effects/effect-filters'
import { getPluginDefaults } from '@/features/effects/config/plugin-sdk'
import { EffectStore } from '@/lib/core/effects'
import { useProjectStore, useSelectedClipId } from '@/stores/project-store'
import { findClipById } from '@/features/timeline/timeline-operations'
import type { ParamDef, NumberParam, EnumParam, StringParam } from '@/features/effects/config/plugin-sdk'
import type { PluginDefinition } from '@/features/effects/config/plugin-sdk'
import { EffectLayerType } from '@/types/effects'

const DEFAULT_PLUGIN_DURATION = 3000 // 3 seconds
const DEFAULT_CLIP_PLUGIN_DURATION = 2000 // 2 seconds

type PluginLibraryTabId = 'default' | 'ours' | 'community'

function SegmentedTabs<T extends string>({
    value,
    onChange,
    tabs,
}: {
    value: T
    onChange: (next: T) => void
    tabs: { id: T; label: string; count?: number }[]
}) {
    return (
        <div className="flex gap-0.5 rounded-md bg-muted/40 p-0.5">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange(tab.id)}
                    className={cn(
                        "flex-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        value === tab.id
                            ? "bg-background/90 text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                    )}
                >
                    <span className="inline-flex items-center justify-center gap-1.5">
                        <span>{tab.label}</span>
                        {typeof tab.count === 'number' && (
                            <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                                {tab.count}
                            </span>
                        )}
                    </span>
                </button>
            ))}
        </div>
    )
}

export function PluginsTab() {
    const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
    const [pluginParams, setPluginParams] = useState<Record<string, Record<string, unknown>>>({})
    const [activeLibraryTab, setActiveLibraryTab] = useState<PluginLibraryTabId>('default')
    const [searchQuery, setSearchQuery] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const deleteResetTimeoutRef = React.useRef<number | null>(null)

    React.useEffect(() => {
        return () => {
            if (deleteResetTimeoutRef.current !== null) {
                window.clearTimeout(deleteResetTimeoutRef.current)
                deleteResetTimeoutRef.current = null
            }
        }
    }, [])
    const [plugins, setPlugins] = useState<PluginDefinition[]>(() => PluginRegistry.getAll())
    const [hideGeneratedClipEditor, setHideGeneratedClipEditor] = useState(false)

    const currentProject = useProjectStore((s) => s.currentProject)
    const selectedClipId = useSelectedClipId()
    const selectedEffectLayer = useProjectStore((s) => s.selectedEffectLayer)
    const updateEffect = useProjectStore((s) => s.updateEffect)
    const clearEffectSelection = useProjectStore((s) => s.clearEffectSelection)
    const updateProjectData = useProjectStore((s) => s.updateProjectData)
    // Find selected plugin effect
    const selectedPluginEffect = React.useMemo(() => {
        if (selectedEffectLayer?.type === EffectLayerType.Plugin && selectedEffectLayer.id && currentProject) {
            // Use EffectStore to find the effect (searches both timeline and legacy recording.effects)
            const located = EffectStore.find(currentProject, selectedEffectLayer.id)
            return located?.effect ?? null
        }
        return null
    }, [selectedEffectLayer, currentProject])

    const selectedGeneratedClip = React.useMemo(() => {
        if (!currentProject || !selectedClipId) return null
        const result = findClipById(currentProject, selectedClipId)
        if (!result) return null
        const recording = currentProject.recordings.find(r => r.id === result.clip.recordingId)
        if (!recording || recording.sourceType !== 'generated' || !recording.generatedSource?.pluginId) return null
        const pluginDef = PluginRegistry.get(recording.generatedSource.pluginId)
        if (!pluginDef) return null
        return { clip: result.clip, recording, pluginDef }
    }, [currentProject, selectedClipId])

    React.useEffect(() => {
        setHideGeneratedClipEditor(false)
    }, [selectedClipId])

    // Add plugin effect to timeline
    const handleAddToTimeline = (pluginId: string) => {
        const plugin = PluginRegistry.get(pluginId)
        if (!plugin || !currentProject) return

        const params = pluginParams[pluginId] ?? getPluginDefaults(plugin)
        const currentTime = useProjectStore.getState().currentTime
        if (plugin.kind === 'clip') {
            const durationMs = plugin.clip?.defaultDurationMs ?? DEFAULT_CLIP_PLUGIN_DURATION
            useProjectStore.getState().addGeneratedClip({
                pluginId,
                params,
                durationMs,
                startTime: currentTime
            })
            return
        }

        const duration = currentProject.timeline?.duration || 10000

        const effect = EffectsFactory.createPluginEffect({
            pluginId,
            startTime: currentTime,
            endTime: Math.min(currentTime + DEFAULT_PLUGIN_DURATION, duration),
            params
        })

        if (effect) {
            useProjectStore.getState().addEffect(effect)
            // Auto-select the new effect
            useProjectStore.getState().selectEffectLayer(EffectLayerType.Plugin, effect.id)
        }
    }

    const handleParamChange = (pluginId: string, key: string, value: unknown) => {
        setPluginParams(prev => ({
            ...prev,
            [pluginId]: { ...prev[pluginId], [key]: value }
        }))
    }

    const getParamValue = (pluginId: string, key: string, param: ParamDef) => {
        return pluginParams[pluginId]?.[key] ?? param.default
    }

    // Handle updates to selected effect
    const handleSelectedParamChange = (key: string, value: unknown) => {
        if (!selectedPluginEffect) return

        const currentData = getPluginData(selectedPluginEffect)
        if (!currentData) return

        updateEffect(selectedPluginEffect.id, {
            data: {
                ...currentData,
                params: {
                    ...currentData.params,
                    [key]: value
                }
            }
        })
    }

    const handleGeneratedClipParamChange = (key: string, value: unknown) => {
        if (!selectedGeneratedClip) return

        updateProjectData((project) => {
            const updatedProject = { ...project }
            updatedProject.recordings = updatedProject.recordings.map((recording) => {
                if (recording.id !== selectedGeneratedClip.recording.id) return recording
                if (recording.sourceType !== 'generated') return recording
                return {
                    ...recording,
                    generatedSource: {
                        pluginId: recording.generatedSource?.pluginId ?? selectedGeneratedClip.pluginDef.id,
                        params: {
                            ...(recording.generatedSource?.params ?? {}),
                            [key]: value
                        }
                    }
                }
            })
            return updatedProject
        })
    }

    const defaultPlugins = React.useMemo(() => plugins.filter(p => !p.renderCode), [plugins])
    const ourPlugins = React.useMemo(() => plugins.filter(p => !!p.renderCode), [plugins])

    const activePlugins = React.useMemo(() => {
        const list =
            activeLibraryTab === 'default' ? defaultPlugins :
                activeLibraryTab === 'ours' ? ourPlugins :
                    []

        const query = searchQuery.trim().toLowerCase()
        const filtered = !query
            ? list
            : list.filter((p) =>
                p.name.toLowerCase().includes(query) ||
                p.id.toLowerCase().includes(query) ||
                (p.description?.toLowerCase() ?? '').includes(query)
            )

        const categoryOrder = ['clip', 'transition', 'overlay', 'foreground', 'underlay', 'background']
        const orderIndex = (category: string) => {
            const index = categoryOrder.indexOf(category)
            return index === -1 ? categoryOrder.length : index
        }

        return [...filtered].sort((a, b) => {
            const byCategory = orderIndex(a.kind === 'clip' ? 'clip' : a.category)
                - orderIndex(b.kind === 'clip' ? 'clip' : b.category)
            if (byCategory !== 0) return byCategory
            return a.name.localeCompare(b.name)
        })
    }, [activeLibraryTab, defaultPlugins, ourPlugins, searchQuery])

    const handleDeletePlugin = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (deleteConfirmId === id) {
            PluginRegistry.unregister(id)
            setDeleteConfirmId(null)
            setPlugins(PluginRegistry.getAll())
        } else {
            setDeleteConfirmId(id)
            if (deleteResetTimeoutRef.current !== null) {
                window.clearTimeout(deleteResetTimeoutRef.current)
            }
            deleteResetTimeoutRef.current = window.setTimeout(() => setDeleteConfirmId(null), 2500)
        }
    }

    // Render Edit Mode
    if (selectedPluginEffect) {
        const pluginData = getPluginData(selectedPluginEffect)
        if (!pluginData) return null

        const pluginDef = PluginRegistry.get(pluginData.pluginId)
        if (!pluginDef) return null

        return (
        <div className="space-y-3 pt-1.5">
            <div className="flex items-center justify-between px-1">
                <button
                    onClick={() => clearEffectSelection()}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    ← Back
                </button>
                <span className="text-[11px] font-semibold text-foreground">
                    Edit {pluginDef.name}
                </span>
            </div>

            <div className="space-y-3 rounded-md border border-border/50 bg-background/60 p-2.5">
                {Object.entries(pluginDef.params).map(([key, param]) => (
                    <PluginParamControl
                            key={key}
                            param={param}
                            value={pluginData.params[key] ?? param.default}
                            onChange={(value) => handleSelectedParamChange(key, value)}
                        />
                    ))}
                </div>
            </div>
        )
    }

    if (selectedGeneratedClip && !hideGeneratedClipEditor) {
        const { pluginDef, recording, clip } = selectedGeneratedClip
        const clipParams = recording.generatedSource?.params ?? {}
        const durationSeconds = clip.duration / 1000

        const handleDurationChange = (seconds: number) => {
            useProjectStore.getState().resizeGeneratedClip(clip.id, seconds * 1000)
        }

        return (
        <div className="space-y-3 pt-1.5">
            <div className="flex items-center justify-between px-1">
                <button
                    onClick={() => setHideGeneratedClipEditor(true)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    ← Back
                </button>
                <span className="text-[11px] font-semibold text-foreground">
                    Edit {pluginDef.name}
                </span>
            </div>

            <div className="text-[11px] text-muted-foreground/80 px-1">
                Editing the selected generated clip.
            </div>

            <div className="space-y-3 rounded-md border border-border/50 bg-background/60 p-2.5">
                {/* Duration Control */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-foreground">Duration</Label>
                        <span className="text-[11px] font-mono text-muted-foreground/70 tabular-nums">
                            {durationSeconds.toFixed(1)}s
                        </span>
                    </div>
                        <Slider
                            value={[durationSeconds]}
                            onValueChange={([v]) => handleDurationChange(v)}
                            min={0.1}
                            max={60} // Max 1 minute for now
                            step={0.1}
                            className="w-full"
                        />
                    </div>

                    <div className="border-t border-border/40 my-2" />

                    {Object.entries(pluginDef.params).map(([key, param]) => (
                        <PluginParamControl
                            key={key}
                            param={param}
                            value={clipParams[key] ?? param.default}
                            onChange={(value) => handleGeneratedClipParamChange(key, value)}
                        />
                    ))}
                </div>
            </div>
        )
    }

    // Render List Mode
    return (
        <div className="space-y-3 pt-1.5">
            {selectedGeneratedClip && hideGeneratedClipEditor && (
                <div className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground">
                            Selected clip: <span className="text-foreground">{selectedGeneratedClip.pluginDef.name}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setHideGeneratedClipEditor(false)}
                            className="text-[11px] font-medium text-foreground bg-secondary/50 hover:bg-secondary border border-border/40 rounded-md px-2 py-0.5"
                        >
                            Edit clip
                        </button>
                    </div>
                </div>
            )}
            <div className="space-y-3">
                <SegmentedTabs
                    value={activeLibraryTab}
                    onChange={(next) => {
                        setActiveLibraryTab(next)
                        setExpandedPlugin(null)
                        setSearchQuery('')
                    }}
                    tabs={[
                        { id: 'default', label: 'Default', count: defaultPlugins.length },
                        { id: 'ours', label: 'Ours', count: ourPlugins.length },
                        { id: 'community', label: 'Community', count: 0 },
                    ]}
                />

                {activeLibraryTab !== 'community' && (
                    <div className="relative flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search plugins…"
                                className="w-full h-7 bg-background/60 border border-border/50 rounded-md pl-8 pr-2.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                            />
                        </div>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => setPlugins(PluginRegistry.getAll())}
                                    className="h-7 w-7 rounded-md border border-border/50 bg-background/60 flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>Refresh plugins</TooltipContent>
                        </Tooltip>
                    </div>
                )}
            </div>

            {activeLibraryTab === 'community' ? (
                <div className="rounded-md border border-border/50 bg-background/60 px-3 py-3">
                    <div className="text-[11px] font-semibold text-foreground">Community plugins</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        Coming soon. Browse, install, and update plugins from the community.
                    </p>
                    <button
                        type="button"
                        disabled
                        className="mt-3 h-7 px-3 rounded-full text-[11px] font-semibold text-muted-foreground bg-muted/30 border border-border/50 cursor-not-allowed"
                    >
                        Browse community
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {activePlugins.length === 0 ? (
                        <div className="rounded-md border border-border/50 bg-background/60 px-3 py-6 text-center">
                            <div className="text-[11px] font-semibold text-foreground">No plugins found</div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Try a different search, or create one in the plugin creator.
                            </p>
                        </div>
                    ) : (
                        activePlugins.map(plugin => {
                            const isExpanded = expandedPlugin === plugin.id
                            const paramCount = Object.keys(plugin.params).length

                            return (
                                <div key={plugin.id} className="rounded-md border border-border/40 bg-background/40">
                                    {/* Plugin Row */}
                                    <div className="flex items-center justify-between px-2.5 py-2">
                                        <div
                                            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
                                            onClick={() => setExpandedPlugin(isExpanded ? null : plugin.id)}
                                        >
                                            <ChevronDown className={cn(
                                                "w-3 h-3 text-muted-foreground transition-transform flex-shrink-0 group-hover:text-foreground",
                                                !isExpanded && "-rotate-90"
                                            )} />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Label className="text-[11px] font-medium text-foreground truncate group-hover:text-primary transition-colors cursor-pointer">
                                                        {plugin.name}
                                                    </Label>
                                                    <span className={cn(
                                                        "text-[9px] px-1.5 py-0 rounded-md border capitalize",
                                                        getCategoryBadge(plugin.kind === 'clip' ? 'clip' : plugin.category)
                                                    )}>
                                                        {plugin.kind === 'clip' ? 'clip' : plugin.category}
                                                    </span>
                                                </div>
                                                {plugin.description && (
                                                    <p className="text-[11px] text-muted-foreground/70 line-clamp-1 mt-0.5">
                                                        {plugin.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {activeLibraryTab === 'ours' && plugin.renderCode && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeletePlugin(e, plugin.id)}
                                                    className={cn(
                                                        "flex items-center justify-center w-6 h-6 rounded-md transition-colors",
                                                        deleteConfirmId === plugin.id
                                                            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                    )}
                                                    title={deleteConfirmId === plugin.id ? 'Click again to delete' : 'Delete plugin'}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleAddToTimeline(plugin.id)}
                                                className="h-6 px-2.5 text-[11px] font-medium text-foreground bg-secondary/50 hover:bg-secondary border border-border/40 rounded-md transition-all active:scale-95"
                                            >
                                                {plugin.kind === 'clip' ? 'Insert' : 'Add'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Parameters */}
                                    {isExpanded && paramCount > 0 && (
                                        <div className="px-3 pb-3">
                                            <div className="rounded-md border border-border/50 bg-background/70 p-2.5 space-y-3">
                                                {Object.entries(plugin.params).map(([key, param]) => (
                                                    <PluginParamControl
                                                        key={key}
                                                        param={param}
                                                        value={getParamValue(plugin.id, key, param)}
                                                        onChange={(value) => handleParamChange(plugin.id, key, value)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}

// =============================================================================
// PARAM CONTROLS - matches the pattern from audio-section.tsx
// =============================================================================

interface ParamControlProps {
    param: ParamDef
    value: unknown
    onChange: (value: unknown) => void
}

function PluginParamControl({ param, value, onChange }: ParamControlProps) {
    if (param.type === 'number') {
        const numParam = param as NumberParam
        const displayValue = typeof value === 'number' ? value : numParam.default
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-foreground">{param.label}</Label>
                    <span className="text-[11px] font-mono text-muted-foreground/70 tabular-nums">
                        {displayValue}{numParam.unit || ''}
                    </span>
                </div>
                {numParam.min !== undefined && numParam.max !== undefined ? (
                    <Slider
                        value={[displayValue]}
                        onValueChange={([v]) => onChange(v)}
                        min={numParam.min}
                        max={numParam.max}
                        step={numParam.step || 1}
                        className="w-full"
                    />
                ) : (
                    <input
                        type="number"
                        value={displayValue}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="w-full h-7 px-2.5 text-[11px] bg-background/70 rounded-md border border-border/50 focus:ring-1 focus:ring-foreground/20"
                    />
                )}
            </div>
        )
    }

    if (param.type === 'boolean') {
        return (
            <div className="flex items-center justify-between">
                <Label className="text-[11px] text-foreground">{param.label}</Label>
                <Switch
                    checked={Boolean(value)}
                    onCheckedChange={onChange}
                    className="scale-75 origin-right"
                />
            </div>
        )
    }

    if (param.type === 'string') {
        const stringParam = param as StringParam
        const displayValue = typeof value === 'string' ? value : String(stringParam.default ?? '')
        return (
            <div className="space-y-2">
                <Label className="text-[11px] text-foreground">{param.label}</Label>
                <input
                    type="text"
                    value={displayValue}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={stringParam.placeholder}
                    maxLength={stringParam.maxLength}
                    className="w-full h-8 px-2.5 text-[11px] bg-background/60 border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
            </div>
        )
    }

    if (param.type === 'enum') {
        const enumParam = param as EnumParam
        return (
            <div className="space-y-2">
                <Label className="text-[11px] text-foreground">{param.label}</Label>
                <div className="grid grid-cols-2 gap-2">
                    {enumParam.options.map(opt => (
                        <button
                            key={String(opt.value)}
                            onClick={() => onChange(opt.value)}
                            className={cn(
                                "px-2.5 py-1 text-[11px] rounded-full border transition-all",
                                value === opt.value
                                    ? "bg-foreground text-background border-foreground/20 shadow-sm"
                                    : "bg-background/70 text-muted-foreground border-border/50 hover:bg-muted/40"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        )
    }

    if (param.type === 'color') {
        return (
            <div className="flex items-center justify-between">
                <Label className="text-[11px] text-foreground">{param.label}</Label>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-muted-foreground">
                        {String(value)}
                    </span>
                    <input
                        type="color"
                        value={String(value)}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-5 h-5 rounded-full cursor-pointer border border-border/50 bg-background"
                    />
                </div>
            </div>
        )
    }

    return null
}

function getCategoryBadge(category: string): string {
    switch (category) {
        case 'clip':
            return 'bg-foreground/10 text-foreground border-foreground/20'
        case 'transition':
            return 'bg-foreground/10 text-foreground border-foreground/20'
        case 'foreground':
            return 'bg-muted text-foreground border-border/60'
        case 'overlay':
            return 'bg-background text-muted-foreground border-border/60'
        case 'underlay':
            return 'bg-muted/50 text-muted-foreground border-border/60'
        case 'background':
            return 'bg-background/60 text-muted-foreground border-border/60'
        default:
            return 'bg-background/60 text-muted-foreground border-border/60'
    }
}
