'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Trash2, Search, Sparkles } from 'lucide-react'
import { PluginRegistry } from '@/features/effects/config/plugin-registry'
import type { GeneratedPlugin } from './page'
import type { PluginDefinition } from '@/features/effects/config/plugin-sdk'

interface PluginLibraryDialogProps {
    isOpen: boolean
    onClose: () => void
    onLoad: (plugin: GeneratedPlugin) => void
}

export function PluginLibraryDialog({ isOpen, onClose, onLoad }: PluginLibraryDialogProps) {
    const [plugins, setPlugins] = useState<PluginDefinition[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const deleteResetTimeoutRef = useRef<number | null>(null)

    const loadPlugins = () => {
        // Filter for custom plugins (those with renderCode)
        const allPlugins = PluginRegistry.getAll()
        const customPlugins = allPlugins.filter(p => p.renderCode)
        setPlugins(customPlugins)
    }

    // Load plugins when dialog opens
    useEffect(() => {
        if (isOpen) {
            loadPlugins()
        }
    }, [isOpen])

    useEffect(() => {
        return () => {
            if (deleteResetTimeoutRef.current !== null) {
                window.clearTimeout(deleteResetTimeoutRef.current)
                deleteResetTimeoutRef.current = null
            }
        }
    }, [])

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (deleteConfirmId === id) {
            PluginRegistry.unregister(id)
            setDeleteConfirmId(null)
            loadPlugins()
        } else {
            setDeleteConfirmId(id)
            // Auto-reset confirmation after 3 seconds
            if (deleteResetTimeoutRef.current !== null) {
                window.clearTimeout(deleteResetTimeoutRef.current)
            }
            deleteResetTimeoutRef.current = window.setTimeout(() => setDeleteConfirmId(null), 3000)
        }
    }

    const handleLoad = (plugin: PluginDefinition) => {
        // Convert PluginDefinition back to GeneratedPlugin structure
        // They are mostly compatible, but we ensure the types match
        const generatedPlugin: GeneratedPlugin = {
            id: plugin.id,
            name: plugin.name,
            description: plugin.description || '',
            icon: plugin.icon,
            category: plugin.category,
            params: plugin.params as Record<string, unknown>,
            renderCode: plugin.renderCode || ''
        }
        onLoad(generatedPlugin)
        onClose()
    }

    const filteredPlugins = plugins.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
    )

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-2xl bg-card border border-border/60 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="relative p-5 border-b border-border/60 flex items-center justify-between bg-card/90 z-10">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-muted-foreground" />
                            Plugin Library
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage your saved custom plugins
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-accent/60 rounded-md transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search */}
                <div className="relative p-4 border-b border-border/60 bg-background/40">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search plugins..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-background/80 border border-border/60 rounded-lg py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none transition-all"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="relative flex-1 overflow-y-auto p-4 space-y-2 min-h-[300px]">
                    {filteredPlugins.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                            <div className="w-10 h-10 rounded-full bg-background/70 border border-border/60 flex items-center justify-center mb-4">
                                <Search className="w-6 h-6 opacity-50" />
                            </div>
                            <p>No plugins found</p>
                            {plugins.length === 0 && (
                                <p className="text-xs mt-2 opacity-60">Save a plugin from the creator to see it here</p>
                            )}
                        </div>
                    ) : (
                        filteredPlugins.map(plugin => (
                            <div
                                key={plugin.id}
                                onClick={() => handleLoad(plugin)}
                                className="group flex items-center justify-between p-3 rounded-lg bg-background/70 border border-border/60 hover:bg-background/90 hover:border-foreground/10 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-9 h-9 rounded-md bg-background/70 border border-border/60 flex items-center justify-center">
                                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-foreground">
                                            {plugin.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground line-clamp-1">
                                            {plugin.description}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-3xs font-mono text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full border border-border/50 uppercase tracking-wider">
                                        {plugin.category}
                                    </span>

                                    <div className="w-px h-4 bg-border mx-2" />

                                    <button
                                        onClick={(e) => handleDelete(e, plugin.id)}
                                        className={`p-2 rounded-lg transition-all flex items-center gap-2 ${deleteConfirmId === plugin.id
                                            ? 'bg-destructive/20 text-destructive hover:bg-destructive/30 w-auto px-3'
                                            : 'hover:bg-destructive/10 text-muted-foreground hover:text-destructive w-9'
                                            }`}
                                        title="Delete plugin"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        {deleteConfirmId === plugin.id && (
                                            <span className="text-xs font-medium whitespace-nowrap">Confirm</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="relative p-3 border-t border-border/60 bg-card/60 text-xs text-muted-foreground flex justify-between items-center">
                    <span>{plugins.length} saved plugins</span>
                    <div className="flex gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-muted/30 border border-border/50">Local Storage</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
