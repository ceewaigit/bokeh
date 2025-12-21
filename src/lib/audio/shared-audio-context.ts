/**
 * Shared AudioContext manager to prevent memory leaks and OOM errors.
 * Browsers have a limit on the number of active AudioContexts (usually 6).
 * Creating a new context for every clip causes rapid memory churn and eventually crashes.
 */

let sharedContext: AudioContext | null = null;

export const getSharedAudioContext = (): AudioContext => {
    if (!sharedContext) {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        sharedContext = new AudioContextClass({
            latencyHint: 'playback',
            sampleRate: 48000  // Explicit sample rate for consistency with video standard
        });
        console.log('[SharedAudioContext] Created new global AudioContext with playback latency hint', {
            sampleRate: sharedContext.sampleRate,
            state: sharedContext.state
        });
    }

    if (sharedContext.state === 'suspended') {
        sharedContext.resume().catch(e => console.warn('[SharedAudioContext] Failed to resume:', e));
    }

    return sharedContext;
};

export const closeSharedAudioContext = async () => {
    if (sharedContext && sharedContext.state !== 'closed') {
        await sharedContext.close();
        sharedContext = null;
        console.log('[SharedAudioContext] Closed global AudioContext');
    }
};
