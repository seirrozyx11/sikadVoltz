import { WebSocketServer } from 'ws';
import logger from '../utils/logger.js';

/**
 * ESP32 BLE Bridge Service
 * Handles real-time communication between ESP32 devices and the Flutter app
 * via WebSocket connections
 */
class ESP32BLEBridge {
  constructor() {
    this.clients = new Map(); // Store connected clients with metadata
    this.esp32Devices = new Map(); // Store ESP32 device connections
    this.wss = null;
  }

  /**
   * Initialize the WebSocket server for ESP32 communication
   */
  initialize(server, port = 3001) {
    try {
      // Check if we should use the existing server (for Render) or create new one (local dev)
      const isRender = process.env.RENDER;
      
      if (isRender && server) {
        // Production (Render): Attach to existing HTTP server
        this.wss = new WebSocketServer({ 
          server,  // Use existing HTTP server
          path: '/esp32-bridge',  // Specific path for ESP32 WebSocket connections
          perMessageDeflate: false
        });
        logger.info(`ESP32 BLE Bridge attached to main server on path /esp32-bridge`);
        console.log(`🔗 ESP32 BLE Bridge WebSocket server running on main server path /esp32-bridge`);
      } else {
        // Local development: Create separate WebSocket server
        this.wss = new WebSocketServer({ 
          port,
          perMessageDeflate: false
        });
        logger.info(`ESP32 BLE Bridge started on port ${port}`);
        console.log(`🔗 ESP32 BLE Bridge WebSocket server running on port ${port}`);
      }

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });
      
    } catch (error) {
      logger.error('Failed to start ESP32 BLE Bridge:', error);
      throw error;
    }
  }

  /**
   * Handle new WebSocket connections (from Flutter app)
   */
  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    const clientIP = req.socket.remoteAddress;
    
    // Store client connection with metadata
    this.clients.set(clientId, {
      ws,
      ip: clientIP,
      connectedAt: new Date(),
      userId: null, // Will be set after authentication
      deviceId: null // ESP32 device ID if connected
    });

    logger.info(`ESP32 BLE Bridge client connected: ${clientId} from ${clientIP}`);

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connection_established',
      clientId,
      timestamp: new Date().toISOString(),
      message: 'Connected to ESP32 BLE Bridge'
    });

    // Handle incoming messages from Flutter app
    ws.on('message', (message) => {
      this.handleClientMessage(clientId, message);
    });

    // Handle client disconnection
    ws.on('close', () => {
      this.handleClientDisconnection(clientId);
    });

    // Handle connection errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for client ${clientId}:`, error);
      this.clients.delete(clientId);
    });
  }

  /**
   * Handle messages from Flutter app clients
   */
  handleClientMessage(clientId, message) {
    try {
      const data = JSON.parse(message.toString());
      const client = this.clients.get(clientId);

      if (!client) return;

      logger.debug(`Message from client ${clientId}:`, data);

      switch (data.type) {
        case 'authenticate':
          this.handleAuthentication(clientId, data);
          break;
          
        case 'esp32_command':
          this.handleESP32Command(clientId, data);
          break;
          
        case 'esp32_data':
          this.handleESP32Data(clientId, data);
          break;
          
        case 'device_discovery':
          this.handleDeviceDiscovery(clientId, data);
          break;
          
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
          
        default:
          logger.warn(`Unknown message type from client ${clientId}: ${data.type}`);
      }
      
    } catch (error) {
      logger.error(`Error processing message from client ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle client authentication
   */
  handleAuthentication(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // TODO: Implement proper authentication with JWT token validation
    const { userId, token } = data;
    
    if (userId && token) {
      client.userId = userId;
      
      this.sendToClient(clientId, {
        type: 'authenticated',
        userId,
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Client ${clientId} authenticated as user ${userId}`);
    } else {
      this.sendToClient(clientId, {
        type: 'authentication_failed',
        message: 'Invalid credentials',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle ESP32 commands from Flutter app
   */
  handleESP32Command(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.userId) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const { command, deviceId, parameters = {} } = data;

    logger.info(`ESP32 command from client ${clientId}:`, { command, deviceId, parameters });

    // In a real implementation, this would forward the command to the ESP32 device
    // For now, we'll simulate command acknowledgment
    
    // Simulate command processing
    setTimeout(() => {
      this.sendToClient(clientId, {
        type: 'command_response',
        command,
        deviceId,
        status: 'success',
        response: `Command ${command} executed successfully`,
        timestamp: new Date().toISOString()
      });
    }, 100);
  }

  /**
   * Handle ESP32 data from Flutter app (data to be forwarded to backend)
   */
  handleESP32Data(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.userId) return;

    const { deviceData } = data;

    // Log the ESP32 data
    logger.info(`ESP32 data from client ${clientId}:`, deviceData);

    // Forward to all other clients connected to the same user (if any)
    this.broadcastToUser(client.userId, {
      type: 'esp32_data_update',
      deviceData,
      timestamp: new Date().toISOString()
    }, clientId); // Exclude the sender

    // TODO: Forward to backend API for storage
    // this.forwardToBackend(client.userId, deviceData);
  }

  /**
   * Handle device discovery requests
   */
  handleDeviceDiscovery(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Simulate available ESP32 devices
    const mockDevices = [
      {
        id: 'sikadvoltz-001',
        name: 'SikadVoltz',
        type: 'ESP32',
        status: 'available',
        signalStrength: -45,
        services: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
      }
    ];

    this.sendToClient(clientId, {
      type: 'devices_discovered',
      devices: mockDevices,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle client disconnection
   */
  handleClientDisconnection(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      logger.info(`ESP32 BLE Bridge client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    }
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === 1) { // WebSocket.OPEN
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Failed to send message to client ${clientId}:`, error);
      }
    }
  }

  /**
   * Broadcast message to all clients of a specific user
   */
  broadcastToUser(userId, message, excludeClientId = null) {
    for (const [clientId, client] of this.clients) {
      if (client.userId === userId && clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(message) {
    for (const clientId of this.clients.keys()) {
      this.sendToClient(clientId, message);
    }
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      connectedDevices: this.esp32Devices.size,
      uptime: process.uptime()
    };
  }

  /**
   * Shutdown the bridge gracefully
   */
  shutdown() {
    if (this.wss) {
      // Close all client connections
      for (const [clientId, client] of this.clients) {
        client.ws.close(1000, 'Server shutting down');
      }
      
      // Close the WebSocket server
      this.wss.close();
      logger.info('ESP32 BLE Bridge shut down gracefully');
    }
  }
}

// Create singleton instance
const esp32BLEBridge = new ESP32BLEBridge();

// Export the instance and class
export default esp32BLEBridge;
export { ESP32BLEBridge };
