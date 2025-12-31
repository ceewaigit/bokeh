'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Monitor, Mic, Camera, Check, ArrowRight, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/shared/utils/utils'

// Apple-esque animation curves
const spring = { type: 'spring', stiffness: 400, damping: 30 }
const ease = [0.25, 0.1, 0.25, 1]

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.4, ease, staggerChildren: 0.06, delayChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } }
}

interface PermissionCardProps {
  icon: React.ReactNode
  title: string
  description: string
  isGranted: boolean
  onGrant: () => void
  isOptional?: boolean
}

function PermissionCard({
  icon,
  title,
  description,
  isGranted,
  onGrant,
  isOptional = false
}: PermissionCardProps) {
  return (
    <motion.button
      type="button"
      variants={itemVariants}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={spring}
      onClick={isGranted ? undefined : onGrant}
      disabled={isGranted}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-2xl text-left",
        "border transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isGranted
          ? "bg-primary/[0.06] border-primary/20 cursor-default"
          : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] cursor-pointer"
      )}
    >
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center",
        "transition-colors duration-200",
        isGranted
          ? "bg-primary/15 text-primary"
          : "bg-white/[0.06] text-white/50"
      )}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-ui-base font-medium tracking-[-0.01em]",
            isGranted ? "text-foreground" : "text-foreground/90"
          )}>
            {title}
          </span>
          {isOptional && (
            <span className="text-4xs uppercase tracking-[0.1em] font-semibold text-muted-foreground/60 px-1.5 py-0.5 rounded bg-white/[0.04]">
              Optional
            </span>
          )}
        </div>
        <p className="text-ui-sm text-muted-foreground/70 leading-relaxed mt-0.5">
          {description}
        </p>
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        {isGranted ? (
          <div className="flex items-center gap-1.5 text-primary text-2xs font-medium px-2.5 py-1.5 rounded-full bg-primary/10">
            <Check size={12} strokeWidth={2.5} />
            <span>Granted</span>
          </div>
        ) : (
          <div className={cn(
            "text-2xs font-medium px-3 py-1.5 rounded-full",
            "bg-white/[0.06] text-white/60",
            "group-hover:bg-white/[0.1] group-hover:text-white/80",
            "transition-colors duration-150"
          )}>
            Grant
          </div>
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
  // Screen + Mic are required, Camera is optional
  const requiredGranted = permissions.screenRecording && permissions.microphone
  const grantedCount = [permissions.screenRecording, permissions.microphone, permissions.camera].filter(Boolean).length
  const totalRequired = 2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-accent/[0.03] blur-[100px]" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-3xs uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">
            <Lock size={10} />
            <span>Privacy First</span>
          </div>

          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground mb-2">
            Quick Setup
          </h1>

          <p className="text-ui-base text-muted-foreground/70 leading-relaxed">
            Grant permissions to start recording.
            <br />
            <span className="text-muted-foreground/50">Your data never leaves your device.</span>
          </p>
        </motion.div>

        {/* Progress indicator */}
        <motion.div variants={itemVariants} className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs font-medium text-muted-foreground/60">
              {grantedCount} of {totalRequired} required
            </span>
            {requiredGranted && (
              <span className="text-2xs font-medium text-primary">Ready to go</span>
            )}
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(Math.min(grantedCount, totalRequired) / totalRequired) * 100}%` }}
              transition={{ duration: 0.4, ease }}
            />
          </div>
        </motion.div>

        {/* Permission cards */}
        <div className="space-y-2.5 mb-8">
          <PermissionCard
            icon={<Monitor size={20} strokeWidth={1.5} />}
            title="Screen Recording"
            description="Capture your display and windows"
            isGranted={permissions.screenRecording}
            onGrant={onGrantScreenRecording}
          />

          <PermissionCard
            icon={<Mic size={20} strokeWidth={1.5} />}
            title="Microphone"
            description="Record audio with your captures"
            isGranted={permissions.microphone}
            onGrant={onGrantMicrophone}
          />

          <PermissionCard
            icon={<Camera size={20} strokeWidth={1.5} />}
            title="Camera"
            description="Add webcam overlay to recordings"
            isGranted={permissions.camera}
            onGrant={onGrantCamera}
            isOptional
          />
        </div>

        {/* Continue button */}
        <motion.div variants={itemVariants}>
          <Button
            size="lg"
            onClick={onContinue}
            disabled={!requiredGranted}
            className={cn(
              "w-full h-12 rounded-xl text-sm font-medium",
              "transition-all duration-200",
              requiredGranted
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                : "bg-white/[0.04] text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            {requiredGranted ? (
              <span className="flex items-center gap-2">
                Continue <ArrowRight size={16} />
              </span>
            ) : (
              <span>Grant required permissions</span>
            )}
          </Button>

          <p className="text-center text-2xs text-muted-foreground/40 mt-4">
            You can change permissions anytime in System Settings
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
