
export interface CameraMotionBlurState {
    blurRadius: number;
    angle: number;
    velocity: number;
}

export interface MotionBlurConfig {
    enabled: boolean;
    maxBlurRadius: number;
    velocityThreshold: number;
    intensityMultiplier: number;
}
