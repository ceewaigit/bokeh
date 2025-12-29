import React, { useMemo } from 'react';
import type { KeyboardEvent, KeystrokeEffectData } from '@/types/project';
import { KeystrokePosition } from '@/types/project';
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects';
import {
    computeKeystrokeSegments,
    getKeystrokeDisplayState,
    getKeystrokeFontFamily,
    getKeystrokePresetStyle,
    type KeystrokeStylePreset,
} from '@/features/effects/keystroke-utils';

interface KeystrokePreviewOverlayProps {
    currentTimeMs: number;
    keystrokeEvents: KeyboardEvent[];
    settings?: Partial<KeystrokeEffectData>;
    enabled?: boolean;
    centered?: boolean;
}

/**
 * DOM-based keystroke overlay for crisp preview rendering.
 * Renders outside Remotion composition to avoid CSS scaling blur.
 */
export const KeystrokePreviewOverlay: React.FC<KeystrokePreviewOverlayProps> = ({
    currentTimeMs,
    keystrokeEvents,
    settings: userSettings,
    enabled = true,
    centered = false,
}) => {
    const settings = useMemo<Required<KeystrokeEffectData>>(() => {
        // Filter out undefined values from userSettings to avoid overriding defaults
        const filteredSettings = userSettings
            ? Object.fromEntries(
                Object.entries(userSettings).filter(([, v]) => v !== undefined)
            )
            : {};
        return {
            ...DEFAULT_KEYSTROKE_DATA,
            ...filteredSettings,
        } as Required<KeystrokeEffectData>;
    }, [userSettings]);

    const segments = useMemo(() => {
        if (!enabled || keystrokeEvents.length === 0) return [];
        return computeKeystrokeSegments(keystrokeEvents, settings);
    }, [enabled, keystrokeEvents, settings]);

    const displayState = useMemo(() => {
        if (!enabled || segments.length === 0) return null;
        return getKeystrokeDisplayState(segments, currentTimeMs, settings);
    }, [enabled, segments, currentTimeMs, settings]);

    if (!enabled || !displayState) {
        return null;
    }

    const scale = settings.scale || 1;
    const fontSize = (settings.fontSize || 18) * scale;
    const padding = (settings.padding || 12) * scale;
    const borderRadius = (settings.borderRadius || 15) * scale;
    const margin = 48 * scale;
    const preset = (settings.stylePreset || 'glass') as KeystrokeStylePreset;
    const presetStyle = getKeystrokePresetStyle(preset, settings, scale);
    const fontFamily = getKeystrokeFontFamily(preset, settings.fontFamily);

    // Position based on settings
    let positionStyle: React.CSSProperties = {};
    if (centered) {
        positionStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    } else {
        switch (settings.position) {
            case KeystrokePosition.BottomRight:
                positionStyle = { bottom: margin, right: margin };
                break;
            case KeystrokePosition.TopCenter:
                positionStyle = { top: margin, left: '50%', transform: 'translateX(-50%)' };
                break;
            case KeystrokePosition.BottomCenter:
            default:
                positionStyle = { bottom: margin, left: '50%', transform: 'translateX(-50%)' };
                break;
        }
    }

    return (
        <div
            style={{
                position: 'absolute',
                ...positionStyle,
                opacity: displayState.opacity,
                padding: `${padding * 0.9}px ${padding * 1.4}px`,
                borderRadius,
                backgroundColor: presetStyle.backgroundColor || 'transparent',
                border: presetStyle.borderColor
                    ? `${presetStyle.borderWidth ?? 1}px solid ${presetStyle.borderColor}`
                    : undefined,
                boxShadow: presetStyle.boxShadow
                    ? `0 ${presetStyle.boxShadow.offsetY}px ${presetStyle.boxShadow.blur}px ${presetStyle.boxShadow.color}`
                    : undefined,
                fontFamily,
                fontSize,
                fontWeight: 500,
                color: presetStyle.textColor || settings.textColor || '#ffffff',
                textShadow: presetStyle.textShadow
                    ? `0 ${presetStyle.textShadow.offsetY}px ${presetStyle.textShadow.blur}px ${presetStyle.textShadow.color}`
                    : undefined,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 100,
                // Ensure crisp text rendering
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
            }}
        >
            {displayState.text}
        </div>
    );
};
