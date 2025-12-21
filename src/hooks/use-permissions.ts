"use client"

import { useState, useEffect, useCallback } from 'react'

export interface PermissionStatus {
    screenRecording: boolean
    microphone: boolean
    isLoading: boolean
}

export function usePermissions() {
    const [status, setStatus] = useState<PermissionStatus>({
        screenRecording: false,
        microphone: false,
        isLoading: true
    })

    const checkPermissions = useCallback(async () => {
        if (typeof window === 'undefined' || !window.electronAPI) {
            setStatus({
                screenRecording: true,
                microphone: true,
                isLoading: false
            })
            return
        }

        try {
            const screenResult = await window.electronAPI.checkScreenRecordingPermission()
            const micResult = await window.electronAPI.checkMicrophonePermission()

            setStatus(prev => ({
                ...prev,
                screenRecording: screenResult.granted,
                microphone: micResult.granted,
                isLoading: false
            }))
        } catch (error) {
            console.error('Failed to check permissions:', error)
            setStatus(prev => ({ ...prev, isLoading: false }))
        }
    }, [])

    const requestScreenRecording = useCallback(async () => {
        if (window.electronAPI?.requestScreenRecordingPermission) {
            await window.electronAPI.requestScreenRecordingPermission()
            // Re-check after a short delay to allow system preferences to update
            setTimeout(checkPermissions, 1000)
        }
    }, [checkPermissions])

    const requestMicrophone = useCallback(async () => {
        if (window.electronAPI?.requestMicrophonePermission) {
            await window.electronAPI.requestMicrophonePermission()
            setTimeout(checkPermissions, 1000)
        }
    }, [checkPermissions])

    // Dev mode helper
    const setMockPermissions = useCallback(async (permissions: { screen?: boolean; microphone?: boolean }) => {
        if (window.electronAPI?.setMockPermissions) {
            await window.electronAPI.setMockPermissions(permissions)
            checkPermissions()
        }
    }, [checkPermissions])

    // Initial check and event listener
    useEffect(() => {
        checkPermissions()

        // Listen for updates from backend (e.g. mock changes or polling results)
        if (window.electronAPI?.onPermissionStatusChanged) {
            const cleanup = window.electronAPI.onPermissionStatusChanged((event, data) => {
                const screenGranted = data.screen.granted
                const micGranted = data.microphone.granted

                setStatus(prev => ({
                    ...prev,
                    screenRecording: screenGranted,
                    microphone: micGranted,
                    isLoading: false
                }))
            })
            return cleanup
        }
    }, [checkPermissions])

    // Polling helper
    const startPolling = useCallback((intervalMs = 1000) => {
        const intervalId = setInterval(checkPermissions, intervalMs)
        return () => clearInterval(intervalId)
    }, [checkPermissions])

    return {
        ...status,
        checkPermissions,
        requestScreenRecording,
        requestMicrophone,
        setMockPermissions,
        startPolling
    }
}
