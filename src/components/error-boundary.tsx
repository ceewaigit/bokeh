"use client"

import React from 'react'
import { Button } from './ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      const { error } = this.state
      const CustomFallback = this.props.fallback

      if (CustomFallback) {
        return <CustomFallback error={error!} retry={() => this.setState({ hasError: false })} />
      }

      return <DefaultErrorFallback error={error!} retry={() => this.setState({ hasError: false })} />
    }

    return this.props.children
  }
}

function DefaultErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  const [copied, setCopied] = React.useState(false)

  const handleReload = () => {
    window.location.reload()
  }

  const handleCopyError = () => {
    const text = `${error.message}\n\n${error.stack || ''}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="max-w-md w-full bg-card/50 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-destructive/20 shadow-[0_0_20px_-10px_rgba(239,68,68,0.5)]">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>

          <h1 className="text-xl font-semibold mb-2 tracking-tight">Application Error</h1>
          <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
            We encountered an unexpected issue. You can try to recover the session or reload the application.
          </p>

          <div className="grid grid-cols-2 gap-3 w-full mb-8">
            <Button onClick={retry} variant="default" className="w-full shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" onClick={handleReload} className="w-full bg-background/50 hover:bg-background/80 border-border/50">
              <Home className="w-4 h-4 mr-2" />
              Reload App
            </Button>
          </div>

          <div className="w-full rounded-xl bg-muted/30 border border-border/50 overflow-hidden text-left">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/20">
              <span className="text-xs font-medium text-muted-foreground">Error Details</span>
              <button
                onClick={handleCopyError}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {copied ? 'Copied' : 'Copy Log'}
              </button>
            </div>
            <div className="p-4 max-h-[120px] overflow-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              <pre className="text-[10px] leading-relaxed font-mono text-muted-foreground whitespace-pre-wrap break-all">
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook for error handling in functional components
export function useErrorHandler() {
  const handleError = (error: Error, errorInfo?: string) => {
    console.error('Error caught by useErrorHandler:', error, errorInfo)

    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error)
    }
  }

  return handleError
}