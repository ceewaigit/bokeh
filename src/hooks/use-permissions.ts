"use client"

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Unified permission status for all media permissions.
 * Single source of truth for permission state across the app.
 */
export interface PermissionStatus {
  screenRecording: boolean
  microphone: boolean
  camera: boolean
  isLoading: boolean
}

/**
 * Centralized permissions hook.
 * Handles all permission checking and requesting in one place.
 *
 * Usage:
 * - Use `allRequiredGranted` to gate the app (screen + mic required)
 * - Use `allGranted` to check if all permissions including camera are granted
 * - Call `requestCamera` only when user explicitly enables webcam
 */
export function usePermissions() {
  const [status, setStatus] = useState<PermissionStatus>({
    screenRecording: false,
    microphone: false,
    camera: false,
    isLoading: true
  })

  const isCheckingRef = useRef(false)

  const checkPermissions = useCallback(async () => {
    // Prevent concurrent checks
    if (isCheckingRef.current) return
    isCheckingRef.current = true

    if (typeof window === 'undefined' || !window.electronAPI) {
      setStatus({
        screenRecording: true,
        microphone: true,
        camera: true,
        isLoading: false
      })
      isCheckingRef.current = false
      return
    }

    try {
      const [screenResult, micResult, camResult] = await Promise.all([
        window.electronAPI.checkScreenRecordingPermission(),
        window.electronAPI.checkMicrophonePermission(),
        window.electronAPI.checkCameraPermission?.() ?? { granted: false }
      ])

      setStatus({
        screenRecording: screenResult.granted,
        microphone: micResult.granted,
        camera: camResult.granted,
        isLoading: false
      })
    } catch (error) {
      console.error('[usePermissions] Failed to check permissions:', error)
      setStatus(prev => ({ ...prev, isLoading: false }))
    } finally {
      isCheckingRef.current = false
    }
  }, [])

  const requestScreenRecording = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI?.requestScreenRecordingPermission) return false

    try {
      await window.electronAPI.requestScreenRecordingPermission()
      // Re-check after system dialog
      await new Promise(resolve => setTimeout(resolve, 500))
      await checkPermissions()
      return true
    } catch (error) {
      console.error('[usePermissions] Screen recording request failed:', error)
      return false
    }
  }, [checkPermissions])

  const requestMicrophone = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI?.requestMicrophonePermission) return false

    try {
      const result = await window.electronAPI.requestMicrophonePermission()
      if (result.granted) {
        setStatus(prev => ({ ...prev, microphone: true }))
      }
      return result.granted
    } catch (error) {
      console.error('[usePermissions] Microphone request failed:', error)
      return false
    }
  }, [])

  const requestCamera = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI?.requestCameraPermission) {
      // Fallback: try getUserMedia to trigger browser permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        stream.getTracks().forEach(track => track.stop())
        setStatus(prev => ({ ...prev, camera: true }))
        return true
      } catch {
        return false
      }
    }

    try {
      const result = await window.electronAPI.requestCameraPermission()
      if (result.granted) {
        setStatus(prev => ({ ...prev, camera: true }))
      }
      return result.granted
    } catch (error) {
      console.error('[usePermissions] Camera request failed:', error)
      return false
    }
  }, [])

  // Dev mode helper
  const setMockPermissions = useCallback(async (permissions: {
    screen?: boolean
    microphone?: boolean
    camera?: boolean
  }) => {
    if (window.electronAPI?.setMockPermissions) {
      await window.electronAPI.setMockPermissions(permissions)
      checkPermissions()
    }
  }, [checkPermissions])

  // Initial check
  useEffect(() => {
    checkPermissions()
  }, [checkPermissions])

  // Listen for permission status changes from backend
  useEffect(() => {
    if (!window.electronAPI?.onPermissionStatusChanged) return

    const cleanup = window.electronAPI.onPermissionStatusChanged((_event, data) => {
      setStatus(prev => ({
        ...prev,
        screenRecording: data.screen?.granted ?? prev.screenRecording,
        microphone: data.microphone?.granted ?? prev.microphone,
        camera: data.camera?.granted ?? prev.camera,
        isLoading: false
      }))
    })

    return cleanup
  }, [])

  // Polling for permission changes (useful when welcome screen is shown)
  const startPolling = useCallback((intervalMs = 1000) => {
    const intervalId = setInterval(checkPermissions, intervalMs)
    return () => clearInterval(intervalId)
  }, [checkPermissions])

  // Computed values
  const allRequiredGranted = status.screenRecording && status.microphone
  const allGranted = status.screenRecording && status.microphone && status.camera

  return {
    // Status
    ...status,
    allRequiredGranted,
    allGranted,

    // Actions
    checkPermissions,
    requestScreenRecording,
    requestMicrophone,
    requestCamera,
    setMockPermissions,
    startPolling
  }
}

/**
 * Type for permission names that can be requested.
 */
export type PermissionType = 'screenRecording' | 'microphone' | 'camera'
