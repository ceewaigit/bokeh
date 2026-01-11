'use client'

import React from 'react'
import Image from 'next/image'
import { Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAssetLibraryStore } from '@/features/core/stores/asset-library-store'
import { createVideoStreamUrl } from '@/features/media/recording/components/library/utils/recording-paths'
import { useWorkspaceStore } from '@/features/core/stores/workspace-store'

export function WatermarkIconPicker({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string | null
  onChange: (path: string | null) => void
}) {
  const assets = useAssetLibraryStore((s) => s.assets)
  const images = React.useMemo(() => assets.filter((a) => a.type === 'image'), [assets])
  const isUtilitiesOpen = useWorkspaceStore((s) => s.isUtilitiesOpen)
  const toggleUtilities = useWorkspaceStore((s) => s.toggleUtilities)
  const setActiveUtilityTab = useWorkspaceStore((s) => s.setActiveUtilityTab)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
          <DialogDescription>
            Pick an image from your media library, or use the default. To add new icons, import an image into your workspace first.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/40 p-2">
          <div className="text-2xs text-muted-foreground leading-snug">
            Don&apos;t see your icon? Import it in <span className="font-medium text-foreground/80">Utilities → Media</span>.
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              if (!isUtilitiesOpen) toggleUtilities()
              setActiveUtilityTab('import')
            }}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import
          </Button>
        </div>

        <div className="max-h-[420px] overflow-auto pr-2">
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => onChange(null)}
              className={`group relative aspect-square rounded-lg border bg-background/40 overflow-hidden transition-colors ${
                value === null ? 'border-primary' : 'border-border/50 hover:border-border'
              }`}
            >
              <div className="absolute inset-0 flex items-center justify-center text-2xs text-muted-foreground">
                Default
              </div>
            </button>

            {images.map((asset) => {
              const isSelected = value === asset.path
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onChange(asset.path)}
                  className={`group relative aspect-square rounded-lg border bg-background/40 overflow-hidden transition-colors ${
                    isSelected ? 'border-primary' : 'border-border/50 hover:border-border'
                  }`}
                  aria-label={asset.name}
                  title={asset.name}
                >
                  <Image
                    src={createVideoStreamUrl(asset.path) || asset.path}
                    alt={asset.name}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </button>
              )
            })}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
