/**
 * Unit tests for clip boundary transitions
 *
 * These tests verify that zoom and cursor state calculations work correctly
 * at clip boundaries, especially when clips are split from the same recording
 * with different playback rates (e.g., auto speed-up feature).
 */

import { describe, it, expect } from '@jest/globals';

// Mock the Clip type for testing
const createClip = (id, startTime, duration, sourceIn, sourceOut, playbackRate = 1) => ({
  id,
  startTime,
  duration,
  sourceIn,
  sourceOut,
  playbackRate,
  recordingId: 'test-recording'
});

describe('Clip Boundary Transitions', () => {
  describe('findClipAtTimelinePosition', () => {
    it('should find the correct clip at exact boundary (start)', () => {
      // Import the function
      const { findClipAtTimelinePosition } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      // At exactly 2000ms, should find clip-b (the starting clip)
      const result = findClipAtTimelinePosition(2000, clips);
      expect(result).toBeTruthy();
      expect(result.id).toBe('clip-b');
    });

    it('should find the correct clip just before boundary', () => {
      const { findClipAtTimelinePosition } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      // At 1999.9ms, should find clip-a
      const result = findClipAtTimelinePosition(1999.9, clips);
      expect(result).toBeTruthy();
      expect(result.id).toBe('clip-a');
    });

    it('should find the correct clip one frame before boundary (30fps)', () => {
      const { findClipAtTimelinePosition } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      // At 30fps, one frame = 33.33ms
      // Previous frame from 2000ms is at 1966.67ms
      const result = findClipAtTimelinePosition(1966.67, clips);
      expect(result).toBeTruthy();
      expect(result.id).toBe('clip-a');
    });

    it('should handle epsilon tolerance at boundaries', () => {
      const { findClipAtTimelinePosition } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      // Just slightly over the boundary (within epsilon)
      const result = findClipAtTimelinePosition(2000.05, clips);
      expect(result).toBeTruthy();
      expect(result.id).toBe('clip-b');
    });

    it('should return null for timeline position beyond all clips', () => {
      const { findClipAtTimelinePosition } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      const result = findClipAtTimelinePosition(5000, clips);
      expect(result).toBeNull();
    });

    it('should return null for negative timeline position', () => {
      const { findClipAtTimelinePosition } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      const result = findClipAtTimelinePosition(-100, clips);
      expect(result).toBeNull();
    });
  });

  describe('Cross-Clip Timeline to Source Conversion', () => {
    it('should convert timeline position correctly across clip boundary', () => {
      const { findClipAtTimelinePosition, timelineToSource } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      // Previous frame from 2000ms (at 30fps)
      const prevTimelineMs = 1966.67;

      // Find the correct clip (should be clip-a)
      const prevClip = findClipAtTimelinePosition(prevTimelineMs, clips);
      expect(prevClip.id).toBe('clip-a');

      // Convert to source time using the correct clip
      const sourceTime = timelineToSource(prevTimelineMs, prevClip);

      // For clip-a: timeline 1966.67 - startTime 0 = 1966.67 clip-relative
      // At 1x playback, source time should be ~1966.67
      expect(sourceTime).toBeCloseTo(1966.67, 1);
    });

    it('should handle conversion at exact boundary', () => {
      const { findClipAtTimelinePosition, timelineToSource } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      // Exactly at boundary
      const timelineMs = 2000;
      const clip = findClipAtTimelinePosition(timelineMs, clips);
      expect(clip.id).toBe('clip-b');

      const sourceTime = timelineToSource(timelineMs, clip);

      // For clip-b: timeline 2000 - startTime 2000 = 0 clip-relative
      // At 2x playback, source time should be 2000 (sourceIn)
      expect(sourceTime).toBeCloseTo(2000, 1);
    });

    it('should handle sped-up clip correctly', () => {
      const { findClipAtTimelinePosition, timelineToSource } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2) // 2x speed, 2000ms source = 1000ms timeline
      ];

      // Middle of clip-b in timeline
      const timelineMs = 2500; // 500ms into clip-b
      const clip = findClipAtTimelinePosition(timelineMs, clips);
      expect(clip.id).toBe('clip-b');

      const sourceTime = timelineToSource(timelineMs, clip);

      // 500ms clip-relative at 2x speed = 1000ms source duration
      // sourceIn (2000) + 1000 = 3000ms
      expect(sourceTime).toBeCloseTo(3000, 1);
    });
  });

  describe('Cache Key Consistency', () => {
    it('should produce consistent cache keys using Math.round', () => {
      // Simulate cache key generation
      const sourceTimeA = 1999.4; // Should round to 1999
      const sourceTimeB = 1999.5; // Should round to 2000
      const sourceTimeC = 1999.6; // Should round to 2000

      expect(Math.round(sourceTimeA)).toBe(1999);
      expect(Math.round(sourceTimeB)).toBe(2000);
      expect(Math.round(sourceTimeC)).toBe(2000);
    });

    it('should match cache keys for lookup and storage', () => {
      // When storing a state
      const currentSourceTime = 2000.3;
      const storageKey = Math.round(currentSourceTime);

      // When looking up previous frame (one frame earlier at 30fps)
      const prevSourceTime = 2000.3 - 33.33; // ~1966.97
      const lookupKey = Math.round(prevSourceTime);

      // Keys should be integers
      expect(Number.isInteger(storageKey)).toBe(true);
      expect(Number.isInteger(lookupKey)).toBe(true);

      // Should produce deterministic results
      expect(storageKey).toBe(2000);
      expect(lookupKey).toBe(1967);
    });

    it('should handle boundary cache keys correctly', () => {
      // At exact boundary
      const boundaryTime = 2000.0;
      const key = Math.round(boundaryTime);
      expect(key).toBe(2000);

      // Just before boundary
      const beforeBoundary = 1999.97;
      const keyBefore = Math.round(beforeBoundary);
      expect(keyBefore).toBe(2000);

      // Just after boundary
      const afterBoundary = 2000.03;
      const keyAfter = Math.round(afterBoundary);
      expect(keyAfter).toBe(2000);
    });
  });

  describe('Previous Frame Calculation at Boundaries', () => {
    it('should calculate correct previous frame source time at boundary', () => {
      const { findClipAtTimelinePosition, timelineToSource } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 2000, 0, 2000, 1),
        createClip('clip-b', 2000, 1000, 2000, 4000, 2)
      ];

      const fps = 30;
      const frameDurationMs = 1000 / fps; // 33.33ms

      // Current position: exactly at boundary (first frame of clip-b)
      const currentTimelineMs = 2000;
      const prevTimelineMs = currentTimelineMs - frameDurationMs; // 1966.67

      // Find clips
      const currentClip = findClipAtTimelinePosition(currentTimelineMs, clips);
      const prevClip = findClipAtTimelinePosition(prevTimelineMs, clips);

      expect(currentClip.id).toBe('clip-b');
      expect(prevClip.id).toBe('clip-a'); // CRITICAL: Different clip!

      // Convert both to source times
      const currentSourceTime = timelineToSource(currentTimelineMs, currentClip);
      const prevSourceTime = timelineToSource(prevTimelineMs, prevClip);

      // Current should be at sourceIn of clip-b
      expect(currentSourceTime).toBeCloseTo(2000, 1);

      // Previous should be near end of clip-a's source range
      expect(prevSourceTime).toBeCloseTo(1966.67, 1);

      // Source times should be close (within one frame duration)
      const sourceTimeDiff = currentSourceTime - prevSourceTime;
      expect(sourceTimeDiff).toBeGreaterThan(0);
      expect(sourceTimeDiff).toBeLessThan(50); // Should be ~33ms
    });

    it('should handle multiple boundary crossings', () => {
      const { findClipAtTimelinePosition, timelineToSource } = require('../../src/lib/timeline/time-space-converter');

      const clips = [
        createClip('clip-a', 0, 1000, 0, 1000, 1),
        createClip('clip-b', 1000, 500, 1000, 2000, 2),
        createClip('clip-c', 1500, 1000, 2000, 3000, 1)
      ];

      const fps = 30;
      const frameDurationMs = 1000 / fps;

      // Test boundary between clip-b and clip-c
      const currentTimelineMs = 1500; // First frame of clip-c
      const prevTimelineMs = currentTimelineMs - frameDurationMs;

      const currentClip = findClipAtTimelinePosition(currentTimelineMs, clips);
      const prevClip = findClipAtTimelinePosition(prevTimelineMs, clips);

      expect(currentClip.id).toBe('clip-c');
      expect(prevClip.id).toBe('clip-b'); // Should cross boundary

      const currentSourceTime = timelineToSource(currentTimelineMs, currentClip);
      const prevSourceTime = timelineToSource(prevTimelineMs, prevClip);

      // Both should produce valid source times
      expect(currentSourceTime).toBeGreaterThanOrEqual(2000);
      expect(prevSourceTime).toBeGreaterThanOrEqual(1000);
      expect(prevSourceTime).toBeLessThan(2000);
    });
  });
});
