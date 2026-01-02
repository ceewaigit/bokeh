import type { ZoomEffectData } from '@/types/project';

export interface ZoomSettings {
    isEditing: boolean;
    zoomData?: ZoomEffectData | null;
}
