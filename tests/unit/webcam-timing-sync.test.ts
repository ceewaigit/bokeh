/**
 * Webcam Timing Synchronization Tests
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildWebcamFrameLayout,
  findActiveWebcamFrameLayoutItem,
  getWebcamVideoStartFrom,
  type WebcamFrameLayoutItem,
} from '../../src/features/ui/timeline/utils/frame-layout';
import type { Clip } from '@/types/project';

type WebcamClipOverrides = {
  id: string;
  recordingId: string;
  startTime?: number;
  duration?: number;
  sourceIn?: number;
  sourceOut?: number;
  playbackRate?: number;
};

function createWebcamClip(overrides: WebcamClipOverrides): Clip {
  const playbackRate = overrides.playbackRate ?? 1;
  const startTime = overrides.startTime ?? 0;
  const duration = overrides.duration ?? 5000;
  const sourceIn = overrides.sourceIn ?? 0;
  const sourceOut = overrides.sourceOut ?? (sourceIn + duration * playbackRate);

  return {
    id: overrides.id,
    recordingId: overrides.recordingId,
    startTime,
    duration,
    sourceIn,
    sourceOut,
    playbackRate,
  } as Clip;
}

/**
 * Calculate expected video source time (in seconds) for a given timeline frame.
 */
function getExpectedSourceTime(
  frame: number,
  layoutItem: WebcamFrameLayoutItem,
  fps: number
): number {
  const localFrame = frame - layoutItem.groupStartFrame;
  const playbackRate = layoutItem.clip.playbackRate ?? 1;
  return (layoutItem.groupStartSourceIn / 1000) + (localFrame / fps) * playbackRate;
}

describe('getWebcamVideoStartFrom', () => {
  const fps = 60;

  it('at frame 0, returns expected source time', () => {
    const clips = [
      createWebcamClip({
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 10000,
        sourceIn: 0,
      }),
    ];

    const layout = buildWebcamFrameLayout(clips, fps);
    const item = layout[0];

    const expected = getExpectedSourceTime(0, item, fps);
    const actual = getWebcamVideoStartFrom(0, item, fps);

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('at frame 300, returns expected source time', () => {
    const clips = [
      createWebcamClip({
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 10000,
        sourceIn: 0,
      }),
    ];

    const layout = buildWebcamFrameLayout(clips, fps);
    const item = layout[0];

    const expected = getExpectedSourceTime(300, item, fps); // 5 seconds
    const actual = getWebcamVideoStartFrom(300, item, fps);

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('at frame 480, returns expected source time', () => {
    const clips = [
      createWebcamClip({
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 10000,
        sourceIn: 0,
      }),
    ];

    const layout = buildWebcamFrameLayout(clips, fps);
    const item = layout[0];

    const expected = getExpectedSourceTime(480, item, fps); // 8 seconds
    const actual = getWebcamVideoStartFrom(480, item, fps);

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('at frame 300 with sourceIn=5000, returns expected source time', () => {
    const clips = [
      createWebcamClip({
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 10000,
        sourceIn: 5000,
      }),
    ];

    const layout = buildWebcamFrameLayout(clips, fps);
    const item = layout[0];

    const expected = getExpectedSourceTime(300, item, fps); // 10 seconds
    const actual = getWebcamVideoStartFrom(300, item, fps);

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('at frame 360 in second clip, returns expected source time', () => {
    const clips = [
      createWebcamClip({
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 5000,
        sourceIn: 0,
      }),
      createWebcamClip({
        id: 'clip-2',
        recordingId: 'rec-1',
        startTime: 5000,
        duration: 5000,
        sourceIn: 5000,
      }),
    ];

    const layout = buildWebcamFrameLayout(clips, fps);
    const active = findActiveWebcamFrameLayoutItem(layout, 360);
    expect(active).not.toBeNull();

    const expected = getExpectedSourceTime(360, active!, fps); // 6 seconds
    const actual = getWebcamVideoStartFrom(360, active!, fps);

    expect(actual).toBeCloseTo(expected, 2);
  });

  it('at frame 600 with sourceIn=10000, returns expected source time', () => {
    const clips = [
      createWebcamClip({
        id: 'clip-1',
        recordingId: 'rec-1',
        startTime: 0,
        duration: 15000,
        sourceIn: 10000,
      }),
    ];

    const layout = buildWebcamFrameLayout(clips, fps);
    const item = layout[0];

    const expected = getExpectedSourceTime(600, item, fps); // 20 seconds
    const actual = getWebcamVideoStartFrom(600, item, fps);

    expect(actual).toBeCloseTo(expected, 2);
  });
});
