import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AssetMetadata {
    width?: number
    height?: number
    duration?: number
    requiresProxy?: boolean
}

export interface Asset {
    id: string
    type: 'video' | 'audio' | 'image'
    path: string
    name: string
    timestamp: number
    metadata: AssetMetadata
}

interface AssetLibraryStore {
    assets: Asset[]
    draggingAsset: Asset | null
    addAsset: (asset: Asset) => void
    removeAsset: (id: string) => void
    clearAssets: () => void
    setDraggingAsset: (asset: Asset | null) => void
}

export const useAssetLibraryStore = create<AssetLibraryStore>()(
    persist(
        (set) => ({
            assets: [],
            draggingAsset: null,
            addAsset: (asset) => set((state) => {
                // Avoid duplicates by path
                if (state.assets.some(a => a.path === asset.path)) {
                    return state
                }
                return { assets: [asset, ...state.assets] }
            }),
            removeAsset: (id) => set((state) => ({
                assets: state.assets.filter((a) => a.id !== id),
            })),
            clearAssets: () => set({ assets: [] }),
            setDraggingAsset: (asset) => set({ draggingAsset: asset }),
        }),
        {
            name: 'asset-library-storage',
            version: 1,
            partialize: (state) => ({ assets: state.assets }), // Don't persist draggingAsset
        }
    )
)
