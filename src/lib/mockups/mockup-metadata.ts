import type { DeviceMockupData, MockupScreenRegion, MockupFrameBounds } from '@/types/project'
import { DEVICE_MOCKUPS, type DeviceMockupMetadata } from '@/lib/constants/device-mockups'
import type { DeviceModel } from '@/types/project'

export type ResolvedMockupMetadata = {
  dimensions: DeviceMockupMetadata['dimensions']
  screenRegion: DeviceMockupMetadata['screenRegion']
  framePath: string
  frameBounds?: MockupFrameBounds
  frameFullDimensions?: DeviceMockupMetadata['dimensions']
}

function resolveCustomScreenRegion(
  mockupData: DeviceMockupData
): { dimensions: DeviceMockupMetadata['dimensions']; screenRegion: MockupScreenRegion } | null {
  if (!mockupData.customFrameDimensions) return null

  const dimensions = mockupData.customFrameDimensions
  const screenRegion = mockupData.customScreenRegion ?? {
    x: 0,
    y: 0,
    width: dimensions.width,
    height: dimensions.height,
    cornerRadius: 0,
  }

  return { dimensions, screenRegion }
}

export function resolveMockupMetadata(mockupData: DeviceMockupData): ResolvedMockupMetadata | null {
  if (mockupData.customFramePath) {
    const custom = resolveCustomScreenRegion(mockupData)
    if (!custom) return null
    const frameBounds = mockupData.customFrameBounds
    const canApplyBounds = frameBounds
      && custom.screenRegion.x >= frameBounds.x
      && custom.screenRegion.y >= frameBounds.y
      && custom.screenRegion.x + custom.screenRegion.width <= frameBounds.x + frameBounds.width
      && custom.screenRegion.y + custom.screenRegion.height <= frameBounds.y + frameBounds.height
    const adjustedScreenRegion = canApplyBounds ? {
      ...custom.screenRegion,
      x: custom.screenRegion.x - frameBounds.x,
      y: custom.screenRegion.y - frameBounds.y,
    } : custom.screenRegion
    return {
      dimensions: canApplyBounds ? { width: frameBounds.width, height: frameBounds.height } : custom.dimensions,
      screenRegion: adjustedScreenRegion,
      framePath: mockupData.customFramePath,
      frameBounds: canApplyBounds ? frameBounds : undefined,
      frameFullDimensions: custom.dimensions,
    }
  }

  const metadata = DEVICE_MOCKUPS[mockupData.deviceModel as DeviceModel]
  if (!metadata) return null

  return {
    dimensions: metadata.dimensions,
    screenRegion: metadata.screenRegion,
    framePath: metadata.svgPath,
    frameFullDimensions: metadata.dimensions,
  }
}
