import React from 'react';
import { Rect, Group, Image } from 'react-konva';

interface TimelineClipThumbnailsProps {
    thumbnails: HTMLImageElement[];
    width: number;
    height: number;
    clipWidth: number;
}

export const TimelineClipThumbnails: React.FC<TimelineClipThumbnailsProps> = ({
    thumbnails,
    height,    // This is clipInnerHeight
    clipWidth,
}) => {
    return (
        <Group clipFunc={(ctx) => {
            // Clip to rounded rectangle
            ctx.beginPath();
            if (clipWidth > 0 && height > 0) {
                ctx.roundRect(0, 0, clipWidth, height, 8);
            }
            ctx.closePath();
        }}>
            {/* Distribute thumbnails across clip width */}
            {(() => {
                const thumbHeight = height;
                const firstThumb = thumbnails[0];
                if (!firstThumb) return null;
                const aspectRatio = firstThumb.width / firstThumb.height;
                const thumbWidth = Math.floor(thumbHeight * aspectRatio);
                const tileCount = Math.max(1, Math.ceil(clipWidth / thumbWidth));

                return Array.from({ length: tileCount }, (_, i) => {
                    // Distribute available thumbnails across tile positions
                    const thumbIndex = Math.floor((i / tileCount) * thumbnails.length);
                    const thumb = thumbnails[thumbIndex] || thumbnails[0];
                    if (!thumb) return null;
                    return (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <Image
                            key={i}
                            image={thumb}
                            x={i * thumbWidth}
                            y={0}
                            width={thumbWidth}
                            height={thumbHeight}
                            opacity={0.95}
                        />
                    );
                });
            })()}
            {/* Gradient overlay for text visibility */}
            <Rect
                width={clipWidth}
                height={height}
                fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                fillLinearGradientEndPoint={{ x: 0, y: height }}
                fillLinearGradientColorStops={[
                    0, 'rgba(0,0,0,0.02)', // Very subtle top
                    0.7, 'rgba(0,0,0,0)',
                    1, 'rgba(0,0,0,0.1)' // Much more subtle bottom
                ]}
            />
        </Group>
    );
};
