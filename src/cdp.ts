/**
 * Lightweight Chrome DevTools Protocol client.
 *
 * Uses a raw WebSocket to communicate with a Chrome/Brave tab.
 * No Puppeteer, no automation flags, no bot-detection footprint.
 */
import WebSocket from 'ws';

interface PendingCommand {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class CDPClient {
  private ws: WebSocket;
  private nextId = 0;
  private pending = new Map<number, PendingCommand>();
  private eventHandlers = new Map<string, ((params: any) => void)[]>();

  private constructor(ws: WebSocket) {
    this.ws = ws;

    ws.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());

      // Response to a command we sent
      if ('id' in msg) {
        const cb = this.pending.get(msg.id);
        if (cb) {
          if (cb.timer) clearTimeout(cb.timer);
          this.pending.delete(msg.id);
          if (msg.error) {
            cb.reject(new Error(msg.error.message));
          } else {
            cb.resolve(msg.result);
          }
        }
        return;
      }

      // Event from the browser
      if ('method' in msg) {
        const handlers = this.eventHandlers.get(msg.method);
        handlers?.forEach((fn) => fn(msg.params));
      }
    });

    ws.on('close', () => {
      this.pending.forEach((cb) => cb.reject(new Error('WebSocket closed')));
      this.pending.clear();
    });
  }

  /**
   * Open a CDP WebSocket connection to a browser tab.
   */
  static connect(wsUrl: string, timeoutMs = 10_000): Promise<CDPClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`CDP connection timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      ws.once('open', () => {
        clearTimeout(timer);
        resolve(new CDPClient(ws));
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Send a CDP command and wait for the response.
   */
  send(
    method: string,
    params: Record<string, any> = {},
    timeoutMs = 60_000,
  ): Promise<any> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Subscribe to a CDP event.
   */
  on(event: string, handler: (params: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Wait for a single occurrence of an event.
   */
  once(event: string, timeoutMs = 30_000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeoutMs);

      const handler = (params: any) => {
        clearTimeout(timer);
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
          const idx = handlers.indexOf(handler);
          if (idx >= 0) handlers.splice(idx, 1);
        }
        resolve(params);
      };
      this.on(event, handler);
    });
  }

  /**
   * Evaluate a JavaScript expression in the page context.
   *
   * This is the core of the approach: the code runs as if it were
   * the page's own JavaScript — all cookies, sessions, and DataDome
   * tokens are available. DataDome cannot distinguish this from
   * leboncoin's own frontend code.
   */
  async evaluate<T = any>(expression: string, awaitPromise = true): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });

    if (result.exceptionDetails) {
      const desc =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'Evaluation failed';
      throw new Error(desc);
    }

    return result.result?.value as T;
  }

  /**
   * Disconnect from the browser tab (does NOT close the browser).
   */
  disconnect(): void {
    this.pending.forEach((cb) => {
      if (cb.timer) clearTimeout(cb.timer);
      cb.reject(new Error('Disconnected'));
    });
    this.pending.clear();
    this.ws.close();
  }
}
