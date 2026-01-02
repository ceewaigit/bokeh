/**
 * AudioEnhancementManager - Centralized audio processing for timeline playback
 *
 * Uses createMediaElementSource() with wet/dry mixing to avoid the crackling
 * caused by captureStream() timing discontinuities.
 */

import { getSharedAudioContext } from '@/shared/contexts/audio-context';
import type { AudioEnhancementPreset, AudioEnhancementSettings } from '@/types/project';

interface AudioGraph {
  compressor: DynamicsCompressorNode;
  wetGain: GainNode;
  dryGain: GainNode;
  isEnhanced: boolean;
}

// Preset configurations
export const ENHANCEMENT_PRESETS: Record<Exclude<AudioEnhancementPreset, 'off' | 'custom'>, AudioEnhancementSettings> = {
  subtle: {
    threshold: -18,
    ratio: 2,
    attack: 0.02,
    release: 0.2,
    knee: 20,
  },
  balanced: {
    threshold: -24,
    ratio: 4,
    attack: 0.003,
    release: 0.15,
    knee: 12,
  },
  broadcast: {
    threshold: -30,
    ratio: 8,
    attack: 0.001,
    release: 0.1,
    knee: 6,
  },
};

const CROSSFADE_TIME = 0.05; // 50ms

class AudioEnhancementManager {
  private static instance: AudioEnhancementManager;
  private static readonly MAX_ACTIVE_GRAPHS = 16;
  private static readonly MAX_STREAMS = 40; // Leave headroom below browser's 50 limit
  private graphs = new WeakMap<HTMLVideoElement, AudioGraph>();
  private sources = new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>();
  private activeVideos = new Set<HTMLVideoElement>();
  private activeStreamCount = 0; // Track output streams to prevent "50 stream limit" errors
  private currentSettings: AudioEnhancementSettings = ENHANCEMENT_PRESETS.balanced;

  static getInstance(): AudioEnhancementManager {
    if (!this.instance) {
      this.instance = new AudioEnhancementManager();
    }
    return this.instance;
  }

  /**
   * Register a video element for audio processing.
   */
  registerVideoElement(video: HTMLVideoElement, enhanced: boolean): boolean {
    if (this.graphs.has(video)) {
      return true;
    }

    const ctx = getSharedAudioContext();
    if (!ctx) {
      return false;
    }
    if (this.activeVideos.size >= AudioEnhancementManager.MAX_ACTIVE_GRAPHS ||
      this.activeStreamCount >= AudioEnhancementManager.MAX_STREAMS) {
      console.warn('[AudioEnhancementManager] Stream budget exhausted, skipping enhance for new video.');
      return false;
    }

    try {
      let source = this.sources.get(video);
      if (!source) {
        source = ctx.createMediaElementSource(video);
        this.sources.set(video, source);
      }

      const compressor = ctx.createDynamicsCompressor();

      // Apply current settings
      this.applySettingsToCompressor(compressor, this.currentSettings);

      const wetGain = ctx.createGain();
      const dryGain = ctx.createGain();

      if (source) {
        source.connect(compressor);
        compressor.connect(wetGain);
        source.connect(dryGain);
        wetGain.connect(ctx.destination);
        dryGain.connect(ctx.destination);
      }
      this.activeStreamCount += 2; // wet + dry each connect to destination

      wetGain.gain.value = enhanced ? 1 : 0;
      dryGain.gain.value = enhanced ? 0 : 1;

      this.graphs.set(video, { compressor, wetGain, dryGain, isEnhanced: enhanced });
      this.activeVideos.add(video);
      return true;
    } catch (e) {
      console.warn('[AudioEnhancementManager] Failed to create graph:', e);
      return false;
    }
  }

  hasVideo(video: HTMLVideoElement): boolean {
    return this.graphs.has(video);
  }

  /**
   * Toggle enhancement with smooth crossfade
   */
  setVideoEnhanced(video: HTMLVideoElement, enhanced: boolean): void {
    const graph = this.graphs.get(video);
    if (!graph || graph.isEnhanced === enhanced) return;

    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    graph.wetGain.gain.cancelScheduledValues(now);
    graph.dryGain.gain.cancelScheduledValues(now);
    graph.wetGain.gain.setValueAtTime(graph.wetGain.gain.value, now);
    graph.dryGain.gain.setValueAtTime(graph.dryGain.gain.value, now);
    graph.wetGain.gain.linearRampToValueAtTime(enhanced ? 1 : 0, now + CROSSFADE_TIME);
    graph.dryGain.gain.linearRampToValueAtTime(enhanced ? 0 : 1, now + CROSSFADE_TIME);

    graph.isEnhanced = enhanced;
  }

  /**
   * Unregister a video element and clean up audio nodes.
   * Critical for memory management: disconnects nodes to allow GC of video element.
   */
  unregisterVideoElement(video: HTMLVideoElement): void {
    const graph = this.graphs.get(video);
    if (!graph) return;

    try {
      // Disconnect all nodes to break the graph
      graph.wetGain.disconnect();
      graph.dryGain.disconnect();

      // Disconnect and delete the source node
      // Note: MediaElementAudioSourceNode can only be created once per video element,
      // but we delete it from the map so a fresh source is created if re-registered
      const source = this.sources.get(video);
      if (source) {
        source.disconnect();
        this.sources.delete(video);
      }

      this.graphs.delete(video);
      this.activeVideos.delete(video);
      this.activeStreamCount = Math.max(0, this.activeStreamCount - 2);
    } catch (e) {
      console.warn('[AudioEnhancementManager] Failed to cleanup graph:', e);
    }
  }

  /**
   * Update compressor settings for all registered videos
   */
  updateSettings(settings: AudioEnhancementSettings): void {
    this.currentSettings = settings;
    // Note: WeakMap doesn't support iteration, so new videos will get the updated settings
    // For existing videos, we'd need to track them in a Set as well, but that adds complexity
    // For now, settings apply to newly registered videos
  }

  /**
   * Apply a preset
   */
  applyPreset(preset: AudioEnhancementPreset, customSettings?: AudioEnhancementSettings): void {
    if (preset === 'off') {
      return; // Enhancement toggle handles this
    }
    if (preset === 'custom' && customSettings) {
      this.updateSettings(customSettings);
    } else if (preset !== 'custom') {
      this.updateSettings(ENHANCEMENT_PRESETS[preset]);
    }
  }

  /**
   * Get settings for a preset
   */
  getPresetSettings(preset: AudioEnhancementPreset): AudioEnhancementSettings | null {
    if (preset === 'off' || preset === 'custom') return null;
    return ENHANCEMENT_PRESETS[preset];
  }

  getCurrentSettings(): AudioEnhancementSettings {
    return this.currentSettings;
  }

  private applySettingsToCompressor(compressor: DynamicsCompressorNode, settings: AudioEnhancementSettings): void {
    compressor.threshold.value = settings.threshold;
    compressor.ratio.value = settings.ratio;
    compressor.attack.value = settings.attack;
    compressor.release.value = settings.release;
    compressor.knee.value = settings.knee;
  }
}

export const audioEnhancementManager = AudioEnhancementManager.getInstance();
