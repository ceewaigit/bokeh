/**
 * Worker Allocation - Simplified
 * 
 * Determines optimal worker count and resource allocation for parallel export.
 * Consolidated from previous 4 overlapping functions into 2 focused ones.
 */

import type { MachineProfile } from '../utils/machine-profiler'
import type { WorkerAllocation } from './types'

// ============================================
// Configuration Constants
// ============================================

const MIN_DURATION_FOR_PARALLEL_SECONDS = 15;
const MIN_MEMORY_FOR_PARALLEL_GB = 2;
const MIN_TOTAL_MEMORY_FOR_PARALLEL_GB = 12;
const MIN_CORES_FOR_PARALLEL = 4;
const MAX_CONCURRENCY = 10;
const MIN_TIMEOUT_MS = 60 * 60 * 1000;        // 60 minutes
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;   // 24 hours

// ============================================
// Main Export Strategy Function
// ============================================

export interface ExportContext {
  chunkCount: number;
  totalFrames: number;
  fps: number;
  effectiveMemoryGB: number;
  videoSizeEstimateGB?: number;
}

/**
 * Calculate complete export strategy in one pass.
 * Combines worker count, concurrency, and timeout decisions.
 */
export function getExportStrategy(
  profile: MachineProfile,
  context: ExportContext
): WorkerAllocation {
  const { chunkCount, totalFrames, fps, effectiveMemoryGB } = context;

  const cpuCores = Math.max(1, profile.cpuCores || 1);
  const totalMemGB = profile.totalMemoryGB || 4;
  const rawAvailableGB = profile.availableMemoryGB ?? 0;
  const safeFps = Math.max(1, fps || 30);
  const durationSeconds = Math.max(0, totalFrames / safeFps);

  // Effective memory: use raw available or derive from total
  const safeMemoryGB = Math.max(0.5, effectiveMemoryGB || rawAvailableGB || totalMemGB * 0.4);

  // ---- Worker Count Decision ----
  let workerCount = 1;
  const hasParallelHeadroom =
    totalMemGB >= MIN_TOTAL_MEMORY_FOR_PARALLEL_GB &&
    rawAvailableGB >= MIN_MEMORY_FOR_PARALLEL_GB &&
    cpuCores >= MIN_CORES_FOR_PARALLEL;

  const useParallel =
    chunkCount > 1 &&
    durationSeconds >= MIN_DURATION_FOR_PARALLEL_SECONDS &&
    hasParallelHeadroom;

  if (useParallel) {
    // Base worker count on CPU cores (use 80% of cores, leave 1 for system)
    const cpuBasedWorkers = Math.max(1, Math.floor(cpuCores * 0.8), cpuCores - 1);
    // Memory constraint: each worker needs ~1GB
    const memBasedWorkers = Math.floor(safeMemoryGB);

    workerCount = Math.min(cpuBasedWorkers, memBasedWorkers, chunkCount);

    // Cap based on available memory
    if (rawAvailableGB < 2) {
      workerCount = Math.min(workerCount, 2);
    } else if (rawAvailableGB < 3) {
      workerCount = Math.min(workerCount, 3);
    } else {
      workerCount = Math.min(workerCount, 4);
    }

    workerCount = Math.max(2, workerCount);
  }

  // ---- Concurrency Decision ----
  const cpuBasedConcurrency = Math.max(2, Math.floor(cpuCores * 0.7));
  const memBasedConcurrency = Math.max(2, Math.floor(safeMemoryGB / 1.2));
  let concurrency = Math.min(cpuBasedConcurrency, memBasedConcurrency, MAX_CONCURRENCY);

  // Memory-based throttling
  if (safeMemoryGB < 2) {
    concurrency = 1;
  } else if (safeMemoryGB < 3) {
    concurrency = Math.min(concurrency, 2);
  } else if (rawAvailableGB < 3) {
    concurrency = Math.min(concurrency, 3);
  }

  // Short exports can use higher concurrency
  if (durationSeconds < 60 && safeMemoryGB >= 3) {
    concurrency = Math.min(concurrency + 2, MAX_CONCURRENCY);
  }

  // When using parallel workers, keep per-worker concurrency modest
  if (useParallel && workerCount > 1) {
    concurrency = Math.min(concurrency, 3);
  }

  // ---- Timeout Calculation ----
  const baseSeconds = totalFrames / safeFps;
  const chunkPressure = Math.max(1, chunkCount / Math.max(1, workerCount));
  const safetyMultiplier = Math.min(100, Math.max(50, chunkPressure * 4));
  const estimatedSeconds = baseSeconds * safetyMultiplier;
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(estimatedSeconds * 1000)));

  // ---- Memory per Worker ----
  const memoryBudgetGB = Math.max(safeMemoryGB, totalMemGB * 0.4);
  const memoryPerWorkerMB = Math.max(512, Math.min(2048,
    Math.floor((memoryBudgetGB * 1024) / Math.max(1, workerCount * 3))
  ));

  console.log('[Export] Strategy', {
    workerCount,
    concurrency,
    useParallel,
    durationSeconds: durationSeconds.toFixed(1),
    cpuCores,
    effectiveMemoryGB: safeMemoryGB.toFixed(2),
    chunkCount
  });

  return {
    workerCount,
    concurrency,
    useParallel,
    memoryPerWorkerMB,
    timeoutMs
  };
}
