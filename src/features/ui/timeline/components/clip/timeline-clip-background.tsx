import React from 'react';
import { Rect, Group, Text } from 'react-konva';
import { withAlpha, useTimelineColors } from '@/features/ui/timeline/utils/colors';
import { drawSquircleRectPath } from '@/features/ui/timeline/utils/corners';
import { ContinuousRect } from '@/features/ui/timeline/components/konva/continuous-rect';

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
    trackType: 'video' | 'audio' | 'webcam';
    hasThumbnails: boolean;
    colors: ReturnType<typeof useTimelineColors>;
    roundLeft?: boolean;
    roundRight?: boolean;
    isHovering?: boolean;
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
    roundLeft = true,
    roundRight = true,
    isHovering = false,
}) => {
    const shapeRef = React.useRef<any>(null);
    const tweenRef = React.useRef<any>(null);

    React.useEffect(() => {
        if (!shapeRef.current) return;

        // Destroy previous tween
        if (tweenRef.current) {
            tweenRef.current.destroy();
        }

        // Target state
        const targetShadowBlur = isHovering && !isDragging ? (isSelected ? 16 : 12) : (isSelected ? 4 : 0);
        const targetShadowOpacity = isHovering && !isDragging ? 0.3 : (isSelected || trackType === 'webcam' ? 0.2 : 0);
        // Special case for webcam which always has some shadow/border

        tweenRef.current = new (window as any).Konva.Tween({
            node: shapeRef.current,
            duration: 0.15, // fast & snappy
            shadowBlur: targetShadowBlur,
            shadowOpacity: targetShadowOpacity,
            easing: (window as any).Konva.Easings.EaseOut,
        });

        tweenRef.current.play();

        return () => {
            if (tweenRef.current) tweenRef.current.destroy();
        };
    }, [isHovering, isDragging, isSelected, trackType]);

    const clipBaseColor = colors.isDark ? 'hsl(42, 95%, 55%)' : 'hsl(42, 95%, 45%)';
    const clipFillColor = showMissingThumb
        ? withAlpha(clipBaseColor, colors.isDark ? 0.12 : 0.08)
        : 'rgba(127,127,127,0.1)';

    const cornerRadius = {
        topLeft: roundLeft ? 10 : 0,
        bottomLeft: roundLeft ? 10 : 0,
        topRight: roundRight ? 10 : 0,
        bottomRight: roundRight ? 10 : 0,
    };

    return (
        <>
            {/* Clip background with rounded corners */}
            <ContinuousRect
                // Center pivot for scaling
                offsetX={width / 2}
                offsetY={height / 2}
                x={width / 2}
                y={height / 2}
                width={width}
                height={height}
                cornerRadius={cornerRadius}
                fill={
                    trackType === 'video' && hasThumbnails
                        ? 'transparent'
                        : trackType === 'video'
                            ? (isGeneratedClip ? colors.muted : clipFillColor)
                            : trackType === 'webcam'
                                ? withAlpha(colors.webcamClip, 0.1) // Match Effect Block opacity
                                : colors.success
                }
                // New Selected Look: White/High-contrast border when selected
                stroke={
                    isDragging && !isValidPosition
                        ? colors.destructive
                        : isSelected
                            ? (colors.isDark ? 'rgba(255,255,255,0.95)' : colors.primary)
                            : trackType === 'webcam'
                                ? withAlpha(colors.webcamClip, 0.7) // Always show border for Webcam clips (like Effects)
                                : showMissingThumb || isGeneratedClip || trackType !== 'video'
                                    ? withAlpha(clipBaseColor, colors.isDark ? 0.8 : 0.7)
                                    : 'transparent'
                }
                strokeWidth={
                    isDragging && !isValidPosition
                        ? 1.5
                        : isSelected
                            ? 2
                            : trackType === 'webcam'
                                ? 1.5 // Always show border for Webcam
                                : showMissingThumb || isGeneratedClip || trackType !== 'video' ? 1.5 : 0
                }
                shadowColor="black"
                // Match Effect Block shadow depth
                shadowBlur={trackType === 'webcam' ? (isSelected ? 12 : 4) : 0}
                shadowOpacity={trackType === 'webcam' ? (isSelected ? 0.3 : 0.15) : 0}
                shadowOffsetY={trackType === 'webcam' ? 2 : 0}
                opacity={1}
            />

            {isGeneratedClip && !hasThumbnails && (
                <Group
                    clipFunc={(ctx) => {
                        drawSquircleRectPath(ctx as unknown as CanvasRenderingContext2D, 0, 0, width, height, cornerRadius);
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
