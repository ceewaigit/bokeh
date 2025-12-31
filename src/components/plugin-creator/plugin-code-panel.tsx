'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Copy, Check, Download, Pencil } from 'lucide-react'
import type { GeneratedPlugin } from './page'

interface PluginCodePanelProps {
    plugin: GeneratedPlugin
    onSave?: (plugin: GeneratedPlugin) => void
    onSaveToLibrary?: (plugin: GeneratedPlugin) => void
    onEdit?: () => void
}

export function PluginCodePanel({ plugin, onSave, onSaveToLibrary, onEdit }: PluginCodePanelProps) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [copied, setCopied] = useState(false)
    const [saved, setSaved] = useState(false)
    const copiedTimeoutRef = useRef<number | null>(null)
    const savedTimeoutRef = useRef<number | null>(null)

    // Generate the full plugin code
    const fullCode = generatePluginCode(plugin)

    useEffect(() => {
        return () => {
            if (copiedTimeoutRef.current !== null) {
                window.clearTimeout(copiedTimeoutRef.current)
                copiedTimeoutRef.current = null
            }
            if (savedTimeoutRef.current !== null) {
                window.clearTimeout(savedTimeoutRef.current)
                savedTimeoutRef.current = null
            }
        }
    }, [])

    const handleCopy = async () => {
        await navigator.clipboard.writeText(fullCode)
        setCopied(true)
        if (copiedTimeoutRef.current !== null) {
            window.clearTimeout(copiedTimeoutRef.current)
        }
        copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000)
    }

    const handleSaveToLibrary = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (onSaveToLibrary) {
            onSaveToLibrary(plugin)
            setSaved(true)
            if (savedTimeoutRef.current !== null) {
                window.clearTimeout(savedTimeoutRef.current)
            }
            savedTimeoutRef.current = window.setTimeout(() => setSaved(false), 2000)
        }
    }

    return (
        <div className="border-t border-border/70 bg-background">
            {/* Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-accent/40 transition-colors cursor-pointer group"
            >
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-wider">Generated Code</span>
                <div className="flex items-center gap-1">
                    {onEdit && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onEdit()
                            }}
                            className="p-1.5 hover:bg-accent/60 rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            title="Edit code"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onSaveToLibrary && (
                        <button
                            onClick={handleSaveToLibrary}
                            className="p-1.5 hover:bg-accent/60 rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            title="Save to Library"
                        >
                            {saved ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                                <Download className="w-3.5 h-3.5" />
                            )}
                        </button>
                    )}
                    {onSave && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onSave(plugin)
                            }}
                            className="p-1.5 hover:bg-accent/60 rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            title="Download file"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            handleCopy()
                        }}
                        className="p-1.5 hover:bg-accent/60 rounded-md transition-colors text-muted-foreground hover:text-foreground"
                        title="Copy code"
                    >
                        {copied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                            <Copy className="w-3.5 h-3.5" />
                        )}
                    </button>
                    {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                    ) : (
                        <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                </div>
            </div>

            {/* Code */}
            {isExpanded && (
                <div className="px-4 pb-4 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                    <pre className="text-3xs leading-relaxed bg-background/70 border border-border/70 rounded-lg p-3 overflow-x-auto font-mono text-muted-foreground">
                        <code>{fullCode}</code>
                    </pre>
                </div>
            )}
        </div>
    )
}

function generatePluginCode(plugin: GeneratedPlugin): string {
    const paramsTypeEntries = Object.entries(plugin.params || {})
        .map(([key, def]) => {
            if (typeof def !== 'object' || def === null) return `  ${key}: unknown`
            const d = def as { type?: string }
            switch (d.type) {
                case 'number': return `  ${key}: number`
                case 'boolean': return `  ${key}: boolean`
                case 'color': return `  ${key}: string`
                case 'enum': return `  ${key}: string`
                default: return `  ${key}: unknown`
            }
        })
        .join('\n')

    const paramsEntries = Object.entries(plugin.params || {})
        .map(([key, def]) => {
            if (typeof def !== 'object' || def === null) return ''
            return `    ${key}: ${JSON.stringify(def, null, 2).replace(/\n/g, '\n    ')}`
        })
        .join(',\n')

    return `import { definePlugin } from '@/features/effects/config/plugin-sdk'

interface ${toPascalCase(plugin.id)}Params {
${paramsTypeEntries}
}

export const ${toPascalCase(plugin.id)}Plugin = definePlugin<${toPascalCase(plugin.id)}Params>({
  id: '${plugin.id}',
  name: '${plugin.name}',
  description: '${plugin.description}',
  icon: '${plugin.icon}',
  category: '${plugin.category}',
  params: {
${paramsEntries}
  },
  render(props) {
    const { params, frame, width, height } = props
${plugin.renderCode}
  }
})`
}

function toPascalCase(str: string): string {
    return str
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')
}
