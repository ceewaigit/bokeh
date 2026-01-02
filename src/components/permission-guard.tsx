"use client"

import React, { useEffect, useState } from 'react'
import { WelcomeScreen } from './welcome-screen'
import { usePermissions } from '@/shared/hooks/use-permissions'

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

  const [showWelcome, setShowWelcome] = useState(false)

  // Show welcome screen if required permissions are missing
  useEffect(() => {
    if (!isLoading) {
      setShowWelcome(!allRequiredGranted)
    }
  }, [isLoading, allRequiredGranted])

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

  // Welcome screen
  if (showWelcome) {
    return (
      <WelcomeScreen
        permissions={{ screenRecording, microphone, camera }}
        onGrantScreenRecording={requestScreenRecording}
        onGrantMicrophone={requestMicrophone}
        onGrantCamera={requestCamera}
        onContinue={handleContinue}
      />
    )
  }

  return <>{children}</>
}
