/**
 * Hook to fetch available device mockups from the file system.
 * Only shows device types that have actual mockup files.
 */

import { useState, useEffect } from 'react'

export interface MockupVariant {
    name: string
    filename: string
    path: string
}

export interface MockupScreenRegion {
    x: number
    y: number
    width: number
    height: number
    cornerRadius: number
}

export interface MockupFrame {
    path: string
    width: number
    height: number
    screenRegion: MockupScreenRegion
    frameBounds?: { x: number; y: number; width: number; height: number }
}

export interface MockupModel {
    id: string
    name: string
    folder: string
    variants: MockupVariant[]
    frame?: MockupFrame
}

export interface MockupDevice {
    type: string
    models: MockupModel[]
}

export interface AvailableMockups {
    devices: MockupDevice[]
    isLoading: boolean
    availableTypes: Set<string>
}

export function useAvailableMockups(): AvailableMockups {
    const [devices, setDevices] = useState<MockupDevice[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [availableTypes, setAvailableTypes] = useState<Set<string>>(new Set())

    useEffect(() => {
        let cancelled = false

        async function loadMockups() {
            try {
                // Use type assertion for the API method since it's newly added
                const api = window.electronAPI as any
                if (!api?.listAvailableMockups) {
                    console.warn('[useAvailableMockups] API not available')
                    return
                }

                const result = await api.listAvailableMockups()

                if (cancelled) return

                setDevices(result.devices)
                setAvailableTypes(new Set(result.devices.map((d: MockupDevice) => d.type.toLowerCase())))
            } catch (error) {
                console.error('[useAvailableMockups] Failed to load:', error)
            } finally {
                if (!cancelled) {
                    setIsLoading(false)
                }
            }
        }

        loadMockups()

        return () => {
            cancelled = true
        }
    }, [])

    return { devices, isLoading, availableTypes }
}
