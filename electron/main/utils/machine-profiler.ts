/**
 * Machine Profiler
 * Returns conservative, stable settings without complex benchmarking
 */

import os from 'os';
import { execSync } from 'child_process';

export interface MachineProfile {
  cpuCores: number;
  totalMemoryGB: number;
  availableMemoryGB: number;
  rawAvailableMemoryGB: number;
  gpuAvailable: boolean;
  memoryPressure: string;
  thermalPressure: string;
}

export interface DynamicExportSettings {
  concurrency: number;
  jpegQuality: number;
  videoBitrate: string;
  x264Preset: import('@remotion/renderer/dist/options/x264-preset').X264Preset;
  useGPU: boolean;
  offthreadVideoCacheSizeInBytes: number;
  enableAdaptiveOptimization: boolean;
}

export class MachineProfiler {
  /**
   * Get basic system info without complex benchmarking
   */
  async profileSystem(_videoWidth: number, _videoHeight: number): Promise<MachineProfile> {
    const cpuCores = os.cpus().length;
    const totalBytes = os.totalmem();
    const rawAvailableBytes = os.freemem();
    const totalMemoryGB = totalBytes / (1024 * 1024 * 1024);
    const rawAvailableMemoryGB = rawAvailableBytes / (1024 * 1024 * 1024);

    const { normalizedBytes } = normalizeAvailableMemory(rawAvailableBytes, totalBytes);
    const availableMemoryGB = normalizedBytes / (1024 * 1024 * 1024);

    // Simple GPU detection - assume available on modern systems
    const gpuAvailable = process.platform === 'darwin' || process.platform === 'win32';

    return {
      cpuCores,
      totalMemoryGB,
      availableMemoryGB,
      rawAvailableMemoryGB,
      gpuAvailable,
      memoryPressure: 'normal',
      thermalPressure: 'normal'
    };
  }

  /**
   * Get export settings based on quality preference
   * No complex adaptive optimization - just stable, predictable settings
   */
  getDynamicExportSettings(
    profile: MachineProfile,
    videoWidth: number,
    videoHeight: number,
    quality: 'fast' | 'balanced' | 'quality'
  ): DynamicExportSettings {
    // Always use conservative settings for stability
    const cpuCores = Math.max(1, profile.cpuCores || 1);
    const rawAvailable = profile.availableMemoryGB ?? 0;
    const totalMemory = profile.totalMemoryGB || 4;
    const effectiveMemory = Math.max(rawAvailable, totalMemory * 0.3);

    // Increased concurrency limits for better CPU utilization on modern machines
    // PERF: Raised from cpuCores*0.6 to cpuCores*0.75 and max 8 to max 10
    const cpuBasedConcurrency = Math.max(2, Math.floor(cpuCores * 0.75));
    const memoryBasedConcurrency = Math.max(2, Math.floor(effectiveMemory / 1.0));
    const baseConcurrency = Math.max(2, Math.min(cpuBasedConcurrency, memoryBasedConcurrency, 10));

    const settings: DynamicExportSettings = {
      concurrency: baseConcurrency,
      jpegQuality: 85,
      videoBitrate: '8M', // Balanced bitrate
      x264Preset: 'veryfast', // Prioritize speed over compression
      useGPU: profile.gpuAvailable,
      offthreadVideoCacheSizeInBytes: 128 * 1024 * 1024, // Will be overridden in export-handler
      enableAdaptiveOptimization: false
    };

    // Adjust based on quality preference
    switch (quality) {
      case 'quality':
        settings.jpegQuality = 90; // High quality for sharp text/UI
        settings.videoBitrate = '12M'; // High bitrate
        settings.x264Preset = 'fast'; // Good balance
        settings.offthreadVideoCacheSizeInBytes = 256 * 1024 * 1024; // Will be overridden
        break;

      case 'fast':
        settings.jpegQuality = 65; // Lower quality for maximum speed
        settings.videoBitrate = '5M'; // Lower bitrate for speed
        settings.x264Preset = 'ultrafast'; // Maximum speed
        settings.concurrency = Math.min(settings.concurrency, 4); // Allow more concurrency in fast mode
        settings.offthreadVideoCacheSizeInBytes = 64 * 1024 * 1024; // 64MB for fast mode
        break;

      case 'balanced':
      default:
        // Use defaults
        break;
    }

    // Adjust for 4K
    if (videoWidth >= 3840) {
      settings.videoBitrate = quality === 'quality' ? '20M' : '15M';
    }

    return settings;
  }

  /**
   * Calculate memory constraints for export operations.
   * Consolidates logic previously scattered in export handler.
   */
  getExportMemoryConstraints(profile: MachineProfile): {
    effectiveMemoryGB: number;
    videoCacheSizeBytes: number;
    forceSequentialThreshold: {
      shouldForceSequential: (durationSec: number, megapixels: number, isHighFps: boolean) => boolean
    };
  } {
    const totalMemoryGB = profile.totalMemoryGB || 16;
    const reportedAvailableGB = profile.availableMemoryGB ?? 0;

    // macOS frequently reports low "available" memory even when plenty is free
    const baselineFromTotal = totalMemoryGB * 0.4;
    const minimumOperationalGB = 2;
    const effectiveMemoryGB = Math.min(
      totalMemoryGB,
      Math.max(reportedAvailableGB, baselineFromTotal, minimumOperationalGB)
    );

    // Calculate video cache size based on effective memory
    let videoCacheSizeBytes: number;
    if (effectiveMemoryGB < 2) {
      videoCacheSizeBytes = 128 * 1024 * 1024;
    } else if (effectiveMemoryGB < 4) {
      videoCacheSizeBytes = 256 * 1024 * 1024;
    } else if (effectiveMemoryGB < 8) {
      videoCacheSizeBytes = 512 * 1024 * 1024;
    } else {
      videoCacheSizeBytes = 1024 * 1024 * 1024;
    }

    // Force sequential only for 4K+ OUTPUT (not source resolution) on low-memory machines
    const shouldForceSequential = (durationSec: number, megapixels: number, isHighFps: boolean): boolean => {
      // Allow parallel on machines with 12GB+ total (was 16GB)
      if (totalMemoryGB > 12) return false;
      if (durationSec < 30) return false;
      // Only force sequential for 4K+ OUTPUT AND high FPS
      const is4KOutput = megapixels > 8.3;
      return is4KOutput && isHighFps;
    };

    return {
      effectiveMemoryGB,
      videoCacheSizeBytes,
      forceSequentialThreshold: { shouldForceSequential }
    };
  }
}

// Export singleton instance
export const machineProfiler = new MachineProfiler();

const GB_IN_BYTES = 1024 * 1024 * 1024;

interface NormalizedMemoryResult {
  normalizedBytes: number;
}

const normalizeAvailableMemory = (rawBytes: number, totalBytes: number): NormalizedMemoryResult => {
  let normalizedBytes = Math.max(0, rawBytes);

  if (totalBytes <= 0) {
    return { normalizedBytes };
  }

  if (process.platform === 'darwin') {
    const vmStatBytes = getDarwinAvailableMemoryBytes();
    if (typeof vmStatBytes === 'number' && vmStatBytes > 0) {
      normalizedBytes = Math.max(normalizedBytes, vmStatBytes);
    }

    const minimumReserve = Math.max(totalBytes * 0.15, 1.5 * GB_IN_BYTES);
    if (normalizedBytes < minimumReserve) {
      normalizedBytes = Math.min(totalBytes, minimumReserve);
    }
  } else {
    const minimumReserve = Math.max(totalBytes * 0.1, 0.75 * GB_IN_BYTES);
    if (normalizedBytes < minimumReserve) {
      normalizedBytes = Math.min(totalBytes, minimumReserve);
    }
  }

  normalizedBytes = Math.min(Math.max(normalizedBytes, rawBytes), totalBytes);

  return { normalizedBytes };
};

const getDarwinAvailableMemoryBytes = (): number | null => {
  try {
    const output = execSync('vm_stat', { encoding: 'utf8' });
    const pageSizeMatch = output.match(/page size of (\d+) bytes/);
    const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;

    const readValue = (label: string): number => {
      const regex = new RegExp(`${label}:\\s+(\\d+)\\.`);
      const match = output.match(regex);
      return match ? parseInt(match[1], 10) : 0;
    };

    const pagesFree = readValue('Pages free');
    const pagesInactive = readValue('Pages inactive');
    const pagesSpeculative = readValue('Pages speculative');
    const pagesPurgeable = readValue('Pages purgeable');

    const availablePages = pagesFree + pagesInactive + pagesSpeculative + pagesPurgeable;
    return availablePages * pageSize;
  } catch {
    return null;
  }
};
