"use client"

import { useMemo } from "react"
import Image from "next/image"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { getElectronAssetUrl } from "@/shared/assets/electron-asset-url"

function normalizeEllipsis(text: string) {
  return text.replace(/\.\.\./g, "…")
}



export function WorkspaceLoadingOverlay({
  open,
  message,
}: {
  open: boolean
  message: string
}) {
  const shouldReduceMotion = useReducedMotion()

  const displayMessage = useMemo(() => normalizeEllipsis(message.trim() || "Loading…"), [message])
  const logoSrc = useMemo(() => getElectronAssetUrl("/brand/bokeh_watermark.svg"), [])

  const enter = shouldReduceMotion
    ? { opacity: 1 }
    : { opacity: 1, transition: { duration: 0.14, ease: [0.2, 0, 0, 1] } }
  const exit = shouldReduceMotion
    ? { opacity: 0 }
    : { opacity: 0, transition: { duration: 0.12, ease: [0.2, 0, 0, 1] } }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={enter}
          exit={exit}
          role="status"
          aria-live="polite"
          aria-label={displayMessage}
        >
          {/* Dim + soften background (native macOS modal feel) */}
          <div className="absolute inset-0 bg-[hsl(var(--overlay-scrim)/0.46)] backdrop-blur-[3px] backdrop-saturate-150" />
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(1200px 700px at 25% 30%, hsl(var(--overlay-accent-1) / 0.14), transparent 55%), radial-gradient(900px 600px at 75% 20%, hsl(var(--overlay-accent-2) / 0.12), transparent 50%), radial-gradient(1200px 900px at 60% 80%, hsl(var(--overlay-accent-3) / 0.10), transparent 55%)",
            }}
          />

          {/* Center panel */}
          <motion.div
            className="relative w-[360px] max-w-[calc(100vw-48px)] rounded-3xl border border-border/35 bg-background/72 p-6 shadow-[0_48px_140px_-86px_rgba(0,0,0,0.98)] backdrop-blur-xl"
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.985, y: 6 }}
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0, transition: { duration: 0.18, ease: [0.2, 0, 0, 1] } }
            }
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 8 }}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-3xl"
              aria-hidden="true"
              style={{
                background:
                  "radial-gradient(120% 120% at 0% 0%, hsl(var(--overlay-highlight) / 0.10), transparent 60%), radial-gradient(120% 140% at 100% 0%, hsl(var(--overlay-highlight) / 0.06), transparent 55%)",
              }}
            />

            <div className="relative flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-[11px] bg-card/30 ring-1 ring-border/40 shadow-[0_18px_45px_-30px_rgba(0,0,0,0.95)] flex items-center justify-center">
                <div
                  className="pointer-events-none absolute inset-0"
                  aria-hidden="true"
                  style={{
                    background:
                      "radial-gradient(120% 120% at 15% 0%, hsl(var(--overlay-highlight) / 0.26), transparent 55%), linear-gradient(to bottom, hsl(var(--overlay-highlight) / 0.10), transparent 42%)",
                  }}
                />
                <Image
                  src={logoSrc}
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full p-[6px] opacity-95 invert dark:invert-0"
                  draggable={false}
                  unoptimized
                />
              </div>
              <div className="min-w-0">
                <div className="text-ui-base font-semibold tracking-[-0.02em] text-white">
                  Workspace Manager
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={displayMessage}
                    className="text-ui-sm text-white/70 truncate"
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 2 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, transition: { duration: 0.12 } }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -2, transition: { duration: 0.1 } }}
                  >
                    {displayMessage}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="relative mt-5 flex items-center gap-3">
              {/* Force white/light colors for the spinner since the background is dark */}
              <div className="relative h-5 w-5 text-white">
                <svg
                  className="absolute inset-0 h-full w-full opacity-20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
                </svg>
                <svg
                  className="absolute inset-0 h-full w-full animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="22 56"
                  />
                </svg>
              </div>
              <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-white/10">
                <motion.div
                  className="h-full w-1/2 rounded-pill bg-white/35"
                  aria-hidden="true"
                  animate={
                    shouldReduceMotion
                      ? { x: 0, opacity: 0.35 }
                      : { x: ["-70%", "140%"], opacity: [0.12, 0.4, 0.12] }
                  }
                  transition={
                    shouldReduceMotion
                      ? undefined
                      : { duration: 1.1, ease: [0.2, 0, 0, 1], repeat: Infinity, repeatDelay: 0.15 }
                  }
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
