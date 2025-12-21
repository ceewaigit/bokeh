"use client"

import React, { useEffect, useState } from 'react'
import { WelcomeScreen } from './welcome-screen'
import { usePermissions } from '@/hooks/use-permissions'

interface PermissionGuardProps {
    children: React.ReactNode
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({ children }) => {
    const { screenRecording, microphone, isLoading, startPolling, requestScreenRecording, requestMicrophone } = usePermissions()
    const [showWelcome, setShowWelcome] = useState(false)

    // React to permission changes
    useEffect(() => {
        if (!isLoading) {
            if (!screenRecording) {
                setShowWelcome(true)
            } else {
                setShowWelcome(false)
            }
        }
    }, [isLoading, screenRecording])

    // Polling effect - only runs when welcome screen is visible
    useEffect(() => {
        if (!showWelcome) return
        return startPolling(1000)
    }, [showWelcome, startPolling])

    const handleGrantScreenRecording = async () => {
        await requestScreenRecording()
    }

    const handleGrantMicrophone = async () => {
        await requestMicrophone()
    }

    const handleContinue = () => {
        setShowWelcome(false)
    }

    if (isLoading) {
        return null // Or a loading spinner if desired
    }

    if (showWelcome) {
        return (
            <WelcomeScreen
                permissions={{ screenRecording, microphone }}
                onGrantScreenRecording={handleGrantScreenRecording}
                onGrantMicrophone={handleGrantMicrophone}
                onContinue={handleContinue}
            />
        )
    }

    return <>{children}</>
}
