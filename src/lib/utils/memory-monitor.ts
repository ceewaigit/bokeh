/**
 * Memory monitoring utilities for preventing OOM during export
 */

export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private memoryThreshold = 0.8; // 80% heap usage threshold
  private checkInterval: NodeJS.Timeout | null = null;
  private onHighMemory?: () => void;

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Get current memory metrics
   */
  getMemoryStats() {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        pressure: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
        usedMB: Math.round(memory.usedJSHeapSize / (1024 * 1024)),
        limitMB: Math.round(memory.jsHeapSizeLimit / (1024 * 1024)),
        percentUsed: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1)
      };
    }

    // Fallback for non-browser environments
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        usedJSHeapSize: usage.heapUsed,
        totalJSHeapSize: usage.heapTotal,
        jsHeapSizeLimit: usage.heapTotal, // Approximate
        pressure: usage.heapUsed / usage.heapTotal,
        usedMB: Math.round(usage.heapUsed / (1024 * 1024)),
        limitMB: Math.round(usage.heapTotal / (1024 * 1024)),
        percentUsed: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(1)
      };
    }

    return null;
  }

  /**
   * Check if memory pressure is high
   */
  isMemoryHigh(): boolean {
    const stats = this.getMemoryStats();
    return stats ? stats.pressure > this.memoryThreshold : false;
  }

  /**
   * Start monitoring memory with a callback for high memory
   */
  startMonitoring(intervalMs = 5000, onHighMemory?: () => void) {
    this.stopMonitoring();
    this.onHighMemory = onHighMemory;

    this.checkInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      if (stats) {
        // Log if memory is getting high
        if (stats.pressure > 0.7) {
          console.warn(
            `[MemoryMonitor] High memory usage: ${stats.usedMB}MB / ${stats.limitMB}MB (${stats.percentUsed}%)`
          );
        }

        // Trigger callback if over threshold
        if (stats.pressure > this.memoryThreshold && this.onHighMemory) {
          console.error(
            `[MemoryMonitor] CRITICAL: Memory threshold exceeded! ${stats.percentUsed}% used`
          );
          this.onHighMemory();
        }
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Wait for memory to drop below threshold
   */
  async waitForMemoryRecovery(maxWaitMs = 10000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const stats = this.getMemoryStats();
      if (!stats || stats.pressure < this.memoryThreshold) {
        return true;
      }

      // Force GC if available
      if (typeof global !== 'undefined' && (global as any).gc) {
        (global as any).gc();
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return false;
  }

  /**
   * Get a formatted memory report
   */
  getMemoryReport(): string {
    const stats = this.getMemoryStats();
    if (!stats) return 'Memory stats unavailable';

    return [
      `Memory Usage: ${stats.usedMB}MB / ${stats.limitMB}MB`,
      `Heap Usage: ${stats.percentUsed}%`,
      `Pressure: ${(stats.pressure * 100).toFixed(1)}%`,
      stats.pressure > this.memoryThreshold ? '⚠️ HIGH MEMORY PRESSURE' : '✅ Memory OK'
    ].join('\n');
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();