import {
    validatePosition,
    findNextValidPosition,
    getReorderTarget,
    computeContiguousPreview,
    computeContiguousSnapPositions,
    findNearestContiguousSnap,
    type TimelineBlockRange
} from '@/features/ui/timeline/utils/drag-positioning'

describe('drag-positioning utils', () => {
    const blocks: TimelineBlockRange[] = [
        { id: '1', startTime: 1000, endTime: 2000 },
        { id: '2', startTime: 3000, endTime: 4000 }
    ]

    describe('validatePosition', () => {
        it('allows valid position in empty space', () => {
            const result = validatePosition(0, 500, blocks)
            expect(result.isValid).toBe(true)
            expect(result.finalPosition).toBe(0)
        })

        it('detects overlap with existing block', () => {
            const result = validatePosition(1500, 1000, blocks) // 1500-2500 overlaps with 1000-2000
            expect(result.isValid).toBe(false)
            expect(result.reason).toContain('overlap')
        })

        it('suggests next valid position when overlapping', () => {
            const result = validatePosition(1500, 1000, blocks) // 1500-2500 overlaps, next gap is 2000 (fits) or 4000
            // 2000 to 3000 fits (duration 1000). So it should suggest 2000.
            expect(result.suggestedPosition).toBe(2000)
        })

        it('allows overlap if explicitly allowed', () => {
            const result = validatePosition(1500, 1000, blocks, undefined, { allowOverlap: true })
            expect(result.isValid).toBe(true)
        })

        it('ignores excluded block ID (self)', () => {
            const result = validatePosition(1500, 500, blocks, '1') // overlapping '1' but '1' is excluded
            expect(result.isValid).toBe(true)
        })

        it('enforces leftmost constraint', () => {
            // If we enforce leftmost, we cannot place before the end of the leftmost block?
            // Wait, getLeftmostBlockEnd returns the endTime of the leftmost block.
            // So if I have block 1 at 1000-2000, getLeftmostBlockEnd is 2000.
            // I cannot place at 0.
            const result = validatePosition(0, 500, blocks, undefined, { enforceLeftmostConstraint: true })
            expect(result.isValid).toBe(false)
            expect(result.suggestedPosition).toBeGreaterThanOrEqual(2000)
        })
    })

    describe('findNextValidPosition', () => {
        it('finds nearest gap after desired time', () => {
            // blocks: 1000-2000, 3000-4000
            // Try 900, duration 1200 (end 2100). Overlaps 1.
            // Next gap: 2000. Duration 1000 fits 1200? No, 2000-3000 is size 1000.
            // Next gap: 4000.
            const pos = findNextValidPosition(900, 1200, blocks)
            expect(pos).toBe(4000)
        })

        it('fits into small gap if duration is small enough', () => {
            // blocks: 1000-2000, 3000-4000
            // Gap at 2000-3000 (size 1000).
            // Try 1500, duration 500.
            const pos = findNextValidPosition(1500, 500, blocks)
            expect(pos).toBe(2000)
        })
    })

    describe('Contiguous Logic', () => {
        // contiguous blocks: A(100ms), B(200ms), C(300ms)
        // 0-100, 100-300, 300-600
        const contBlocks: TimelineBlockRange[] = [
            { id: 'A', startTime: 0, endTime: 100 },
            { id: 'B', startTime: 100, endTime: 300 },
            { id: 'C', startTime: 300, endTime: 600 }
        ]

        describe('getReorderTarget', () => {
            it('inserts at index 0 if before first midpoint', () => {
                // A is 0-100. Midpoint 50.
                const target = getReorderTarget(10, contBlocks)
                expect(target.insertIndex).toBe(0)
                expect(target.insertBeforeId).toBe('A')
            })

            it('inserts after A if past midpoint of A but before B', () => {
                // A mid 50. B (100-300) mid 200.
                const target = getReorderTarget(60, contBlocks)
                // 60 > 50 -> checked A. Next is B.
                // Wait, loop:
                // i=0 (A): mid=50. 60 < 50? No. RunningTime+=100.
                // i=1 (B): mid=100 + 200/2 = 200. 60 < 200? Yes.
                // So inserts at index 1 (before B).
                expect(target.insertIndex).toBe(1)
                expect(target.insertBeforeId).toBe('B')
            })

            it('appends to end if past all midpoints', () => {
                const target = getReorderTarget(999, contBlocks)
                expect(target.insertIndex).toBe(3)
                expect(target.insertBeforeId).toBeNull()
            })
        })

        describe('computeContiguousSnapPositions', () => {
            it('returns accumulated durations starting at 0', () => {
                const snaps = computeContiguousSnapPositions(contBlocks)
                // 0, 100, 100+200=300, 300+300=600
                expect(snaps).toEqual([0, 100, 300, 600])
            })

            it('excludes ignored block', () => {
                const snaps = computeContiguousSnapPositions(contBlocks, 'B')
                // A(100), C(300)
                // 0, 100, 400
                expect(snaps).toEqual([0, 100, 400])
            })
        })

        describe('findNearestContiguousSnap', () => {
            it('snaps to nearest point', () => {
                const snaps = [0, 100, 300, 600]
                const { position } = findNearestContiguousSnap(290, snaps)
                expect(position).toBe(300)
            })
        })

        describe('computeContiguousPreview', () => {
            it('calculates new start times for preview', () => {
                // Insert new item D(50ms) before B (index 1)
                // A(100), D(50), B(200), C(300)
                // A: 0
                // D: 100 (inserted)
                // B: 150
                // C: 350

                // Target time 120 (between 50 and 200 -> index 1)
                const result = computeContiguousPreview(contBlocks, 120, 50, 'new')

                expect(result.insertIndex).toBe(1)
                expect(result.insertTime).toBe(100)

                expect(result.startTimes['A']).toBe(0)
                expect(result.startTimes['B']).toBe(150)
                expect(result.startTimes['C']).toBe(350)
            })

            it('handles reordering existing item', () => {
                // Move B to end. Exclude B from blocks passed to layout.
                // A(100), C(300) -> Midpoints: A(50), C(100 + 150 = 250).
                // If we drag to 999, it goes to end.
                // A, C using existing blocks logic.

                const result = computeContiguousPreview(contBlocks, 999, 200, 'B')

                // Ordered excluding B: A, C.
                // Insert at end -> index 2.

                expect(result.insertIndex).toBe(2)
                // A starts 0. C starts 100.
                // A(100) -> ends 100. C(300) -> ends 400.
                // Insert at 400.
                expect(result.insertTime).toBe(400)

                expect(result.startTimes['A']).toBe(0)
                expect(result.startTimes['C']).toBe(100)
            })
        })
    })
})
