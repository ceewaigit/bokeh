import React from 'react';
import { Rect, Group, Text } from 'react-konva';
import { withAlpha } from '@/lib/timeline/colors';

interface TimelineClipBackgroundProps {
    clipId: string;
    width: number;
    height: number;
    isSelected: boolean;
    isDragging: boolean;
    isValidPosition: boolean;
    isGeneratedClip: boolean;
    generatedLabel: string;
    showMissingThumb: boolean;
    trackType: 'video' | 'audio';
    hasThumbnails: boolean;
    colors: any; // Using explicit any for now as useTimelineColors return type isn't strictly typed here
}

export const TimelineClipBackground: React.FC<TimelineClipBackgroundProps> = ({
    clipId,
    width,
    height,
    isSelected,
    isDragging,
    isValidPosition,
    isGeneratedClip,
    generatedLabel,
    showMissingThumb,
    trackType,
    hasThumbnails,
    colors,
}) => {
    const warningColor = colors.warning || 'hsl(38, 92%, 50%)';
    const missingThumbFill = withAlpha(warningColor, colors.isDark ? 0.5 : 0.35);
    const missingThumbStroke = withAlpha(warningColor, colors.isDark ? 0.7 : 0.55);

    return (
        <>
            {/* Clip background with rounded corners */}
            <Rect
                // Center pivot for scaling
                offsetX={width / 2}
                offsetY={height / 2}
                x={width / 2}
                y={height / 2}
                width={width}
                height={height}
                fill={
                    trackType === 'video' && hasThumbnails
                        ? 'transparent'
                        : trackType === 'video'
                            ? (isGeneratedClip ? colors.muted : (showMissingThumb ? missingThumbFill : 'rgba(127,127,127,0.15)'))
                            : colors.success
                }
                // New Selected Look: White/High-contrast border when selected
                stroke={
                    isDragging && !isValidPosition
                        ? colors.destructive
                        : isSelected
                            ? (colors.isDark ? 'rgba(255,255,255,0.9)' : colors.primary)
                            : showMissingThumb
                                ? missingThumbStroke
                                : 'transparent'
                }
                strokeWidth={isDragging && !isValidPosition ? 1.5 : isSelected ? 1.5 : showMissingThumb ? 1 : 0}
                cornerRadius={8}
                opacity={1}
                // Updated Shadow: Subtle and clean
                shadowColor={isSelected ? (colors.primary) : 'black'}
                shadowBlur={isSelected ? 4 : 1}
                shadowOpacity={isSelected ? 0.15 : 0.05}
                shadowOffsetY={1}
            />

            {isGeneratedClip && !hasThumbnails && (
                <Group
                    clipFunc={(ctx) => {
                        ctx.beginPath();
                        if (width > 0 && height > 0) {
                            ctx.roundRect(0, 0, width, height, 8);
                        }
                        ctx.closePath();
                    }}
                >
                    {(() => {
                        const stripeWidth = 10;
                        const stripeGap = 10;
                        const stripeCount = Math.max(1, Math.ceil(width / (stripeWidth + stripeGap)));

                        return Array.from({ length: stripeCount }, (_, i) => (
                            <Rect
                                key={`gen-stripe-${clipId}-${i}`}
                                x={i * (stripeWidth + stripeGap)}
                                y={0}
                                width={stripeWidth}
                                height={height}
                                fill="rgba(255,255,255,0.06)"
                                opacity={0.6}
                                listening={false}
                            />
                        ));
                    })()}
                    <Rect
                        width={width}
                        height={height}
                        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                        fillLinearGradientEndPoint={{ x: 0, y: height }}
                        fillLinearGradientColorStops={[
                            0, 'rgba(255,255,255,0.05)',
                            0.5, 'rgba(255,255,255,0)',
                            1, 'rgba(0,0,0,0.1)'
                        ]}
                        listening={false}
                    />
                    {width > 80 && (
                        <Text
                            x={12}
                            y={10}
                            text={generatedLabel}
                            fontSize={10}
                            // Improved Typography
                            fontFamily="'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                            fontStyle="600"
                            fill="rgba(255,255,255,0.7)"
                            listening={false}
                        />
                    )}
                </Group>
            )}
        </>
    );
};
