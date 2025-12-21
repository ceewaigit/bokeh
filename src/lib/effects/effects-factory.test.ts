import { EffectsFactory } from './effects-factory';
import { Effect, EffectType } from '@/types/project';

describe('EffectsFactory', () => {
    describe('findActiveEffectIndex', () => {
        const effects: Effect[] = [
            { id: '1', type: EffectType.Zoom, startTime: 0, endTime: 10, enabled: true, data: {} },
            { id: '2', type: EffectType.Zoom, startTime: 20, endTime: 30, enabled: true, data: {} },
            { id: '3', type: EffectType.Zoom, startTime: 40, endTime: 50, enabled: true, data: {} },
        ];

        it('should find index of active effect', () => {
            expect(EffectsFactory.findActiveEffectIndex(effects, 5)).toBe(0);
            expect(EffectsFactory.findActiveEffectIndex(effects, 25)).toBe(1);
            expect(EffectsFactory.findActiveEffectIndex(effects, 45)).toBe(2);
        });

        it('should return -1 if no active effect', () => {
            expect(EffectsFactory.findActiveEffectIndex(effects, 15)).toBe(-1);
            expect(EffectsFactory.findActiveEffectIndex(effects, 35)).toBe(-1);
            expect(EffectsFactory.findActiveEffectIndex(effects, 55)).toBe(-1);
        });

        it('should handle boundaries correctly', () => {
            expect(EffectsFactory.findActiveEffectIndex(effects, 0)).toBe(0);
            expect(EffectsFactory.findActiveEffectIndex(effects, 10)).toBe(0);
            expect(EffectsFactory.findActiveEffectIndex(effects, 20)).toBe(1);
        });
    });

    describe('getActiveEffectAtTime', () => {
        const effects: Effect[] = [
            { id: '1', type: EffectType.Zoom, startTime: 0, endTime: 10, enabled: true, data: {} },
            { id: '2', type: EffectType.Cursor, startTime: 5, endTime: 15, enabled: true, data: {} }, // Overlap
            { id: '3', type: EffectType.Zoom, startTime: 20, endTime: 30, enabled: true, data: {} },
        ];

        it('should find active effect of specific type', () => {
            expect(EffectsFactory.getActiveEffectAtTime(effects, EffectType.Zoom, 5)?.id).toBe('1');
            expect(EffectsFactory.getActiveEffectAtTime(effects, EffectType.Cursor, 10)?.id).toBe('2');
            expect(EffectsFactory.getActiveEffectAtTime(effects, EffectType.Zoom, 25)?.id).toBe('3');
        });

        it('should return undefined if type does not match', () => {
            expect(EffectsFactory.getActiveEffectAtTime(effects, EffectType.Zoom, 12)).toBeUndefined();
        });

        it('should handle overlapping effects correctly', () => {
            // At time 8, both Zoom (0-10) and Cursor (5-15) are active.
            expect(EffectsFactory.getActiveEffectAtTime(effects, EffectType.Zoom, 8)?.id).toBe('1');
            expect(EffectsFactory.getActiveEffectAtTime(effects, EffectType.Cursor, 8)?.id).toBe('2');
        });

        it('should handle mixed types and find the correct one even if binary search lands on another', () => {
            // This tests the logic where we scan backwards from the insertion point
            const mixedEffects: Effect[] = [
                { id: '1', type: EffectType.Background, startTime: 0, endTime: 100, enabled: true, data: {} },
                { id: '2', type: EffectType.Zoom, startTime: 10, endTime: 20, enabled: true, data: {} },
                { id: '3', type: EffectType.Cursor, startTime: 15, endTime: 25, enabled: true, data: {} },
            ];

            // At time 18:
            // Background (0-100) is active
            // Zoom (10-20) is active
            // Cursor (15-25) is active

            // If we search for Zoom at 18:
            // Binary search for insertion point of 18 might land after all of them (since startTimes are <= 18).
            // It should scan back and find Zoom.

            expect(EffectsFactory.getActiveEffectAtTime(mixedEffects, EffectType.Zoom, 18)?.id).toBe('2');
            expect(EffectsFactory.getActiveEffectAtTime(mixedEffects, EffectType.Cursor, 18)?.id).toBe('3');
            expect(EffectsFactory.getActiveEffectAtTime(mixedEffects, EffectType.Background, 18)?.id).toBe('1');
        });
    });
});
