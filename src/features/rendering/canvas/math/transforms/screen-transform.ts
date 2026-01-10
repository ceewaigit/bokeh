import { easeInOutCubic } from './zoom-transform';
import { SCREEN_EFFECT_PRESETS } from '@/features/effects/screen/config';
import { EffectType, ScreenEffectPreset } from '@/types/project';
import type { Effect, ScreenEffect } from '@/types/project';

export function calculateScreenTransform(
    effects: Effect[],
    sourceTimeMs: number,
    opts?: { pixelScale?: number }
): string {
    const screenBlock = effects.find(e =>
        e.type === EffectType.Screen &&
        e.enabled &&
        sourceTimeMs >= e.startTime &&
        sourceTimeMs <= e.endTime
    ) as ScreenEffect | undefined;
    const screenData = screenBlock?.data || null;

    if (!screenData) {
        return '';
    }

    const preset = screenData.preset;
    let tiltX = screenData.tiltX;
    let tiltY = screenData.tiltY;
    let perspective = screenData.perspective;
    const pixelScaleRaw = opts?.pixelScale;
    const pixelScale = typeof pixelScaleRaw === 'number' && Number.isFinite(pixelScaleRaw) && pixelScaleRaw > 0
        ? pixelScaleRaw
        : 1;

    // Defaults per preset
    const presetDefaults = SCREEN_EFFECT_PRESETS[preset];
    if (presetDefaults) {
        tiltX ??= presetDefaults.tiltX;
        tiltY ??= presetDefaults.tiltY;
        perspective ??= presetDefaults.perspective;
    }

    // Easing for tilt intro/outro
    const introMs = typeof screenData.introMs === 'number' ? screenData.introMs : 400;
    const outroMs = typeof screenData.outroMs === 'number' ? screenData.outroMs : 400;

    const blockStart = screenBlock!.startTime;
    const blockEnd = screenBlock!.endTime;

    let easeFactor = 1;
    if (sourceTimeMs < blockStart + introMs) {
        const t = Math.max(0, sourceTimeMs - blockStart) / Math.max(1, introMs);
        easeFactor = easeInOutCubic(Math.min(1, t));
    } else if (sourceTimeMs > blockEnd - outroMs) {
        const t = Math.max(0, blockEnd - sourceTimeMs) / Math.max(1, outroMs);
        easeFactor = easeInOutCubic(Math.min(1, t));
    }

    const easedTiltX = (tiltX ?? -4) * easeFactor;
    const easedTiltY = (tiltY ?? 6) * easeFactor;
    const scaleComp = 1.03;

    // Centering adjustment for certain presets
    let centerAdjust = '';
    if (
        preset === ScreenEffectPreset.Cinematic ||
        preset === ScreenEffectPreset.Hero ||
        preset === ScreenEffectPreset.Isometric ||
        preset === ScreenEffectPreset.Flat
    ) {
        const tx = 0;
        const ty = Math.abs(easedTiltY ?? 0) > 0 ? -4 : 0;
        centerAdjust = ` translate3d(${tx * pixelScale}px, ${ty * pixelScale}px, 0)`;
    }

    const scaledPerspective = (perspective ?? 900) * pixelScale;
    return ` perspective(${scaledPerspective}px) rotateX(${easedTiltX}deg) rotateY(${easedTiltY}deg) scale(${scaleComp})${centerAdjust}`;
}
