export interface CropEffectData {
  /** Left edge position (0-1 normalized to source video width) */
  x: number;
  /** Top edge position (0-1 normalized to source video height) */
  y: number;
  /** Width of crop region (0-1 normalized to source video width) */
  width: number;
  /** Height of crop region (0-1 normalized to source video height) */
  height: number;
}

export interface CropSettings {
    cropData?: CropEffectData | null;
    onCropChange?: (cropData: CropEffectData) => void;
    onCropConfirm?: () => void;
    onCropReset?: () => void;
}

export interface CropTransform {
    scale: number;
    translateX: number;
    translateY: number;
    isActive: boolean;
    /** CSS clip-path to mask content outside the crop region */
    clipPath?: string;
}