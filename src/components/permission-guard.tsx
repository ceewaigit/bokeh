"use client"

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WelcomeScreen } from './welcome-screen'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'

interface PermissionGuardProps {
  children: React.ReactNode
}

/**
 * Guards the app until required permissions are granted.
 * Shows the welcome screen when screen recording permission is missing.
 */
export function PermissionGuard({ children }: PermissionGuardProps) {
  const {
    screenRecording,
    microphone,
    camera,
    isLoading,
    allRequiredGranted,
    startPolling,
    requestScreenRecording,
    requestMicrophone,
    requestCamera
  } = usePermissions()

  const showWelcomeScreenStore = useWorkspaceStore(state => state.showWelcomeScreen)
  const [showWelcome, setShowWelcome] = useState(false)

  // Show welcome screen if required permissions are missing or forced by store
  useEffect(() => {
    if (!isLoading) {
      setShowWelcome(!allRequiredGranted || showWelcomeScreenStore)
    }
  }, [isLoading, allRequiredGranted, showWelcomeScreenStore])

  // Poll for permission changes while welcome screen is visible
  useEffect(() => {
    if (!showWelcome) return
    return startPolling(1000)
  }, [showWelcome, startPolling])

  const handleContinue = () => {
    if (allRequiredGranted) {
      setShowWelcome(false)
    }
  }

  // Loading state
  if (isLoading) {
    return null
  }

  return (
    <>
      <motion.div 
        className="relative z-0 h-full w-full will-change-opacity"
        initial={false}
        animate={showWelcome ? { opacity: 0.4, filter: "grayscale(100%)" } : { opacity: 1, filter: "grayscale(0%)" }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {showWelcome && (
          <motion.div
            key="welcome-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <WelcomeScreen
              permissions={{ screenRecording, microphone, camera }}
              onGrantScreenRecording={requestScreenRecording}
              onGrantMicrophone={requestMicrophone}
              onGrantCamera={requestCamera}
              onContinue={handleContinue}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
