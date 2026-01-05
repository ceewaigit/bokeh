// Device types for mockups
export enum DeviceType {
  None = 'none',
  IPhone = 'iphone',
  IPad = 'ipad',
  MacBook = 'macbook',
  AppleWatch = 'apple-watch',
  IMac = 'imac'
}

// Specific Apple device models for mockups
export enum DeviceModel {
  // iPhones
  IPhone15Pro = 'iphone-15-pro',
  IPhone15ProMax = 'iphone-15-pro-max',
  IPhone14Pro = 'iphone-14-pro',
  IPhoneSE = 'iphone-se',
  // iPads
  IPadPro11 = 'ipad-pro-11',
  IPadPro13 = 'ipad-pro-13',
  IPadAir = 'ipad-air',
  IPadMini = 'ipad-mini',
  // MacBooks
  MacBookPro14 = 'macbook-pro-14',
  MacBookPro16 = 'macbook-pro-16',
  MacBookAir13 = 'macbook-air-13',
  MacBookAir15 = 'macbook-air-15',
  // Apple Watch
  AppleWatchUltra = 'apple-watch-ultra',
  AppleWatch9 = 'apple-watch-9',
  // Desktop
  IMac24 = 'imac-24',
  StudioDisplay = 'studio-display'
}

// Video fit mode within device mockup screen
export type MockupVideoFit = 'fill';

export interface MockupScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}

export interface MockupFrameBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Device mockup configuration (per-clip)
export interface DeviceMockupData {
  /** Whether the device mockup is enabled */
  enabled: boolean;
  /** Category of device (iPhone, iPad, MacBook, etc.) */
  deviceType: DeviceType;
  /** Specific device model */
  deviceModel: DeviceModel | string;
  /** How the video fits within the device screen area */
  videoFit: MockupVideoFit;
  /** Fill color behind the video content inside the device screen */
  screenFillColor?: string;
  /** Device color variant (e.g., 'space-black', 'silver', 'natural-titanium') */
  colorVariant?: string;
  /** Custom mockup frame image path for auto-discovered devices */
  customFramePath?: string;
  /** Custom mockup frame dimensions (pixels) */
  customFrameDimensions?: { width: number; height: number };
  /** Screen region within the custom mockup frame */
  customScreenRegion?: MockupScreenRegion;
  /** Visible bounds within the custom mockup frame (for trimming transparent padding) */
  customFrameBounds?: MockupFrameBounds;
  /** Shadow intensity behind the device frame (0-100) */
  shadowIntensity?: number;
  /** Device rotation in degrees (for tilted mockup displays) */
  rotation?: number;
}
