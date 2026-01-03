/**
 * Format milliseconds to timecode string (MM:SS:FF)
 */
export const formatTimecode = (ms: number, fps: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const frames = Math.floor((ms % 1000) / 1000 * fps);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
};

/**
 * Format milliseconds to mm:ss or hh:mm:ss
 */
export const formatTime = (ms: number, padMinutes = false): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    const displaySeconds = seconds % 60;
    const displayMinutes = minutes % 60;

    if (hours > 0) {
        return `${hours}:${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
    }

    const minStr = padMinutes ? displayMinutes.toString().padStart(2, '0') : displayMinutes.toString();
    return `${minStr}:${displaySeconds.toString().padStart(2, '0')}`;
};
