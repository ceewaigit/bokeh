import React from 'react';
import { Rect, Group } from 'react-konva';
import { WaveformAnalyzer } from '@/features/audio/waveform-analyzer';
import { useTimelineColors } from '@/features/timeline/utils/colors';

interface TimelineClipWaveformProps {
    clipId: string;
    clipWidth: number;
    clipInnerHeight: number;
    peaks: number[];
    isSelected: boolean;
    colors: ReturnType<typeof useTimelineColors>;
}

export const TimelineClipWaveform: React.FC<TimelineClipWaveformProps> = ({
    clipId,
    clipWidth,
    clipInnerHeight,
    peaks,
    isSelected,
    colors,
}) => {
    // 1. Group / Clip Dimensions
    // Used for the outer container and clipping
    const containerHeight = Math.max(12, Math.min(24, Math.floor(clipInnerHeight * 0.4)));

    // 2. Waveform Visualization Dimensions
    // Used for the bars and backdrop
    const waveformHeight = Math.max(16, Math.min(34, Math.floor(clipInnerHeight * 0.7)));
    const baselineY = waveformHeight - 1;
    const maxAmplitude = waveformHeight - 4;

    // 3. Constants
    const minBarHeight = 3;
    const heightBoost = 1.6;
    const barWidth = 2;
    const barGap = 1;

    // 4. Memoized Calculation
    const resampledPeaks = React.useMemo(() => {
        return peaks.length
            ? WaveformAnalyzer.resamplePeaks(peaks, clipWidth, barWidth, barGap)
            : [];
    }, [peaks, clipWidth]);

    const fill = isSelected ? colors.primary : 'rgba(255,255,255,0.9)';
    const opacity = isSelected ? 0.8 : 0.6;

    return (
        <Group
            y={clipInnerHeight - containerHeight - 2}
            clipFunc={(ctx) => {
                ctx.beginPath();
                if (clipWidth > 0 && containerHeight > 0) {
                    ctx.roundRect(0, 0, clipWidth, containerHeight, [0, 0, 8, 8]);
                }
                ctx.closePath();
            }}
        >
            {/* Contrast backdrop */}
            <Rect
                x={0}
                y={0}
                width={clipWidth}
                height={waveformHeight}
                fill="rgba(0,0,0,0.15)"
                opacity={1}
                cornerRadius={[0, 0, 8, 8]}
                listening={false}
            />

            {resampledPeaks.map((peak, i) => {
                const x = i * (barWidth + barGap);
                if (x > clipWidth) return null;

                const clamped = Math.max(0, Math.min(1, peak));
                const shaped = Math.pow(clamped, 0.5);
                const scaled = minBarHeight + shaped * (maxAmplitude - minBarHeight) * heightBoost;
                const barHeight = Math.max(minBarHeight, Math.min(maxAmplitude, scaled));

                return (
                    <Rect
                        key={`wf-${clipId}-${i}`}
                        x={x}
                        y={baselineY - barHeight}
                        width={barWidth}
                        height={barHeight}
                        fill={fill}
                        opacity={opacity}
                        cornerRadius={1}
                        listening={false}
                    />
                );
            })}
        </Group>
    );
};
