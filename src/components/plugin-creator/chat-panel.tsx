'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles, User, Bot } from 'lucide-react'
import type { ChatMessage, GeneratedPlugin } from './page'

interface ChatPanelProps {
    messages: ChatMessage[]
    isLoading: boolean
    onSendMessage: (content: string) => void
    onApplyPlugin: (plugin: GeneratedPlugin) => void
}

export function ChatPanel({
    messages,
    isLoading,
    onSendMessage,
    onApplyPlugin
}: ChatPanelProps) {
    const [input, setInput] = useState('')
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || isLoading) return
        onSendMessage(input.trim())
        setInput('')
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit(e)
        }
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                {messages.map((message) => (
                    <MessageBubble
                        key={message.id}
                        message={message}
                        onApplyPlugin={onApplyPlugin}
                    />
                ))}
                {isLoading && (
                    <div className="flex items-start gap-4 animate-in fade-in duration-300">
                        <div className="w-8 h-8 rounded-full bg-background/70 border border-border/70 flex items-center justify-center shrink-0">
                            <Bot className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Generating plugin code...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-5 pt-2 bg-background">
                <div className="relative group">
                    <form onSubmit={handleSubmit} className="relative !outline-none !ring-0 !border-0 focus:!ring-0 focus-within:!ring-0 focus-within:!outline-none bg-background/80 rounded-xl border border-border/70 overflow-hidden transition-all">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe the effect you want to create..."
                            rows={1}
                            className="w-full bg-transparent border-none px-4 py-4 pr-14 text-sm resize-none !outline-none !ring-0 focus:!ring-0 placeholder-muted-foreground text-foreground min-h-14 max-h-32 leading-relaxed"
                            style={{ height: 'auto' }}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="absolute right-2 bottom-2 p-2 bg-foreground text-background rounded-lg hover:bg-foreground/80 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-all"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                        </button>
                    </form>
                </div>
                <div className="text-3xs text-muted-foreground text-center mt-3 font-medium">
                    Press <kbd className="font-sans px-1 py-0.5 bg-muted rounded text-muted-foreground border border-border">Enter</kbd> to send
                </div>
            </div>
        </div>
    )
}

function MessageBubble({
    message,
    onApplyPlugin
}: {
    message: ChatMessage
    onApplyPlugin: (plugin: GeneratedPlugin) => void
}) {
    const isUser = message.role === 'user'

    return (
        <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}>
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border ${isUser
                ? 'bg-background border-border/70 text-foreground'
                : 'bg-background/70 border-border/70 text-muted-foreground'
                }`}>
                {isUser ? (
                    <User className="w-4 h-4" />
                ) : (
                    <Sparkles className="w-4 h-4 text-muted-foreground" />
                )}
            </div>

            <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                    className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${isUser
                        ? 'bg-background text-foreground border border-border/70'
                        : 'bg-background/80 border border-border/70 text-muted-foreground'
                        }`}
                >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                </div>

                {/* Plugin preview card */}
                {message.plugin && (
                    <div className="mt-4 w-full bg-background/80 rounded-xl p-1 border border-border/70 overflow-hidden group/card hover:border-foreground/20 transition-colors">
                        <div className="bg-background/90 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-md bg-background border border-border/70 flex items-center justify-center">
                                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm text-foreground">{message.plugin.name}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{message.plugin.description}</div>
                                    </div>
                                </div>
                                <span className={`text-3xs px-2.5 py-1 rounded-full border font-medium ${getCategoryColor(message.plugin.category)}`}>
                                    {message.plugin.category}
                                </span>
                            </div>

                            <button
                                onClick={() => onApplyPlugin(message.plugin!)}
                                className="w-full bg-foreground text-background hover:bg-foreground/80 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                Preview Effect
                            </button>
                        </div>
                    </div>
                )}

                <span className="text-3xs text-muted-foreground mt-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    )
}

function getCategoryColor(category: string): string {
    switch (category) {
        case 'transition': return 'bg-foreground/10 text-foreground border-foreground/20'
        case 'foreground': return 'bg-background/70 text-foreground border-border/70'
        case 'overlay': return 'bg-muted/50 text-muted-foreground border-border/70'
        case 'underlay': return 'bg-background/60 text-muted-foreground border-border/70'
        case 'background': return 'bg-muted/40 text-muted-foreground border-border/70'
        default: return 'bg-muted/40 text-muted-foreground border-border/70'
    }
}
