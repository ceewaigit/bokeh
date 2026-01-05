'use client'

import { useEffect } from "react"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RecordingStorage } from "@/features/core/storage/recording-storage"
import { ThemeProvider } from "@/shared/contexts/theme-context"
import { SettingsDialog } from "@/features/core/settings/components/settings-dialog"

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  // Clear invalid blob URLs on app startup
  useEffect(() => {
    // Only run once on initial mount
    RecordingStorage.clearAllBlobUrls()
  }, [])

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <ErrorBoundary>
          <div className="h-screen w-screen overflow-hidden">
            {children}
            <SettingsDialog />
          </div>
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  )
}
