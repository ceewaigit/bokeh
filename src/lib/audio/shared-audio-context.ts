/**
 * Shared AudioContext manager to prevent memory leaks and OOM errors.
 * Browsers have a limit on the number of active AudioContexts (usually 6).
 * Creating a new context for every clip causes rapid memory churn and eventually crashes.
 */

let sharedContext: AudioContext | null = null;
let sharedContextFailed = false;

const markContextFailed = (reason: string, error?: unknown) => {
    if (sharedContextFailed) return;
    sharedContextFailed = true;
    console.warn('[SharedAudioContext] Disabled shared AudioContext:', reason, error ?? '');
};

const attachStateListener = (context: AudioContext) => {
    context.onstatechange = () => {
        if (context.state === 'closed') {
            markContextFailed('AudioContext closed');
        }
    };
};

export const getSharedAudioContext = (): AudioContext | null => {
    if (sharedContextFailed) return null;

    if (!sharedContext) {
        try {
            const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
            sharedContext = new AudioContextClass({
                latencyHint: 'playback',
                sampleRate: 48000  // Explicit sample rate for consistency with video standard
            });
            attachStateListener(sharedContext);
            console.log('[SharedAudioContext] Created new global AudioContext with playback latency hint', {
                sampleRate: sharedContext.sampleRate,
                state: sharedContext.state
            });
        } catch (error) {
            markContextFailed('Failed to create AudioContext', error);
            return null;
        }
    }

    if (sharedContext.state === 'suspended') {
        sharedContext.resume().catch(e => {
            markContextFailed('Failed to resume AudioContext', e);
        });
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
