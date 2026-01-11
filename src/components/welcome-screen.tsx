'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Monitor, Mic, Camera, Check, ArrowRight, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/shared/utils/utils'
import { useTheme, type ColorPreset, type Theme } from '@/shared/contexts/theme-context'
import { useWindowSurfaceStore } from '@/features/core/stores/window-surface-store'
import { PRESET_DETAILS } from '@/shared/constants/appearance'
import Image from 'next/image'
import { getElectronAssetUrl } from '@/shared/assets/electron-asset-url'

// Snappy, Apple-like animations
const transition = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 }
}

// Simple dot progress indicator
function ProgressDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      <div className={cn(
        "w-2 h-2 rounded-pill transition-all duration-300",
        step === 1 ? "bg-foreground scale-100" : "bg-muted-foreground/30 scale-75"
      )} />
      <div className={cn(
        "w-2 h-2 rounded-pill transition-all duration-300",
        step === 2 ? "bg-foreground scale-100" : "bg-muted-foreground/30 scale-75"
      )} />
    </div>
  )
}

// Compact permission item
interface PermissionItemProps {
  icon: React.ReactNode
  label: string
  isGranted: boolean
  isOptional?: boolean
  onAction: () => void
}

function PermissionItem({ icon, label, isGranted, isOptional, onAction }: PermissionItemProps) {
  return (
    <button
      onClick={onAction}
      className={cn(
        "group flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200",
        "hover:bg-muted/50 active:scale-[0.98]",
        isGranted && "cursor-pointer"
      )}
    >
      <div className={cn(
        "w-11 h-11 rounded-pill flex items-center justify-center transition-all duration-200",
        isGranted
          ? "bg-foreground/10"
          : "bg-muted border border-border/50 group-hover:border-border"
      )}>
        <AnimatePresence mode="wait">
          {isGranted ? (
            <motion.div
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <Check size={18} strokeWidth={2.5} className="text-foreground" />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-muted-foreground"
            >
              {icon}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={cn(
          "text-xs font-medium transition-colors",
          isGranted ? "text-muted-foreground" : "text-foreground"
        )}>
          {label}
        </span>
        {isOptional && (
          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">
            opt
          </span>
        )}
      </div>
    </button>
  )
}

interface WelcomeScreenProps {
  permissions: {
    screenRecording: boolean
    microphone: boolean
    camera: boolean
  }
  onGrantScreenRecording: () => void
  onGrantMicrophone: () => void
  onGrantCamera: () => void
  onContinue: () => void
}

export function WelcomeScreen({
  permissions,
  onGrantScreenRecording,
  onGrantMicrophone,
  onGrantCamera,
  onContinue
}: WelcomeScreenProps) {
  const [step, setStep] = useState<1 | 2>(1)

  // Theme State
  const { theme, setTheme, colorPreset, setColorPreset } = useTheme()

  // Window Surface State
  const surfaceMode = useWindowSurfaceStore((s) => s.mode)
  const applyPreset = useWindowSurfaceStore((s) => s.applyPreset)

  const uiSurface = (surfaceMode === 'clear' || surfaceMode === 'solid' || surfaceMode === 'frosted') ? surfaceMode : 'frosted'

  const handleSurfaceChange = (val: string) => {
    if (val === 'clear') applyPreset('clear')
    else if (val === 'solid') applyPreset('solid')
    else applyPreset('frosted')
  }

  const requiredGranted = permissions.screenRecording && permissions.microphone

  const openSettings = (type: 'screen' | 'microphone' | 'camera') => {
    window.electronAPI?.openMediaPrivacySettings?.(type)
  }

  const currentPresetDetails = useMemo(() => PRESET_DETAILS[colorPreset] || PRESET_DETAILS.default, [colorPreset])

  return (
    <AnimatePresence mode="wait">
      {step === 1 ? (
        <motion.div
          key="permissions"
          {...fadeUp}
          transition={transition}
          className="relative w-full max-w-sm p-8 bg-background/95 backdrop-blur-xl border border-border/20 shadow-2xl rounded-2xl"
        >
          <ProgressDots step={1} />

          {/* Header */}
          <div className="text-center mb-4">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl overflow-hidden bg-foreground/5 flex items-center justify-center">
              <Image
                src={getElectronAssetUrl('/brand/bokeh_icon.svg')}
                alt="Bokeh"
                className="rounded-xl"
                width={40}
                height={40}
              />
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground mb-2">
              Let&apos;s get you <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>set up</span>
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px] mx-auto">
              A few quick permissions to record your screen and audio.
            </p>
          </div>

          {/* Permission Row */}
          <div className="flex justify-center gap-1 mb-8">
            <PermissionItem
              icon={<Monitor size={18} />}
              label="Screen"
              isGranted={permissions.screenRecording}
              onAction={() => permissions.screenRecording ? openSettings('screen') : onGrantScreenRecording()}
            />
            <PermissionItem
              icon={<Mic size={18} />}
              label="Mic"
              isGranted={permissions.microphone}
              onAction={() => permissions.microphone ? openSettings('microphone') : onGrantMicrophone()}
            />
            <PermissionItem
              icon={<Camera size={18} />}
              label="Camera"
              isGranted={permissions.camera}
              isOptional
              onAction={() => permissions.camera ? openSettings('camera') : onGrantCamera()}
            />
          </div>

          {/* Continue */}
          <Button
            size="lg"
            onClick={() => requiredGranted && setStep(2)}
            disabled={!requiredGranted}
            className={cn(
              "w-full h-11 rounded-xl text-sm font-medium transition-all",
              !requiredGranted && "opacity-40"
            )}
          >
            <span className="flex items-center gap-2">
              Continue
              <ArrowRight size={15} />
            </span>
          </Button>

          <button
            onClick={() => openSettings('screen')}
            className="flex items-center justify-center gap-1.5 mx-auto mt-4 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <Settings size={11} />
            System Settings
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="theme"
          {...fadeUp}
          transition={transition}
          className="relative w-full max-w-md p-8 bg-background/95 backdrop-blur-xl border border-border/20 shadow-2xl rounded-2xl"
        >
          <ProgressDots step={2} />

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-medium tracking-tight text-foreground mb-2">
              Choose your <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>aesthetic</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Make it yours.
            </p>
          </div>

          {/* Controls */}
          <div className="space-y-5 mb-8">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider ml-1">
                Appearance
              </label>
              <SegmentedControl
                value={theme}
                onChange={(v) => setTheme(v as Theme)}
                options={[
                  { value: 'system', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider ml-1">
                Window
              </label>
              <SegmentedControl
                value={uiSurface}
                onChange={handleSurfaceChange}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'frosted', label: 'Frosted' },
                  { value: 'clear', label: 'Clear' },
                ]}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider ml-1">
                Accent
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(PRESET_DETAILS) as ColorPreset[]).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setColorPreset(preset)}
                    className={cn(
                      "group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all duration-150",
                      colorPreset === preset
                        ? "bg-muted ring-1 ring-border"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-pill transition-transform group-hover:scale-110",
                      PRESET_DETAILS[preset].accent
                    )} />
                    <span className={cn(
                      "text-[10px] font-medium transition-colors",
                      colorPreset === preset ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {PRESET_DETAILS[preset].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className={cn(
            "relative overflow-hidden rounded-xl mb-6 p-4 h-20",
            "bg-gradient-to-br", currentPresetDetails.gradient
          )}>
            <div className="flex items-center justify-between h-full">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {currentPresetDetails.label}
                </div>
                <div className="text-[11px] text-foreground/70 mt-0.5">
                  {currentPresetDetails.description}
                </div>
              </div>
              <div className="flex gap-1">
                {currentPresetDetails.adjectives.slice(0, 2).map(adj => (
                  <span key={adj} className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-background/30 backdrop-blur text-foreground/80">
                    {adj}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Continue */}
          <Button
            size="lg"
            onClick={onContinue}
            className="w-full h-11 rounded-xl text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              Get Started
              <ArrowRight size={15} />
            </span>
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
