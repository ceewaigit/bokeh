
import type { CropEffectData } from '@/types/project';

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
