import { interpolate, spring } from 'remotion';
import type { WebcamLayoutData } from '@/types/project';

/**
 * Calculate animation values for webcam (scale, opacity, translate)
 * Shared between WebcamLayer (rendering) and PreviewInteractions (hit testing)
 */
export function calculateWebcamAnimations(
    data: WebcamLayoutData,
    frame: number,
    fps: number,
    startFrame: number,
    endFrame: number
): { scale: number; opacity: number; translateY: number } {
    const entryFrames = Math.round((data.animations.entry.durationMs / 1000) * fps);
    const exitFrames = Math.round((data.animations.exit.durationMs / 1000) * fps);

    let scale = 1;
    let opacity = data.opacity;
    let translateY = 0;

    // Entry animation
    if (frame < startFrame + entryFrames) {
        const progress = (frame - startFrame) / entryFrames;

        switch (data.animations.entry.type) {
            case 'fade':
                opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateRight: 'clamp' });
                break;
            case 'scale':
                const fromScale = data.animations.entry.from ?? 0.8;
                scale = interpolate(progress, [0, 1], [fromScale, 1], { extrapolateRight: 'clamp' });
                opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateRight: 'clamp' });
                break;
            case 'slide':
                translateY = interpolate(progress, [0, 1], [50, 0], { extrapolateRight: 'clamp' });
                opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateRight: 'clamp' });
                break;
            case 'bounce':
                scale = spring({
                    frame: frame - startFrame,
                    fps,
                    config: { damping: 10, stiffness: 100 },
                });
                opacity = interpolate(progress, [0, 0.5], [0, data.opacity], { extrapolateRight: 'clamp' });
                break;
        }
    }

    // Exit animation
    if (frame > endFrame - exitFrames) {
        const progress = (endFrame - frame) / exitFrames;

        switch (data.animations.exit.type) {
            case 'fade':
                opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateLeft: 'clamp' });
                break;
            case 'scale':
                scale = interpolate(progress, [0, 1], [0.8, 1], { extrapolateLeft: 'clamp' });
                opacity = interpolate(progress, [0, 1], [0, data.opacity], { extrapolateLeft: 'clamp' });
                break;
        }
    }

    // PiP animation (subtle continuous motion)
    if (data.animations.pip.type !== 'none' && frame >= startFrame + entryFrames && frame <= endFrame - exitFrames) {
        const period = data.animations.pip.period ?? 3000;
        const amplitude = data.animations.pip.amplitude ?? 3;
        const periodFrames = (period / 1000) * fps;
        const cycleProgress = ((frame - startFrame) % periodFrames) / periodFrames;

        switch (data.animations.pip.type) {
            case 'float':
                translateY = Math.sin(cycleProgress * Math.PI * 2) * amplitude;
                break;
            case 'breathe':
                scale = 1 + Math.sin(cycleProgress * Math.PI * 2) * (amplitude / 100);
                break;
        }
    }

    return { scale, opacity, translateY };
}
