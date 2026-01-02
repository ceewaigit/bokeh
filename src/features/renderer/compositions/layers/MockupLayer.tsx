/**
 * MockupLayer.tsx
 *
 * Renders a device mockup frame with video content positioned within the screen region.
 * The entire mockup (frame + video) zooms together as a single unit when transforms are applied.
 *
 * Key responsibilities:
 * - Load and render device SVG mockup frame
 * - Position video content within the device screen region
 * - Apply screen corner radius clipping
 * - Handle device shadow and color variants
 */

import React, { useMemo } from 'react'
import { Img, staticFile } from 'remotion'
import { resolveMockupMetadata } from '@/features/mockups/mockup-metadata'
import { useVideoPosition } from '@/features/renderer/context/layout/VideoPositionContext'

export interface MockupLayerProps {
  /** Fill color for letterbox/pillarbox areas */
  screenFillColor?: string
  /** Children to render within the screen region (video content) */
  children: React.ReactNode
}

/**
 * Device mockup layer component.
 *
 * This component renders a device frame (iPhone, iPad, MacBook, etc.) with the video
 * content positioned within the device's screen region. The zoom transform is applied
 * by the parent component (SharedVideoController), so the entire mockup zooms as a unit.
 */
export const MockupLayer = React.memo(({
  screenFillColor = '#000000',
  children
}: MockupLayerProps) => {
  const { mockupData, mockupPosition } = useVideoPosition()

  // Get device metadata
  const deviceMetadata = useMemo(() => {
    if (!mockupData) return null
    return resolveMockupMetadata(mockupData)
  }, [mockupData])

  // Shadow style based on intensity
  // Rotation transform
  const rotationTransform = useMemo(() => {
    if (!mockupData?.rotation || mockupData.rotation === 0) return ''
    return `rotate(${mockupData.rotation}deg)`
  }, [mockupData?.rotation])

  if (!deviceMetadata || !mockupPosition || !mockupData) {
    // Fallback: render children without mockup if device not found
    return <>{children}</>
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: mockupPosition.mockupX,
        top: mockupPosition.mockupY,
        width: mockupPosition.mockupWidth,
        height: mockupPosition.mockupHeight,
        transform: rotationTransform,
        transformOrigin: 'center center',
      }}
    >
      {/* Screen fill color (background for letterbox/pillarbox) */}
      <div
        style={{
          position: 'absolute',
          left: Math.round(mockupPosition.screenX - mockupPosition.mockupX),
          top: Math.round(mockupPosition.screenY - mockupPosition.mockupY),
          width: Math.round(mockupPosition.screenWidth),
          height: Math.round(mockupPosition.screenHeight),
          backgroundColor: screenFillColor,
          borderRadius: mockupPosition.screenCornerRadius,
          overflow: 'hidden',
        }}
      />

      {/* Video content container (clipped to screen region) */}
      <div
        data-video-content-container="true"
        style={{
          position: 'absolute',
          left: Math.round(mockupPosition.screenX - mockupPosition.mockupX),
          top: Math.round(mockupPosition.screenY - mockupPosition.mockupY),
          width: Math.round(mockupPosition.screenWidth),
          height: Math.round(mockupPosition.screenHeight),
          overflow: 'hidden',
          borderRadius: mockupPosition.screenCornerRadius,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: Math.round(mockupPosition.videoX - mockupPosition.screenX),
            top: Math.round(mockupPosition.videoY - mockupPosition.screenY),
            width: Math.round(mockupPosition.videoWidth),
            height: Math.round(mockupPosition.videoHeight),
          }}
        >
          {children}
        </div>
      </div>

      {/* Device frame overlay (SVG mockup) */}
      <DeviceFrame
        key={`${deviceMetadata.framePath}:${mockupData.colorVariant ?? 'default'}`}
        svgPath={deviceMetadata.framePath}
        width={mockupPosition.mockupWidth}
        height={mockupPosition.mockupHeight}
        frameBounds={deviceMetadata.frameBounds}
        frameFullDimensions={deviceMetadata.frameFullDimensions}
        colorVariant={mockupData.customFramePath ? undefined : mockupData.colorVariant}
        allowVariant={!mockupData.customFramePath}
      />
    </div>
  )
})

MockupLayer.displayName = 'MockupLayer'

/**
 * Device frame component that renders the SVG mockup.
 */
interface DeviceFrameProps {
  svgPath: string
  width: number
  height: number
  frameBounds?: { x: number; y: number; width: number; height: number }
  frameFullDimensions?: { width: number; height: number }
  colorVariant?: string
  allowVariant?: boolean
}

const DeviceFrame: React.FC<DeviceFrameProps> = ({
  svgPath,
  width,
  height,
  frameBounds,
  frameFullDimensions,
  colorVariant,
  allowVariant = true
}) => {
  // Construct full SVG path with color variant if applicable
  const fullPath = useMemo(() => {
    if (allowVariant && colorVariant) {
      // Check if there's a color variant version of the SVG
      const basePath = svgPath.replace('.svg', '')
      return `${basePath}-${colorVariant}.svg`
    }
    return svgPath
  }, [svgPath, colorVariant, allowVariant])

  const resolvedFullDimensions = frameFullDimensions ?? { width, height }
  const resolvedBounds = frameBounds ?? {
    x: 0,
    y: 0,
    width: resolvedFullDimensions.width,
    height: resolvedFullDimensions.height,
  }
  const hasTrimmedBounds =
    resolvedBounds.x !== 0 ||
    resolvedBounds.y !== 0 ||
    resolvedBounds.width !== resolvedFullDimensions.width ||
    resolvedBounds.height !== resolvedFullDimensions.height
  const scaleX = resolvedBounds.width === 0 ? 1 : width / resolvedBounds.width
  const scaleY = resolvedBounds.height === 0 ? 1 : height / resolvedBounds.height
  const fullWidth = Math.round(resolvedFullDimensions.width * scaleX)
  const fullHeight = Math.round(resolvedFullDimensions.height * scaleY)
  const offsetX = Math.round(-resolvedBounds.x * scaleX)
  const offsetY = Math.round(-resolvedBounds.y * scaleY)

  if (hasTrimmedBounds) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width,
          height,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <Img
          src={fullPath.startsWith('video-stream:') || fullPath.startsWith('http') ? fullPath : staticFile(fullPath)}
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: fullWidth,
            height: fullHeight,
            pointerEvents: 'none',
          }}
          // Fallback to base path if color variant doesn't exist
          onError={(e) => {
            const target = e.target as HTMLImageElement
            const fallbackSrc = svgPath.startsWith('video-stream:') || svgPath.startsWith('http') ? svgPath : staticFile(svgPath)
            // Check if we already tried fallback to prevent infinite loop
            // We compare against the resolved fallback URL
            if (target.src !== fallbackSrc && target.src !== window.location.origin + fallbackSrc) {
              target.src = fallbackSrc
            }
          }}
        />
      </div>
    )
  }

  return (
    <Img
      src={fullPath.startsWith('video-stream:') || fullPath.startsWith('http') ? fullPath : staticFile(fullPath)}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        pointerEvents: 'none',
      }}
      // Fallback to base path if color variant doesn't exist
      onError={(e) => {
        const target = e.target as HTMLImageElement
        const fallbackSrc = svgPath.startsWith('video-stream:') || svgPath.startsWith('http') ? svgPath : staticFile(svgPath)
        // Check if we already tried fallback to prevent infinite loop
        // We compare against the resolved fallback URL
        if (target.src !== fallbackSrc && target.src !== window.location.origin + fallbackSrc) {
          target.src = fallbackSrc
        }
      }}
    />
  )
}

export default MockupLayer
