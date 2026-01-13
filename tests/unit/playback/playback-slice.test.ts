/**
 * Tests for Playback Slice
 *
 * Coverage:
 * - State transitions (play/pause)
 * - Seek clamping
 * - Zoom bounds
 * - Auto-zoom vs manual zoom
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock playbackService
jest.mock('@/features/playback/services/playback-service', () => ({
    playbackService: {
        play: jest.fn(),
        pause: jest.fn(),
        seek: jest.fn((time: number, duration: number) => {
            // Clamp to valid range
            return Math.max(0, Math.min(time, duration))
        })
    }
}))

import { createPlaybackSlice } from '@/features/core/stores/slices/playback-slice'

// Mock zustand set/get functions
type MockState = ReturnType<typeof createPlaybackSlice> & {
    currentProject?: {
        timeline: { duration: number }
    }
}

function createMockStore() {
    // Start with initial state
    const stateRef: { current: MockState } = {
        current: {
            currentTime: 0,
            isPlaying: false,
            isScrubbing: false,
            hoverTime: null,
            zoom: 0.5,
            zoomManuallyAdjusted: false,
            currentProject: {
                timeline: { duration: 10000 }
            }
        } as MockState
    }

    const set = (updater: ((s: MockState) => void) | Partial<MockState>) => {
        if (typeof updater === 'function') {
            // Immer-style mutation
            updater(stateRef.current)
        } else {
            // Object spread
            Object.assign(stateRef.current, updater)
        }
    }

    const get = () => stateRef.current

    // Initialize slice - this adds the action methods
    // StateCreator signature: (set, get, api) - api is the store API
    const mockApi = { setState: set, getState: get, subscribe: () => () => {} } as any
    const slice = createPlaybackSlice(set as any, get as any, mockApi)
    Object.assign(stateRef.current, slice)

    return {
        get state() { return stateRef.current },
        set state(val: MockState) { stateRef.current = val },
        set,
        get
    }
}

describe('Playback Slice', () => {
    let store: ReturnType<typeof createMockStore>

    beforeEach(() => {
        store = createMockStore()
        jest.clearAllMocks()
    })

    describe('Initial state', () => {
        it('has correct initial values', () => {
            expect(store.state.currentTime).toBe(0)
            expect(store.state.isPlaying).toBe(false)
            expect(store.state.isScrubbing).toBe(false)
            expect(store.state.hoverTime).toBeNull()
            expect(store.state.zoom).toBe(0.5)
            expect(store.state.zoomManuallyAdjusted).toBe(false)
        })
    })

    describe('play/pause', () => {
        it('play sets isPlaying to true', () => {
            store.state.play()

            expect(store.state.isPlaying).toBe(true)
        })

        it('play clears hoverTime', () => {
            store.state.hoverTime = 5000
            store.state.play()

            expect(store.state.hoverTime).toBeNull()
        })

        it('play does nothing without currentProject', () => {
            store.state.currentProject = undefined

            store.state.play()

            expect(store.state.isPlaying).toBe(false)
        })

        it('pause sets isPlaying to false', () => {
            store.state.isPlaying = true

            store.state.pause()

            expect(store.state.isPlaying).toBe(false)
        })
    })

    describe('seek', () => {
        it('seek updates currentTime', () => {
            store.state.seek(5000)

            expect(store.state.currentTime).toBe(5000)
        })

        it('seek clamps to valid range', () => {
            store.state.seek(15000) // Beyond duration

            // Clamped to slightly before end (duration - half frame at 30fps)
            // safeEndTime = 10000 - (1000/30) * 0.5 ≈ 9983.33
            expect(store.state.currentTime).toBeLessThan(10000)
            expect(store.state.currentTime).toBeGreaterThan(9980)
        })

        it('seek clamps negative values to 0', () => {
            store.state.seek(-1000)

            expect(store.state.currentTime).toBe(0)
        })

        it('seekFromPlayer updates currentTime', () => {
            store.state.seekFromPlayer(3000)

            expect(store.state.currentTime).toBe(3000)
        })
    })

    describe('scrubbing', () => {
        it('setScrubbing updates isScrubbing', () => {
            store.state.setScrubbing(true)
            expect(store.state.isScrubbing).toBe(true)

            store.state.setScrubbing(false)
            expect(store.state.isScrubbing).toBe(false)
        })
    })

    describe('hoverTime', () => {
        it('setHoverTime updates hoverTime', () => {
            store.state.setHoverTime(2500)

            expect(store.state.hoverTime).toBe(2500)
        })

        it('setHoverTime can be set to null', () => {
            store.state.hoverTime = 2500
            store.state.setHoverTime(null)

            expect(store.state.hoverTime).toBeNull()
        })
    })

    describe('zoom', () => {
        it('setZoom updates zoom value', () => {
            store.state.setZoom(2.0)

            expect(store.state.zoom).toBe(2.0)
        })

        it('setZoom clamps to minimum (0.1)', () => {
            store.state.setZoom(0.05)

            expect(store.state.zoom).toBe(0.1)
        })

        it('setZoom clamps to maximum (10)', () => {
            store.state.setZoom(15)

            expect(store.state.zoom).toBe(10)
        })

        it('setZoom marks as manually adjusted by default', () => {
            store.state.setZoom(2.0)

            expect(store.state.zoomManuallyAdjusted).toBe(true)
        })

        it('setZoom can skip manual flag', () => {
            store.state.setZoom(2.0, false)

            expect(store.state.zoomManuallyAdjusted).toBe(false)
        })
    })

    describe('auto zoom', () => {
        it('setAutoZoom updates zoom when not manually adjusted', () => {
            store.state.zoomManuallyAdjusted = false

            store.state.setAutoZoom(3.0)

            expect(store.state.zoom).toBe(3.0)
        })

        it('setAutoZoom is ignored when manually adjusted', () => {
            store.state.zoomManuallyAdjusted = true
            store.state.zoom = 2.0

            store.state.setAutoZoom(3.0)

            expect(store.state.zoom).toBe(2.0) // Unchanged
        })

        it('setAutoZoom clamps to valid range', () => {
            store.state.zoomManuallyAdjusted = false

            store.state.setAutoZoom(0.01)
            expect(store.state.zoom).toBe(0.1)

            store.state.setAutoZoom(100)
            expect(store.state.zoom).toBe(10)
        })
    })

    describe('state transitions', () => {
        it('play -> seek -> pause maintains correct state', () => {
            store.state.play()
            expect(store.state.isPlaying).toBe(true)

            store.state.seek(5000)
            expect(store.state.currentTime).toBe(5000)
            expect(store.state.isPlaying).toBe(true) // Still playing

            store.state.pause()
            expect(store.state.isPlaying).toBe(false)
            expect(store.state.currentTime).toBe(5000) // Time preserved
        })

        it('scrub during playback maintains state', () => {
            store.state.play()
            store.state.setScrubbing(true)

            expect(store.state.isPlaying).toBe(true)
            expect(store.state.isScrubbing).toBe(true)

            store.state.setScrubbing(false)

            expect(store.state.isPlaying).toBe(true)
            expect(store.state.isScrubbing).toBe(false)
        })
    })
})
