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

// Apple-style spring configurations
const SPRING_PRIMARY = { type: "spring" as const, stiffness: 400, damping: 30, mass: 0.8 }
const SPRING_SNAPPY = { type: "spring" as const, stiffness: 500, damping: 25 }

// Step transition variants
const stepVariants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -4 }
}

// Shared card styles - using design tokens only
const cardStyles = cn(
  "relative w-full max-w-[380px] p-10",
  "bg-background/80 backdrop-blur-2xl",
  "border border-border/20",
  "shadow-2xl",
  "rounded-[20px]"
)

// Animated progress dots
function ProgressDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-10">
      {[1, 2].map((dotStep) => (
        <motion.div
          key={dotStep}
          className="rounded-full bg-foreground"
          animate={{
            width: step === dotStep ? 8 : 6,
            height: step === dotStep ? 8 : 6,
            opacity: step === dotStep ? 1 : 0.2
          }}
          transition={SPRING_SNAPPY}
        />
      ))}
    </div>
  )
}

// Permission item with refined interactions
interface PermissionItemProps {
  icon: React.ReactNode
  label: string
  isGranted: boolean
  isOptional?: boolean
  onAction: () => void
}

function PermissionItem({ icon, label, isGranted, isOptional, onAction }: PermissionItemProps) {
  return (
    <motion.button
      onClick={onAction}
      className={cn(
        "group flex flex-col items-center gap-3 w-20 py-3 rounded-xl",
        "transition-colors duration-150"
      )}
      whileHover={{ backgroundColor: "hsl(var(--foreground) / 0.03)" }}
      whileTap={{ scale: 0.97 }}
      transition={SPRING_SNAPPY}
    >
      <div className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
        isGranted
          ? "bg-primary/10"
          : "bg-muted/50 border border-border/30 group-hover:border-border/50"
      )}>
        <AnimatePresence mode="wait">
          {isGranted ? (
            <motion.div
              key="check"
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...SPRING_SNAPPY, delay: 0.05 }}
            >
              <Check size={20} strokeWidth={2.5} className="text-foreground" />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={SPRING_SNAPPY}
              className="text-muted-foreground"
            >
              {icon}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={cn(
          "text-[11px] font-medium transition-colors duration-150",
          isGranted ? "text-muted-foreground" : "text-foreground"
        )}>
          {label}
        </span>
        {isOptional && (
          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide">
            opt
          </span>
        )}
      </div>
    </motion.button>
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
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SPRING_PRIMARY}
          className={cardStyles}
        >
          <ProgressDots step={1} />

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl overflow-hidden bg-foreground/[0.03] flex items-center justify-center">
              <Image
                src={getElectronAssetUrl('/brand/bokeh_icon.svg')}
                alt="Bokeh"
                className="rounded-xl"
                width={40}
                height={40}
              />
            </div>
            <h1 className="text-[26px] font-[var(--font-display)] tracking-[-0.02em] text-foreground leading-tight mb-3">
              Let&apos;s get you <span className="italic">set up</span>
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px] mx-auto">
              A few quick permissions to record your screen and audio.
            </p>
          </div>

          {/* Permission Row */}
          <div className="flex justify-center gap-2 mb-8">
            <PermissionItem
              icon={<Monitor size={22} />}
              label="Screen"
              isGranted={permissions.screenRecording}
              onAction={() => permissions.screenRecording ? openSettings('screen') : onGrantScreenRecording()}
            />
            <PermissionItem
              icon={<Mic size={22} />}
              label="Mic"
              isGranted={permissions.microphone}
              onAction={() => permissions.microphone ? openSettings('microphone') : onGrantMicrophone()}
            />
            <PermissionItem
              icon={<Camera size={22} />}
              label="Camera"
              isGranted={permissions.camera}
              isOptional
              onAction={() => permissions.camera ? openSettings('camera') : onGrantCamera()}
            />
          </div>

          {/* Continue Button */}
          <motion.div
            animate={{
              opacity: requiredGranted ? 1 : 0.4,
              scale: requiredGranted ? 1 : 0.98
            }}
            transition={SPRING_PRIMARY}
          >
            <Button
              size="lg"
              onClick={() => requiredGranted && setStep(2)}
              disabled={!requiredGranted}
              className={cn(
                "w-full h-11 rounded-xl text-sm font-medium",
                "shadow-sm transition-shadow duration-150",
                requiredGranted && "hover:shadow-md"
              )}
            >
              <span className="flex items-center gap-2">
                Continue
                <ArrowRight size={15} />
              </span>
            </Button>
          </motion.div>

          <button
            onClick={() => openSettings('screen')}
            className="flex items-center justify-center gap-1.5 mx-auto mt-5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors duration-150"
          >
            <Settings size={12} strokeWidth={1.5} />
            System Settings
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="theme"
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SPRING_PRIMARY}
          className={cardStyles}
        >
          <ProgressDots step={2} />

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-[26px] font-[var(--font-display)] tracking-[-0.02em] text-foreground leading-tight mb-2">
              Choose your <span className="italic">aesthetic</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Make it yours.
            </p>
          </div>

          {/* Controls */}
          <div className="space-y-5 mb-6">
            <div className="space-y-2">
              <label className="text-2xs font-medium text-muted-foreground/70 uppercase tracking-wider ml-1">
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
              <label className="text-2xs font-medium text-muted-foreground/70 uppercase tracking-wider ml-1">
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
              <label className="text-2xs font-medium text-muted-foreground/70 uppercase tracking-wider ml-1">
                Accent
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(PRESET_DETAILS) as ColorPreset[]).map((preset) => {
                  const isSelected = colorPreset === preset
                  return (
                    <motion.button
                      key={preset}
                      onClick={() => setColorPreset(preset)}
                      className={cn(
                        "group flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-lg",
                        "transition-colors duration-150",
                        isSelected ? "bg-muted/60" : "hover:bg-muted/30"
                      )}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={SPRING_SNAPPY}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-full transition-all duration-150",
                        "shadow-sm",
                        PRESET_DETAILS[preset].accent,
                        isSelected && "ring-2 ring-foreground/20 ring-offset-2 ring-offset-background"
                      )} />
                      <span className={cn(
                        "text-[10px] font-medium transition-colors duration-150",
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {PRESET_DETAILS[preset].label}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className={cn(
            "relative overflow-hidden rounded-xl mb-6 p-5 h-[88px]",
            "bg-gradient-to-br border border-border/10",
            currentPresetDetails.gradient
          )}>
            <div className="flex items-center justify-between h-full">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {currentPresetDetails.label}
                </div>
                <div className="text-[11px] text-foreground/60 mt-1 max-w-[180px] leading-snug">
                  {currentPresetDetails.description}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {currentPresetDetails.adjectives.slice(0, 2).map(adj => (
                  <span
                    key={adj}
                    className="px-2 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide bg-background/20 backdrop-blur-sm text-foreground/70"
                  >
                    {adj}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Get Started Button */}
          <Button
            size="lg"
            onClick={onContinue}
            className={cn(
              "w-full h-11 rounded-xl text-sm font-medium",
              "shadow-sm hover:shadow-md transition-shadow duration-150"
            )}
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
