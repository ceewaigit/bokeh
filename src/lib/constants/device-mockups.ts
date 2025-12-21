/**
 * Device mockup metadata and presets for Apple devices.
 *
 * Each device definition includes:
 * - Display name for UI
 * - Device type category
 * - Native dimensions of the mockup SVG
 * - Screen region bounds (where video is placed)
 * - Available color variants
 */

import { DeviceType, DeviceModel } from '@/types/project'

// Device mockup metadata interface
export interface DeviceMockupMetadata {
  /** Device model identifier */
  id: DeviceModel
  /** Human-readable display name */
  displayName: string
  /** Device category */
  type: DeviceType
  /** Native mockup dimensions (SVG viewBox) */
  dimensions: { width: number; height: number }
  /** Screen region within the mockup (where video is rendered) */
  screenRegion: {
    x: number
    y: number
    width: number
    height: number
    cornerRadius: number
  }
  /** Available device color variants */
  colorVariants: string[]
  /** Native screen aspect ratio as string */
  aspectRatio: string
  /** Path to the SVG mockup file */
  svgPath: string
}

// iPhone mockups
const IPHONE_MOCKUPS: DeviceMockupMetadata[] = [
  {
    id: DeviceModel.IPhone15Pro,
    displayName: 'iPhone 15 Pro',
    type: DeviceType.IPhone,
    dimensions: { width: 430, height: 880 },
    screenRegion: { x: 18, y: 18, width: 393, height: 852, cornerRadius: 55 },
    colorVariants: ['natural-titanium', 'blue-titanium', 'white-titanium', 'black-titanium'],
    aspectRatio: '19.5:9',
    svgPath: '/mockups/iphone/iphone-15-pro.svg'
  },
  {
    id: DeviceModel.IPhone15ProMax,
    displayName: 'iPhone 15 Pro Max',
    type: DeviceType.IPhone,
    dimensions: { width: 468, height: 956 },
    screenRegion: { x: 18, y: 18, width: 430, height: 932, cornerRadius: 60 },
    colorVariants: ['natural-titanium', 'blue-titanium', 'white-titanium', 'black-titanium'],
    aspectRatio: '19.5:9',
    svgPath: '/mockups/iphone/iphone-15-pro-max.svg'
  },
  {
    id: DeviceModel.IPhone14Pro,
    displayName: 'iPhone 14 Pro',
    type: DeviceType.IPhone,
    dimensions: { width: 430, height: 880 },
    screenRegion: { x: 18, y: 18, width: 393, height: 852, cornerRadius: 55 },
    colorVariants: ['space-black', 'silver', 'gold', 'deep-purple'],
    aspectRatio: '19.5:9',
    svgPath: '/mockups/iphone/iphone-14-pro.svg'
  },
  {
    id: DeviceModel.IPhoneSE,
    displayName: 'iPhone SE',
    type: DeviceType.IPhone,
    dimensions: { width: 396, height: 776 },
    screenRegion: { x: 20, y: 100, width: 375, height: 667, cornerRadius: 0 },
    colorVariants: ['midnight', 'starlight', 'red'],
    aspectRatio: '16:9',
    svgPath: '/mockups/iphone/iphone-se.svg'
  }
]

// iPad mockups
const IPAD_MOCKUPS: DeviceMockupMetadata[] = [
  {
    id: DeviceModel.IPadPro11,
    displayName: 'iPad Pro 11"',
    type: DeviceType.IPad,
    dimensions: { width: 870, height: 1220 },
    screenRegion: { x: 30, y: 30, width: 834, height: 1194, cornerRadius: 18 },
    colorVariants: ['space-black', 'silver'],
    aspectRatio: '4.3:3',
    svgPath: '/mockups/ipad/ipad-pro-11.svg'
  },
  {
    id: DeviceModel.IPadPro13,
    displayName: 'iPad Pro 13"',
    type: DeviceType.IPad,
    dimensions: { width: 1066, height: 1412 },
    screenRegion: { x: 30, y: 30, width: 1024, height: 1366, cornerRadius: 20 },
    colorVariants: ['space-black', 'silver'],
    aspectRatio: '4.3:3',
    svgPath: '/mockups/ipad/ipad-pro-13.svg'
  },
  {
    id: DeviceModel.IPadAir,
    displayName: 'iPad Air',
    type: DeviceType.IPad,
    dimensions: { width: 870, height: 1220 },
    screenRegion: { x: 30, y: 30, width: 820, height: 1180, cornerRadius: 18 },
    colorVariants: ['space-gray', 'starlight', 'pink', 'purple', 'blue'],
    aspectRatio: '4.3:3',
    svgPath: '/mockups/ipad/ipad-air.svg'
  },
  {
    id: DeviceModel.IPadMini,
    displayName: 'iPad mini',
    type: DeviceType.IPad,
    dimensions: { width: 540, height: 760 },
    screenRegion: { x: 22, y: 22, width: 744, height: 1133, cornerRadius: 16 },
    colorVariants: ['space-gray', 'starlight', 'pink', 'purple'],
    aspectRatio: '4.3:3',
    svgPath: '/mockups/ipad/ipad-mini.svg'
  }
]

// MacBook mockups
const MACBOOK_MOCKUPS: DeviceMockupMetadata[] = [
  {
    id: DeviceModel.MacBookPro14,
    displayName: 'MacBook Pro 14"',
    type: DeviceType.MacBook,
    dimensions: { width: 1512, height: 982 },
    screenRegion: { x: 160, y: 24, width: 3024, height: 1964, cornerRadius: 12 },
    colorVariants: ['space-black', 'silver'],
    aspectRatio: '3:2',
    svgPath: '/mockups/macbook/macbook-pro-14.svg'
  },
  {
    id: DeviceModel.MacBookPro16,
    displayName: 'MacBook Pro 16"',
    type: DeviceType.MacBook,
    dimensions: { width: 1728, height: 1117 },
    screenRegion: { x: 180, y: 28, width: 3456, height: 2234, cornerRadius: 14 },
    colorVariants: ['space-black', 'silver'],
    aspectRatio: '3:2',
    svgPath: '/mockups/macbook/macbook-pro-16.svg'
  },
  {
    id: DeviceModel.MacBookAir13,
    displayName: 'MacBook Air 13"',
    type: DeviceType.MacBook,
    dimensions: { width: 1470, height: 956 },
    screenRegion: { x: 155, y: 22, width: 2560, height: 1664, cornerRadius: 10 },
    colorVariants: ['midnight', 'starlight', 'space-gray', 'silver'],
    aspectRatio: '3:2',
    svgPath: '/mockups/macbook/macbook-air-13.svg'
  },
  {
    id: DeviceModel.MacBookAir15,
    displayName: 'MacBook Air 15"',
    type: DeviceType.MacBook,
    dimensions: { width: 1680, height: 1080 },
    screenRegion: { x: 175, y: 26, width: 2880, height: 1864, cornerRadius: 12 },
    colorVariants: ['midnight', 'starlight', 'space-gray', 'silver'],
    aspectRatio: '3:2',
    svgPath: '/mockups/macbook/macbook-air-15.svg'
  }
]

// Apple Watch mockups
const WATCH_MOCKUPS: DeviceMockupMetadata[] = [
  {
    id: DeviceModel.AppleWatchUltra,
    displayName: 'Apple Watch Ultra',
    type: DeviceType.AppleWatch,
    dimensions: { width: 410, height: 502 },
    screenRegion: { x: 52, y: 72, width: 410, height: 502, cornerRadius: 44 },
    colorVariants: ['titanium', 'black-titanium'],
    aspectRatio: '1.22:1',
    svgPath: '/mockups/watch/apple-watch-ultra.svg'
  },
  {
    id: DeviceModel.AppleWatch9,
    displayName: 'Apple Watch Series 9',
    type: DeviceType.AppleWatch,
    dimensions: { width: 396, height: 484 },
    screenRegion: { x: 48, y: 66, width: 396, height: 484, cornerRadius: 40 },
    colorVariants: ['midnight', 'starlight', 'silver', 'pink', 'red'],
    aspectRatio: '1.22:1',
    svgPath: '/mockups/watch/apple-watch-9.svg'
  }
]

// iMac/Display mockups
const DESKTOP_MOCKUPS: DeviceMockupMetadata[] = [
  {
    id: DeviceModel.IMac24,
    displayName: 'iMac 24"',
    type: DeviceType.IMac,
    dimensions: { width: 1400, height: 1180 },
    screenRegion: { x: 80, y: 50, width: 4480, height: 2520, cornerRadius: 24 },
    colorVariants: ['blue', 'green', 'pink', 'silver', 'yellow', 'orange', 'purple'],
    aspectRatio: '16:9',
    svgPath: '/mockups/imac/imac-24.svg'
  },
  {
    id: DeviceModel.StudioDisplay,
    displayName: 'Studio Display',
    type: DeviceType.IMac,
    dimensions: { width: 1400, height: 1100 },
    screenRegion: { x: 70, y: 45, width: 5120, height: 2880, cornerRadius: 20 },
    colorVariants: ['silver'],
    aspectRatio: '16:9',
    svgPath: '/mockups/imac/studio-display.svg'
  }
]

// Combined device mockups record
export const DEVICE_MOCKUPS: Record<DeviceModel, DeviceMockupMetadata> = {
  // iPhones
  [DeviceModel.IPhone15Pro]: IPHONE_MOCKUPS[0],
  [DeviceModel.IPhone15ProMax]: IPHONE_MOCKUPS[1],
  [DeviceModel.IPhone14Pro]: IPHONE_MOCKUPS[2],
  [DeviceModel.IPhoneSE]: IPHONE_MOCKUPS[3],
  // iPads
  [DeviceModel.IPadPro11]: IPAD_MOCKUPS[0],
  [DeviceModel.IPadPro13]: IPAD_MOCKUPS[1],
  [DeviceModel.IPadAir]: IPAD_MOCKUPS[2],
  [DeviceModel.IPadMini]: IPAD_MOCKUPS[3],
  // MacBooks
  [DeviceModel.MacBookPro14]: MACBOOK_MOCKUPS[0],
  [DeviceModel.MacBookPro16]: MACBOOK_MOCKUPS[1],
  [DeviceModel.MacBookAir13]: MACBOOK_MOCKUPS[2],
  [DeviceModel.MacBookAir15]: MACBOOK_MOCKUPS[3],
  // Watches
  [DeviceModel.AppleWatchUltra]: WATCH_MOCKUPS[0],
  [DeviceModel.AppleWatch9]: WATCH_MOCKUPS[1],
  // Desktops
  [DeviceModel.IMac24]: DESKTOP_MOCKUPS[0],
  [DeviceModel.StudioDisplay]: DESKTOP_MOCKUPS[1],
}

// Get all mockups of a specific device type
export function getMockupsByType(type: DeviceType): DeviceMockupMetadata[] {
  return Object.values(DEVICE_MOCKUPS).filter(m => m.type === type)
}

// Get device mockup metadata by model
export function getDeviceMockup(model: DeviceModel): DeviceMockupMetadata | undefined {
  return DEVICE_MOCKUPS[model]
}

// Default mockup for each device type
export const DEFAULT_MOCKUP_BY_TYPE: Record<DeviceType, DeviceModel | null> = {
  [DeviceType.None]: null,
  [DeviceType.IPhone]: DeviceModel.IPhone15Pro,
  [DeviceType.IPad]: DeviceModel.IPadPro11,
  [DeviceType.MacBook]: DeviceModel.MacBookPro14,
  [DeviceType.AppleWatch]: DeviceModel.AppleWatch9,
  [DeviceType.IMac]: DeviceModel.IMac24,
}

// Default device mockup data
export const DEFAULT_MOCKUP_DATA = {
  enabled: false,
  deviceType: DeviceType.None,
  deviceModel: DeviceModel.IPhone15Pro,
  videoFit: 'fill' as const,
  screenFillColor: '#000000',
  shadowIntensity: 50,
  rotation: 0,
}
