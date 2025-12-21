import React from 'react';
import { Composition } from 'remotion';
import { TimelineComposition } from './compositions/TimelineComposition';
import type { TimelineCompositionProps } from '../types';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TimelineComposition"
        component={TimelineComposition as any}
        durationInFrames={900} // Default, will be overridden by calculateMetadata
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={({ props }: any) => {
          // Calculate duration from all clips (timeline duration)
          const { clips, fps, videoWidth, videoHeight } = props;

          if (clips && clips.length > 0) {
            // Calculate total timeline duration (max end time of any clip)
            const totalDurationMs = Math.max(...clips.map((c: any) => c.startTime + c.duration));
            const durationInFrames = Math.ceil((totalDurationMs / 1000) * fps);

            return {
              durationInFrames,
              fps,
              width: videoWidth || 1920,
              height: videoHeight || 1080,
            };
          }

          // Fallback for empty timeline
          return {
            durationInFrames: 900,
            fps: fps || 30,
            width: videoWidth || 1920,
            height: videoHeight || 1080,
          };
        }}
        defaultProps={{
          clips: [],
          recordings: [],
          effects: [],
          videoWidth: 1920,
          videoHeight: 1080,
          fps: 30,
        }}
      />
    </>
  );
};