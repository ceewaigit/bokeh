/**
 * Robust worker process management with supervision
 * Uses utility process IPC for reliable communication
 */

import { utilityProcess } from 'electron';
import { EventEmitter } from 'events';

export interface WorkerOptions {
  serviceName: string;
  maxMemory?: number; // MB
  enableHeartbeat?: boolean;
  heartbeatInterval?: number; // ms
  maxRestarts?: number;
}

export interface WorkerMessage {
  id: string;
  type: string;
  data: any;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
}

export class SupervisedWorker extends EventEmitter {
  private worker: Electron.UtilityProcess | null = null;
  private options: Required<WorkerOptions>;
  private restartCount = 0;
  private isShuttingDown = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat: number = Date.now();
  private messageId = 0;

  constructor(
    private workerPath: string,
    options: WorkerOptions
  ) {
    super();
    this.options = {
      serviceName: options.serviceName,
      maxMemory: options.maxMemory || 3072,
      enableHeartbeat: options.enableHeartbeat ?? true,
      heartbeatInterval: options.heartbeatInterval || 5000,
      maxRestarts: options.maxRestarts || 3
    };
  }

  /**
   * Start the worker process
   */
  async start(): Promise<void> {
    if (this.worker) {
      throw new Error('Worker already started');
    }

    try {
      // Start utility process
      this.worker = utilityProcess.fork(this.workerPath, [], {
        serviceName: this.options.serviceName,
        execArgv: [`--max-old-space-size=${this.options.maxMemory}`]
      });

      // Set up message handling
      this.worker.on('message', (message: any) => {
        this.handleMessage(message);
      });

      // Set up worker lifecycle handlers
      this.worker.on('spawn', () => {
        console.log(`[WorkerManager] ${this.options.serviceName} spawned`);
        this.emit('spawn');
        this.startHeartbeat();
      });

      this.worker.on('exit', (code) => {
        console.log(`[WorkerManager] ${this.options.serviceName} exited with code ${code}`);
        this.handleWorkerExit(code);
      });

      // Send init message
      this.worker.postMessage({ type: 'init' });

      // Wait for worker ready signal
      await this.waitForReady();
      
    } catch (error) {
      console.error(`[WorkerManager] Failed to start worker: ${error}`);
      throw error;
    }
  }

  /**
   * Send a request to the worker and wait for response
   */
  async request<T = any>(type: string, data: any, timeoutMs = 30000): Promise<T> {
    if (!this.worker) {
      throw new Error('Worker not started');
    }

    const id = `req-${++this.messageId}`;
    
    return new Promise<T>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${type}`));
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send request
      this.worker!.postMessage({
        id,
        type: 'request',
        method: type,
        data
      });
    });
  }

  /**
   * Send a one-way message to the worker
   */
  send(type: string, data: any): void {
    if (!this.worker) {
      throw new Error('Worker not started');
    }

    this.worker.postMessage({
      type: 'message',
      method: type,
      data
    });
  }

  /**
   * Gracefully shutdown the worker
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopHeartbeat();

    if (this.worker) {
      try {
        // Send shutdown signal
        this.worker.postMessage({ type: 'shutdown' });

        // Give worker time to cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Best-effort kill; utility process may already be gone.
        this.worker.kill();
      } catch {
        // Ignore shutdown errors; callers may still want the pool entry removed.
      } finally {
        this.worker = null;
      }
    }

    // Clear pending requests
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Worker shutdown'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Handle messages from the worker
   */
  private handleMessage(message: any): void {
    // Handle responses to requests
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.data);
      }
      return;
    }

    // Handle heartbeat
    if (message.type === 'heartbeat') {
      this.lastHeartbeat = Date.now();
      return;
    }

    // Handle other messages
    this.emit('message', message);
  }

  /**
   * Wait for worker ready signal
   */
  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker failed to become ready'));
      }, 10000);

      const handler = (message: any) => {
        if (message.type === 'ready') {
          clearTimeout(timeout);
          this.worker!.off('message', handler);
          resolve();
        }
      };

      this.worker!.on('message', handler);
    });
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    if (!this.options.enableHeartbeat) return;

    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();

    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeat;
      
      if (elapsed > this.options.heartbeatInterval * 2) {
        console.error(`[WorkerManager] ${this.options.serviceName} heartbeat timeout`);
        this.handleWorkerCrash();
      } else {
        // Send heartbeat ping
        this.worker?.postMessage({ type: 'heartbeat-ping' });
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Handle worker exit
   */
  private handleWorkerExit(code: number): void {
    this.stopHeartbeat();
    this.worker = null;

    if (this.isShuttingDown) {
      return;
    }

    if (code !== 0) {
      this.handleWorkerCrash();
    }
  }

  /**
   * Handle worker crash with automatic restart
   */
  private async handleWorkerCrash(): Promise<void> {
    console.error(`[WorkerManager] ${this.options.serviceName} crashed`);
    
    // Clear pending requests
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Worker crashed'));
    }
    this.pendingRequests.clear();

    // Attempt restart if under limit
    if (this.restartCount < this.options.maxRestarts) {
      this.restartCount++;
      console.log(`[WorkerManager] Restarting ${this.options.serviceName} (attempt ${this.restartCount})`);
      
      try {
        await this.start();
        this.emit('restart', this.restartCount);
      } catch (error) {
        console.error(`[WorkerManager] Failed to restart: ${error}`);
        this.emit('error', error);
      }
    } else {
      console.error(`[WorkerManager] Max restarts reached for ${this.options.serviceName}`);
      this.emit('fatal', new Error('Max restarts exceeded'));
    }
  }
}

/**
 * Worker pool for managing multiple workers
 */
export class WorkerPool {
  private workers = new Map<string, SupervisedWorker>();

  /**
   * Create and start a new worker
   */
  async createWorker(
    name: string,
    workerPath: string,
    options: WorkerOptions
  ): Promise<SupervisedWorker> {
    if (this.workers.has(name)) {
      throw new Error(`Worker ${name} already exists`);
    }

    const worker = new SupervisedWorker(workerPath, options);
    await worker.start();
    
    this.workers.set(name, worker);
    return worker;
  }

  /**
   * Get an existing worker
   */
  getWorker(name: string): SupervisedWorker | undefined {
    return this.workers.get(name);
  }

  /**
   * Destroy and remove a worker from the pool
   */
  async destroyWorker(name: string): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker) return;

    try {
      await worker.shutdown();
    } finally {
      // Always remove the entry so callers can recreate workers even if shutdown throws.
      this.workers.delete(name);
    }
  }

  /**
   * Shutdown all workers
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.workers.values()).map(
      worker => worker.shutdown()
    );
    await Promise.all(shutdownPromises);
    this.workers.clear();
  }
}

// Global worker pool instance
export const workerPool = new WorkerPool();
