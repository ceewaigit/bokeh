/**
 * Base class for worker processes with utility process IPC
 * Handles the worker side of the IPC pattern
 */

export abstract class BaseWorker {
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupIPC();
  }

  /**
   * Setup IPC with parent process
   */
  private setupIPC(): void {
    // Handle messages from utility process parent
    process.parentPort?.on('message', async (e: Electron.MessageEvent) => {
      const message = e.data;
      
      if (message.type === 'init') {
        this.initialize();
        return;
      }

      await this.handleMessage(message);
    });
  }

  /**
   * Initialize the worker
   */
  private initialize(): void {
    // Send ready signal
    this.send('ready', null);
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Initialize the worker
    this.onInit();
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(message: any): Promise<void> {
    try {
      // Handle different message types
      switch (message.type) {
        case 'request':
          await this.handleRequest(message);
          break;
        
        case 'message':
          await this.handleOneWayMessage(message);
          break;
        
        case 'heartbeat-ping':
          this.sendHeartbeat();
          break;
        
        case 'shutdown':
          await this.handleShutdown();
          break;
        
        default:
          console.warn(`[Worker] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[Worker] Error handling message:`, error);
      
      if (message.id) {
        process.parentPort?.postMessage({
          id: message.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Handle request/response pattern
   */
  private async handleRequest(message: any): Promise<void> {
    const { id, method, data } = message;
    
    try {
      const result = await this.onRequest(method, data);
      
      process.parentPort?.postMessage({
        id,
        data: result
      });
    } catch (error) {
      process.parentPort?.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle one-way messages
   */
  private async handleOneWayMessage(message: any): Promise<void> {
    const { method, data } = message;
    await this.onMessage(method, data);
  }

  /**
   * Send heartbeat to parent
   */
  private sendHeartbeat(): void {
    process.parentPort?.postMessage({ type: 'heartbeat' });
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 3000);
  }

  /**
   * Handle shutdown request
   */
  private async handleShutdown(): Promise<void> {
    console.log('[Worker] Shutting down...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    await this.onShutdown();
    
    process.exit(0);
  }

  /**
   * Send a message to parent
   */
  protected send(type: string, data: any): void {
    process.parentPort?.postMessage({ type, data });
  }

  /**
   * Override in subclass - called when worker is initialized
   */
  protected abstract onInit(): void;

  /**
   * Override in subclass - handle request/response pattern
   */
  protected abstract onRequest(method: string, data: any): Promise<any>;

  /**
   * Override in subclass - handle one-way messages
   */
  protected abstract onMessage(method: string, data: any): Promise<void>;

  /**
   * Override in subclass - cleanup before shutdown
   */
  protected abstract onShutdown(): Promise<void>;
}