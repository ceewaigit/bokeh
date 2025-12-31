import React from 'react'
import { usePreviewSettingsStore } from '@/stores/preview-settings-store'
import { useVideoPosition } from '@/remotion/context/layout/VideoPositionContext'

interface PreviewGuidesProps {
    rect?: {
        x: number
        y: number
        width: number
        height: number
    }
}

export function PreviewGuides({ rect: explicitRect }: PreviewGuidesProps) {
    const { offsetX, offsetY, drawWidth, drawHeight } = useVideoPosition();

    const rect = explicitRect || {
        x: offsetX,
        y: offsetY,
        width: drawWidth,
        height: drawHeight
    }

    const showRuleOfThirds = usePreviewSettingsStore((s) => s.showRuleOfThirds)
    const showCenterGuides = usePreviewSettingsStore((s) => s.showCenterGuides)
    const showSafeZones = usePreviewSettingsStore((s) => s.showSafeZones)
    const guideColor = usePreviewSettingsStore((s) => s.guideColor)
    const guideOpacity = usePreviewSettingsStore((s) => s.guideOpacity)
    const safeZoneMargin = usePreviewSettingsStore((s) => s.safeZoneMargin)

    if (!showRuleOfThirds && !showCenterGuides && !showSafeZones) return null

    const style: React.CSSProperties = {
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        pointerEvents: 'none',
        zIndex: 2000
    }

    return (
        <div style={style}>
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Rule of Thirds - vertical lines at 33.33% and 66.67% */}
                {showRuleOfThirds && (
                    <>
                        <line x1="33.33" y1="0" x2="33.33" y2="100" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        <line x1="66.67" y1="0" x2="66.67" y2="100" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1="33.33" x2="100" y2="33.33" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1="66.67" x2="100" y2="66.67" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </>
                )}

                {/* Center Guides - crosshair at 50% */}
                {showCenterGuides && (
                    <>
                        <line x1="50" y1="0" x2="50" y2="100" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.45" strokeDasharray="3 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1="50" x2="100" y2="50" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.45" strokeDasharray="3 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </>
                )}

                {/* Safe Zones */}
                {showSafeZones && (
                    <rect
                        x={safeZoneMargin}
                        y={safeZoneMargin}
                        width={100 - (safeZoneMargin * 2)}
                        height={100 - (safeZoneMargin * 2)}
                        fill="none"
                        stroke={guideColor}
                        strokeOpacity={guideOpacity}
                        strokeWidth="0.5"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />
                )}
            </svg>
        </div>
    )
}
