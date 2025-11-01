import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import User from '../models/User.js'; // For user status tracking

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocketServer({ noServer: true });
    this.clients = new Map(); // userId -> Set of WebSocket connections
    this.setupHandlers();
    this.setupServer(server);
    this.startHeartbeat();
  }

  // 🔥 FIX: Heartbeat to keep connections alive
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.warn('WebSocket connection terminated (no pong received)');
          return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Ping every 30 seconds
  }

  setupServer(server) {
    // Handle HTTP server upgrade to WebSocket
    server.on('upgrade', (request, socket, head) => {
      // 🔥 FIX: Only handle /ws path for notification WebSocket
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname !== '/ws') {
        // Let other handlers deal with non-/ws upgrades
        return;
      }
      
      logger.info(`WebSocket upgrade request for path: ${url.pathname}`);
      
      // Extract token from query params
      const token = this.extractToken(request);
      
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Verify JWT token
      jwt.verify(token, process.env.JWT_SECRET || 'fallbacksecret', (err, decoded) => {
        if (err) {
          logger.warn(`WebSocket auth failed: ${err.message}`);
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        logger.info(`WebSocket auth successful for user: ${decoded.userId}`);
        
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request, decoded.userId);
        });
      });
    });
  }

  extractToken(request) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    return url.searchParams.get('token') || '';
  }

  setupHandlers() {
    this.wss.on('connection', async (ws, request, userId) => {
      logger.info(`✅ New WebSocket connection established for user ${userId}`);
      
      // 🔥 FIX: Set up ping/pong to keep connection alive
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      
      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'WebSocket connection established',
        timestamp: new Date().toISOString()
      }));
      
      // DUAL-STRATEGY: Set user status to ONLINE when WebSocket connects
      try {
        const user = await User.findById(userId);
        if (user) {
          await user.setOnline();
          logger.info(`User ${userId} marked as ONLINE (WebSocket connected)`);
        }
      } catch (error) {
        logger.error(`Failed to set user ${userId} online:`, error);
      }
      
      // Add client to the map
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(ws);

      // Relay client-sent telemetry to all sockets for the same user
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          const event = msg?.event;
          const data = msg?.data;
          if (!event) return;

          // Only relay known real-time events
          switch (event) {
            case 'telemetry_update':
              // Broadcast to all active sockets for this user (including sender)
              this.broadcastToUser(userId, event, data);
              break;
            case 'heartbeat':
              // DUAL-STRATEGY: Update last active timestamp on heartbeat
              User.findById(userId).then(user => {
                if (user) {
                  user.updateLastActive().catch(err => 
                    logger.error('Failed to update last active:', err)
                  );
                }
              }).catch(err => logger.error('Failed to find user for heartbeat:', err));
              break;
            default:
              // Ignore unknown events for now
              break;
          }
        } catch (e) {
          logger.warn('Invalid WS message received', e);
        }
      });

      // Handle client disconnection
      ws.on('close', async () => {
        logger.info(`WebSocket disconnected for user ${userId}`);
        const userSockets = this.clients.get(userId);
        if (userSockets) {
          userSockets.delete(ws);
          if (userSockets.size === 0) {
            this.clients.delete(userId);
            
            // DUAL-STRATEGY: Set user status to OFFLINE when last WebSocket disconnects
            try {
              const user = await User.findById(userId);
              if (user) {
                await user.setOffline();
                logger.info(`User ${userId} marked as OFFLINE (all WebSocket connections closed)`);
              }
            } catch (error) {
              logger.error(`Failed to set user ${userId} offline:`, error);
            }
          }
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });
    });
  }

  // Broadcast to all clients of a specific user
  broadcastToUser(userId, event, data) {
    const userSockets = this.clients.get(userId);
    if (!userSockets) return;

    const message = JSON.stringify({ event, data });
    
    userSockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message, (error) => {
          if (error) {
            logger.error('Error sending WebSocket message:', error);
          }
        });
      }
    });
  }

  // Send message to specific user (alias for broadcastToUser for notification compatibility)
  sendToUser(userId, data) {
    this.broadcastToUser(userId, 'message', data);
  }

  // Get user connections (for notification service compatibility)
  getUserConnections(userId) {
    return this.clients.get(userId) || new Set();
  }

  // Check if user has active WebSocket connections
  isUserConnected(userId) {
    const connections = this.clients.get(userId);
    return connections && connections.size > 0;
  }

  // Broadcast to all connected clients
  broadcast(event, data) {
    const message = JSON.stringify({ event, data });
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message, (error) => {
          if (error) {
            logger.error('Error broadcasting WebSocket message:', error);
          }
        });
      }
    });
  }
}

let webSocketService = null;

export function initWebSocket(server) {
  if (!webSocketService) {
    webSocketService = new WebSocketService(server);
  }
  return webSocketService;
}

export function getWebSocketService() {
  if (!webSocketService) {
    throw new Error('WebSocket service not initialized');
  }
  return webSocketService;
}
