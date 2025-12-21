"use client"

import { WorkspaceManager } from "@/components/workspace/workspace-manager"
import { RecordButtonDock } from "@/components/record-button-dock"

export default function Home() {
  // Simple check for record button window
  const isRecordButton = typeof window !== 'undefined' && window.location.hash === '#/record-button'

  if (isRecordButton) {
    return <RecordButtonDock />
  }

  return <WorkspaceManager />
}