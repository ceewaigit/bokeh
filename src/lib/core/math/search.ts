/**
 * Binary search utilities - SSOT for all array search operations
 */

/**
 * Binary search for the largest index where the value is less than or equal to target.
 * Returns -1 if all values are greater than target.
 * 
 * @param arr Sorted array of numbers (ascending)
 * @param target Target value to search for
 * @returns Index of largest value <= target, or -1 if none exists
 */
export function binarySearchLE(arr: number[], target: number): number {
    if (arr.length === 0) return -1

    let lo = 0
    let hi = arr.length - 1
    let result = -1

    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (arr[mid] <= target) {
            result = mid
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }

    return result
}

/**
 * Binary search for the smallest index where the value is greater than or equal to target.
 * Returns arr.length if all values are less than target.
 * 
 * @param arr Sorted array of numbers (ascending)
 * @param target Target value to search for
 * @returns Index of smallest value >= target, or arr.length if none exists
 */
export function binarySearchGE(arr: number[], target: number): number {
    if (arr.length === 0) return 0

    let lo = 0
    let hi = arr.length - 1
    let result = arr.length

    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (arr[mid] >= target) {
            result = mid
            hi = mid - 1
        } else {
            lo = mid + 1
        }
    }

    return result
}

/**
 * Binary search for events with timestamp property.
 * Finds the largest index where event.timestamp <= target.
 * 
 * @param events Sorted array of objects with timestamp property (ascending by timestamp)
 * @param targetMs Target timestamp in milliseconds
 * @returns Index of largest event.timestamp <= target, or -1 if none exists
 */
export function binarySearchEvents<T extends { timestamp: number }>(
    events: T[],
    targetMs: number
): number {
    if (events.length === 0) return -1

    let lo = 0
    let hi = events.length - 1
    let result = -1

    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (events[mid].timestamp <= targetMs) {
            result = mid
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }

    return result
}
