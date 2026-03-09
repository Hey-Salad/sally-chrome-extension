/**
 * WebSocket Client for Chrome Extension
 * 
 * Provides real-time communication between Sally Mobile App and Chrome Extension
 * via Cloudflare Durable Objects WebSocket infrastructure.
 * 
 * Performance: <100ms latency (20-50x faster than HTTP polling)
 */

class ShoppingWebSocketClient {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.isConnected = false;
    this.messageHandlers = new Map();
    this.heartbeatInterval = null;
    
    console.log('[WebSocket] Client initialized for session:', sessionId);
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    const url = `wss://sally-api.heysalad-o.workers.dev/ws?session=${this.sessionId}&type=extension`;
    console.log('[WebSocket] Connecting to:', url);
    
    try {
      this.ws = new WebSocket(url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.reconnect();
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('[WebSocket] Extension connected to session:', this.sessionId);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Start heartbeat to keep connection alive
      this.startHeartbeat();
      
      // Notify background script
      chrome.runtime.sendMessage({ 
        type: 'WEBSOCKET_CONNECTED',
        sessionId: this.sessionId 
      }).catch(() => {});
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Message received:', message.type);
        
        this.handleMessage(message);
      } catch (error) {
        console.error('[WebSocket] Message parse error:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      this.isConnected = false;
    };

    this.ws.onclose = (event) => {
      console.log('[WebSocket] Disconnected:', event.code, event.reason);
      this.isConnected = false;
      this.stopHeartbeat();
      
      // Notify background script
      chrome.runtime.sendMessage({ 
        type: 'WEBSOCKET_DISCONNECTED',
        sessionId: this.sessionId 
      }).catch(() => {});
      
      // Attempt reconnection
      if (event.code !== 1000) { // Not a normal closure
        this.reconnect();
      }
    };
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(message) {
    const { type, payload } = message;
    
    switch (type) {
      case 'connected':
        console.log('[WebSocket] Connection confirmed:', payload);
        break;
        
      case 'client_joined':
        console.log('[WebSocket] Client joined:', payload.clientType);
        break;
        
      case 'client_left':
        console.log('[WebSocket] Client left:', payload.clientType);
        break;
        
      case 'start_shopping':
        this.handleStartShopping(payload);
        break;
        
      case 'stop':
        this.handleStopShopping(payload);
        break;
        
      case 'status':
        this.handleStatusRequest(payload);
        break;
        
      default:
        console.log('[WebSocket] Unknown message type:', type);
    }
    
    // Call registered handlers
    const handlers = this.messageHandlers.get(type) || [];
    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        console.error('[WebSocket] Handler error:', error);
      }
    });
  }

  /**
   * Handle start shopping command from mobile
   */
  async handleStartShopping(payload) {
    console.log('[WebSocket] Start shopping command:', payload);
    
    const { items, store, preferences } = payload;
    
    // Forward to background script to start shopping
    chrome.runtime.sendMessage({
      type: 'START_SHOPPING_FROM_MOBILE',
      items,
      store,
      preferences,
      sessionId: this.sessionId
    }).catch(error => {
      console.error('[WebSocket] Failed to forward shopping command:', error);
      this.sendError('Failed to start shopping');
    });
  }

  /**
   * Handle stop shopping command from mobile
   */
  async handleStopShopping(payload) {
    console.log('[WebSocket] Stop shopping command');
    
    chrome.runtime.sendMessage({
      type: 'STOP_SHOPPING_FROM_MOBILE',
      sessionId: this.sessionId
    }).catch(error => {
      console.error('[WebSocket] Failed to forward stop command:', error);
    });
  }

  /**
   * Handle status request from mobile
   */
  async handleStatusRequest(payload) {
    console.log('[WebSocket] Status request');
    
    // Get current shopping status from storage
    const data = await chrome.storage.local.get(['currentTask']);
    const task = data.currentTask;
    
    if (task && task.sessionId === this.sessionId) {
      this.sendStatus({
        status: task.status,
        progress: task.progress || 0,
        itemsAdded: task.itemsAdded || 0,
        totalItems: task.items?.length || 0,
        currentItem: task.currentItem
      });
    } else {
      this.sendStatus({
        status: 'idle',
        progress: 0
      });
    }
  }

  /**
   * Send progress update to mobile
   */
  sendProgress(data) {
    this.send({
      type: 'progress',
      payload: {
        percentage: data.percentage || 0,
        itemsAdded: data.itemsAdded || 0,
        totalItems: data.totalItems || 0,
        currentItem: data.currentItem,
        stage: data.stage,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Send item added notification to mobile
   */
  sendItemAdded(item) {
    this.send({
      type: 'item_added',
      payload: {
        name: item.name,
        found: item.found || item.name,
        price: item.price || 0,
        image: item.image,
        confidence: item.confidence || 1.0,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Send item failed notification to mobile
   */
  sendItemFailed(item) {
    this.send({
      type: 'item_failed',
      payload: {
        name: item.name,
        reason: item.reason || 'Not found',
        timestamp: Date.now()
      }
    });
  }

  /**
   * Send shopping complete notification to mobile
   */
  sendComplete(data) {
    this.send({
      type: 'complete',
      payload: {
        itemsAdded: data.itemsAdded || 0,
        totalItems: data.totalItems || 0,
        totalPrice: data.totalPrice || 0,
        duration: data.duration || 0,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Send error to mobile
   */
  sendError(message, details = {}) {
    this.send({
      type: 'error',
      payload: {
        message,
        details,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Send status update to mobile
   */
  sendStatus(status) {
    this.send({
      type: 'status',
      payload: status
    });
  }

  /**
   * Send message via WebSocket
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot send, not connected:', message.type);
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      console.log('[WebSocket] Sent:', message.type);
      return true;
    } catch (error) {
      console.error('[WebSocket] Send error:', error);
      return false;
    }
  }

  /**
   * Register message handler
   */
  on(messageType, handler) {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType).push(handler);
  }

  /**
   * Unregister message handler
   */
  off(messageType, handler) {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      chrome.runtime.sendMessage({ 
        type: 'WEBSOCKET_FAILED',
        sessionId: this.sessionId 
      }).catch(() => {});
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'ping', payload: {} });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    console.log('[WebSocket] Disconnecting...');
    
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.messageHandlers.clear();
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      sessionId: this.sessionId,
      reconnectAttempts: this.reconnectAttempts,
      readyState: this.ws?.readyState
    };
  }
}

// Export for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShoppingWebSocketClient;
}
