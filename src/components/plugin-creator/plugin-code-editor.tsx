'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import type { GeneratedPlugin } from './page'

interface PluginCodeEditorProps {
    plugin: GeneratedPlugin
    onSave: (updatedPlugin: GeneratedPlugin) => void
    onCancel: () => void
}

export function PluginCodeEditor({ plugin, onSave, onCancel }: PluginCodeEditorProps) {
    const [code, setCode] = useState(plugin.renderCode)
    const [error, setError] = useState<string | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Auto-focus and select all on mount
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setCode(e.target.value)
        setError(null)
    }, [])

    // Handle Tab key for indentation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault()
            const textarea = e.currentTarget
            const start = textarea.selectionStart
            const end = textarea.selectionEnd

            // Insert 2 spaces
            const newValue = code.substring(0, start) + '  ' + code.substring(end)
            setCode(newValue)

            // Move cursor after inserted spaces
            requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + 2
            })
        }
    }, [code])

    const handleSave = useCallback(() => {
        // Basic validation - check for obvious syntax issues
        try {
            // Try to create a function to validate basic syntax
            new Function('params', 'frame', 'width', 'height', code)
            setError(null)

            // Update plugin with new renderCode
            onSave({
                ...plugin,
                renderCode: code
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Syntax error in code')
        }
    }, [code, plugin, onSave])

    return (
        <div className="flex flex-col h-full bg-background border-t border-border">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Edit Render Code
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent transition-colors flex items-center gap-1.5"
                    >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                    >
                        <Save className="w-3.5 h-3.5" />
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Error display */}
            {error && (
                <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2 text-destructive text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="font-mono">{error}</span>
                </div>
            )}

            {/* Code Editor (simple textarea) */}
            <div className="flex-1 min-h-[300px] p-3">
                <textarea
                    ref={textareaRef}
                    value={code}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    className="w-full h-full bg-zinc-900 text-zinc-100 font-mono text-xs leading-relaxed p-4 rounded-lg border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                    style={{
                        tabSize: 2,
                    }}
                />
            </div>

            {/* Help text */}
            <div className="px-4 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
                <span className="font-medium">Available:</span>{' '}
                <code className="bg-muted px-1 rounded">params</code>{' '}
                <code className="bg-muted px-1 rounded">frame</code>{' '}
                <code className="bg-muted px-1 rounded">width</code>{' '}
                <code className="bg-muted px-1 rounded">height</code>{' '}
                | Return JSX with <code className="bg-muted px-1 rounded">position: 'absolute'</code>{' '}
                | Tab inserts spaces
            </div>
        </div>
    )
}
