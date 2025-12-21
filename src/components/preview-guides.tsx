import React from 'react'
import { useProjectStore } from '@/stores/project-store'

interface PreviewGuidesProps {
    rect?: {
        x: number
        y: number
        width: number
        height: number
    }
}

export function PreviewGuides({ rect }: PreviewGuidesProps) {
    const preview = useProjectStore((s) => s.settings.preview)
    const {
        showRuleOfThirds,
        showCenterGuides,
        showSafeZones,
        guideColor = '#ffffff',
        guideOpacity = 0.5,
        safeZoneMargin = 10
    } = preview

    if (!showRuleOfThirds && !showCenterGuides && !showSafeZones) return null

    const style: React.CSSProperties = rect ? {
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        pointerEvents: 'none',
        zIndex: 2000
    } : {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2000
    }

    return (
        <div style={style}>
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Rule of Thirds - vertical lines at 33.33% and 66.67% */}
                {showRuleOfThirds && (
                    <>
                        <line x1="33.33" y1="0" x2="33.33" y2="100" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                        <line x1="66.67" y1="0" x2="66.67" y2="100" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1="33.33" x2="100" y2="33.33" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1="66.67" x2="100" y2="66.67" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
                    </>
                )}

                {/* Center Guides - crosshair at 50% */}
                {showCenterGuides && (
                    <>
                        <line x1="50" y1="0" x2="50" y2="100" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.15" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1="50" x2="100" y2="50" stroke={guideColor} strokeOpacity={guideOpacity} strokeWidth="0.15" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
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
                        strokeWidth="0.2"
                        vectorEffect="non-scaling-stroke"
                    />
                )}
            </svg>
        </div>
    )
}
