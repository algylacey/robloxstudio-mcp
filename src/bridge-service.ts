import { v4 as uuidv4 } from 'uuid';

interface PendingRequest {
  id: string;
  endpoint: string;
  data: any;
  timestamp: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  dispatched: boolean;
  dispatchedAt: number;
}

export class BridgeService {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestTimeout = 60000;
  private dispatchStaleTimeout = 45000;

  async sendRequest(endpoint: string, data: any): Promise<any> {
    const requestId = uuidv4();

    return new Promise((resolve, reject) => {

      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, this.requestTimeout);

      const request: PendingRequest = {
        id: requestId,
        endpoint,
        data,
        timestamp: Date.now(),
        resolve,
        reject,
        timeoutId,
        dispatched: false,
        dispatchedAt: 0
      };

      this.pendingRequests.set(requestId, request);
    });
  }

  getPendingRequest(): { requestId: string; request: { endpoint: string; data: any } } | null {

    let oldestRequest: PendingRequest | null = null;
    const now = Date.now();

    for (const request of this.pendingRequests.values()) {
      if (request.dispatched) {
        if (now - request.dispatchedAt > this.dispatchStaleTimeout) {
          request.dispatched = false;
          request.dispatchedAt = 0;
        } else {
          continue;
        }
      }
      if (!oldestRequest || request.timestamp < oldestRequest.timestamp) {
        oldestRequest = request;
      }
    }

    if (oldestRequest) {
      oldestRequest.dispatched = true;
      oldestRequest.dispatchedAt = now;
      return {
        requestId: oldestRequest.id,
        request: {
          endpoint: oldestRequest.endpoint,
          data: oldestRequest.data
        }
      };
    }

    return null;
  }

  resolveRequest(requestId: string, response: any) {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      clearTimeout(request.timeoutId);
      this.pendingRequests.delete(requestId);
      request.resolve(response);
    }
  }

  rejectRequest(requestId: string, error: any) {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      clearTimeout(request.timeoutId);
      this.pendingRequests.delete(requestId);
      request.reject(error);
    }
  }

  cleanupOldRequests() {
    const now = Date.now();
    for (const [id, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.requestTimeout) {
        clearTimeout(request.timeoutId);
        this.pendingRequests.delete(id);
        request.reject(new Error('Request timeout'));
      }
    }
  }

  clearAllPendingRequests() {
    for (const [, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeoutId);
      request.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  getDispatchedCount(): number {
    let count = 0;
    for (const request of this.pendingRequests.values()) {
      if (request.dispatched) count++;
    }
    return count;
  }
}