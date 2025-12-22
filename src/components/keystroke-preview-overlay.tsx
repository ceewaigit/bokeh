import React, { useMemo } from 'react';
import type { KeyboardEvent, KeystrokeEffectData } from '@/types/project';
import { KeystrokePosition } from '@/types/project';
import { DEFAULT_KEYSTROKE_DATA } from '@/lib/constants/default-effects';
import { isShortcutModifier, isStandaloneModifierKey } from '@/lib/keyboard/keyboard-utils';

interface KeystrokeSegment {
    text: string;
    startTime: number;
    endTime: number;
    isShortcut: boolean;
}

/**
 * Process keyboard events into display segments
 */
function computeSegments(events: KeyboardEvent[], displayDuration: number): KeystrokeSegment[] {
    const segments: KeystrokeSegment[] = [];
    const BUFFER_TIMEOUT = 800;

    let currentBuffer: {
        text: string;
        startTime: number;
        lastKeyTime: number;
    } | null = null;

    const flushBuffer = () => {
        if (currentBuffer && currentBuffer.text.trim().length > 0) {
            segments.push({
                text: currentBuffer.text.trim(),
                startTime: currentBuffer.startTime,
                endTime: currentBuffer.lastKeyTime + displayDuration,
                isShortcut: false,
            });
        }
        currentBuffer = null;
    };

    // Sort events by timestamp
    const orderedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    for (const event of orderedEvents) {
        const key = event.key;
        if (isStandaloneModifierKey(key)) continue;

        const shortcut = isShortcutModifier(event.modifiers || []);
        const isSpecialKey = key === 'Enter' || key === 'Tab' || key === 'Escape';
        const isTimeGap = currentBuffer && (event.timestamp - currentBuffer.lastKeyTime > BUFFER_TIMEOUT);

        if (isTimeGap && currentBuffer) flushBuffer();

        if (shortcut || isSpecialKey) {
            flushBuffer();
            const displayKey = formatModifierKey(key, event.modifiers || []);
            segments.push({
                text: displayKey,
                startTime: event.timestamp,
                endTime: event.timestamp + displayDuration,
                isShortcut: true,
            });
        } else if (key === 'Backspace' && currentBuffer) {
            currentBuffer.text = currentBuffer.text.slice(0, -1);
            currentBuffer.lastKeyTime = event.timestamp;
        } else if (key.length === 1 || key === 'Space') {
            const char = key === 'Space' ? ' ' : key;
            if (!currentBuffer) {
                currentBuffer = { text: char, startTime: event.timestamp, lastKeyTime: event.timestamp };
            } else {
                currentBuffer.text += char;
                currentBuffer.lastKeyTime = event.timestamp;
            }
        }
    }

    flushBuffer();
    return segments;
}

function formatModifierKey(key: string, modifiers: string[]): string {
    let displayKey = key.length === 1 ? key.toUpperCase() : formatSpecialKey(key);

    if (modifiers.length > 0 && key.length === 1) {
        const parts: string[] = [];
        if (modifiers.includes('cmd') || modifiers.includes('meta')) parts.push('⌘');
        if (modifiers.includes('ctrl')) parts.push('⌃');
        if (modifiers.includes('alt') || modifiers.includes('option')) parts.push('⌥');
        if (modifiers.includes('shift')) parts.push('⇧');
        parts.push(key.toUpperCase());
        return parts.join('');
    }

    return displayKey;
}

function formatSpecialKey(key: string): string {
    const keyMap: Record<string, string> = {
        'Space': '␣', 'Enter': '↵', 'Return': '↵', 'Tab': '⇥',
        'Backspace': '⌫', 'Delete': '⌦', 'Escape': 'esc',
        'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
    };
    return keyMap[key] || key.toLowerCase();
}

interface KeystrokePreviewOverlayProps {
    currentTimeMs: number;
    keystrokeEvents: KeyboardEvent[];
    settings?: Partial<KeystrokeEffectData>;
    enabled?: boolean;
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
}) => {
    const settings = useMemo(() => ({
        ...DEFAULT_KEYSTROKE_DATA,
        ...userSettings,
    }), [userSettings]);

    const segments = useMemo(() => {
        if (!enabled || keystrokeEvents.length === 0) return [];
        return computeSegments(keystrokeEvents, settings.displayDuration || 2000);
    }, [enabled, keystrokeEvents, settings.displayDuration]);

    // Find active segment at current time
    const activeSegment = useMemo(() => {
        if (segments.length === 0) return null;

        for (const seg of segments) {
            if (currentTimeMs >= seg.startTime && currentTimeMs <= seg.endTime) {
                return seg;
            }
        }
        return null;
    }, [segments, currentTimeMs]);

    // Calculate opacity (fade out)
    const opacity = useMemo(() => {
        if (!activeSegment) return 0;

        const fadeOutDuration = settings.fadeOutDuration || 400;
        const remaining = activeSegment.endTime - currentTimeMs;

        if (remaining <= fadeOutDuration) {
            return remaining / fadeOutDuration;
        }
        return 1;
    }, [activeSegment, currentTimeMs, settings.fadeOutDuration]);

    if (!enabled || !activeSegment || opacity <= 0) {
        return null;
    }

    const scale = settings.scale || 1;
    const fontSize = (settings.fontSize || 18) * scale;
    const padding = (settings.padding || 12) * scale;
    const borderRadius = (settings.borderRadius || 15) * scale;
    const margin = 48 * scale;

    // Position based on settings
    let positionStyle: React.CSSProperties = {};
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

    return (
        <div
            style={{
                position: 'absolute',
                ...positionStyle,
                opacity,
                padding: `${padding * 0.9}px ${padding * 1.4}px`,
                borderRadius,
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                border: '0.5px solid rgba(255, 255, 255, 0.12)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
                fontSize,
                fontWeight: 500,
                color: '#ffffff',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 100,
                // Ensure crisp text rendering
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale' as any,
            }}
        >
            {activeSegment.text}
        </div>
    );
};
