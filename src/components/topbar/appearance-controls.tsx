"use client"

import { AppearanceToggle } from "./appearance-toggle"

interface AppearanceControlsProps {
  align?: "start" | "center" | "end"
  className?: string
}

export function AppearanceControls({ align = "end", className }: AppearanceControlsProps) {
  return (
    <div className={className ?? "flex items-center"}>
      <AppearanceToggle align={align} />
    </div>
  )
}

