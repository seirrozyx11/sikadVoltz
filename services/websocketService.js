import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocketServer({ noServer: true });
    this.clients = new Map(); // userId -> Set of WebSocket connections
    this.setupHandlers();
    this.setupServer(server);
  }

  setupServer(server) {
    // Handle HTTP server upgrade to WebSocket
    server.on('upgrade', (request, socket, head) => {
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
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

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
    this.wss.on('connection', (ws, request, userId) => {
      logger.info(`New WebSocket connection for user ${userId}`);
      
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
            default:
              // Ignore unknown events for now
              break;
          }
        } catch (e) {
          logger.warn('Invalid WS message received', e);
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        logger.info(`WebSocket disconnected for user ${userId}`);
        const userSockets = this.clients.get(userId);
        if (userSockets) {
          userSockets.delete(ws);
          if (userSockets.size === 0) {
            this.clients.delete(userId);
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
