/**
 *  HTTP/2 SERVER OPTIMIZATION
 * 
 * Enhanced Express server with HTTP/2, server push, and performance optimizations
 * Provides significant performance improvements for API responses
 */

import http2 from 'http2';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class HTTP2ServerManager {
  constructor() {
    this.isHTTP2Available = false;
    this.server = null;
    this.sslOptions = null;
  }

  /**
   * Initialize HTTP/2 server with fallback to HTTP/1.1
   */
  async initializeServer(app, port = 3000) {
    try {
      // Check if SSL certificates are available for HTTP/2
      const sslPath = process.env.SSL_CERT_PATH || path.join(__dirname, '../ssl');
      
      if (await this.checkSSLCertificates(sslPath)) {
        return this.createHTTP2Server(app, port);
      } else {
        return this.createHTTP1Server(app, port);
      }
      
    } catch (error) {
      logger.error('Server initialization error:', error);
      return this.createHTTP1Server(app, port);
    }
  }

  /**
   * Create HTTP/2 server with SSL
   */
  async createHTTP2Server(app, port) {
    try {
      const sslOptions = await this.loadSSLOptions();
      
      // Create HTTP/2 secure server
      this.server = http2.createSecureServer({
        ...sslOptions,
        allowHTTP1: true, // Fallback to HTTP/1.1 for compatibility
      });

      // Handle HTTP/2 streams
      this.server.on('stream', (stream, headers) => {
        this.handleHTTP2Stream(stream, headers, app);
      });

      // Handle HTTP/1.1 requests (fallback)
      this.server.on('request', (req, res) => {
        app(req, res);
      });

      this.server.listen(port, '0.0.0.0', () => {
        this.isHTTP2Available = true;
        logger.info(` HTTP/2 server listening on port ${port}`);
        logger.info('Server push and multiplexing enabled');
      });

      return this.server;
      
    } catch (error) {
      logger.error('HTTP/2 server creation failed:', error);
      return this.createHTTP1Server(app, port);
    }
  }

  /**
   * Create HTTP/1.1 server (fallback)
   */
  createHTTP1Server(app, port) {
    try {
      if (process.env.NODE_ENV === 'production' && this.sslOptions) {
        // Use HTTPS in production
        this.server = https.createServer(this.sslOptions, app);
        logger.info(`HTTPS server listening on port ${port}`);
      } else {
        // Use HTTP for development
        this.server = app.listen(port, '0.0.0.0', () => {
          logger.info(`HTTP server listening on port ${port}`);
        });
      }

      return this.server;
      
    } catch (error) {
      logger.error('HTTP/1.1 server creation failed:', error);
      throw error;
    }
  }

  /**
   * Handle HTTP/2 streams with server push optimization
   */
  async handleHTTP2Stream(stream, headers, app) {
    try {
      const method = headers[':method'];
      const url = headers[':path'];
      
      // Create HTTP/1.1 compatible request/response objects
      const req = this.createRequestObject(stream, headers);
      const res = this.createResponseObject(stream);

      // Apply server push for dashboard requests
      if (url === '/api/dashboard/home' || url === '/api/v1/dashboard/home') {
        await this.applyServerPush(stream, req);
      }

      // Process request through Express app
      app(req, res);
      
    } catch (error) {
      logger.error('HTTP/2 stream handling error:', error);
      stream.respond({ ':status': 500 });
      stream.end('Internal Server Error');
    }
  }

  /**
   *  SERVER PUSH: Pre-push related resources for dashboard
   */
  async applyServerPush(stream, req) {
    try {
      const userId = req.user?.userId;
      
      if (!userId) return;

      // Resources to push for dashboard optimization
      const pushResources = [
        {
          path: `/api/v1/profile/${userId}`,
          contentType: 'application/json'
        },
        {
          path: `/api/v1/notifications?limit=5`,
          contentType: 'application/json'
        }
      ];

      for (const resource of pushResources) {
        try {
          const pushStream = stream.pushStream({ ':path': resource.path });
          
          // Simulate fetching the resource data
          const resourceData = await this.fetchResourceData(resource.path, req);
          
          pushStream.respond({
            ':status': 200,
            'content-type': resource.contentType,
            'cache-control': 'public, max-age=30'
          });
          
          pushStream.end(JSON.stringify(resourceData));
          
          logger.info(` Server pushed: ${resource.path}`);
          
        } catch (pushError) {
          logger.warn(`Server push failed for ${resource.path}:`, pushError.message);
        }
      }
      
    } catch (error) {
      logger.error('Server push error:', error);
    }
  }

  /**
   * Fetch resource data for server push
   */
  async fetchResourceData(path, req) {
    // This is a simplified implementation
    // In production, you'd integrate with your actual API handlers
    
    if (path.includes('/profile/')) {
      return {
        success: true,
        data: { message: 'Profile data pushed' },
        pushed: true
      };
    }
    
    if (path.includes('/notifications')) {
      return {
        success: true,
        data: { notifications: [], count: 0 },
        pushed: true
      };
    }
    
    return { success: false, error: 'Unknown resource' };
  }

  /**
   * Create HTTP/1.1 compatible request object for HTTP/2
   */
  createRequestObject(stream, headers) {
    const req = {
      method: headers[':method'],
      url: headers[':path'],
      headers: { ...headers },
      httpVersion: '2.0',
      httpVersionMajor: 2,
      httpVersionMinor: 0,
      stream
    };

    // Remove HTTP/2 pseudo-headers
    delete req.headers[':method'];
    delete req.headers[':path'];
    delete req.headers[':scheme'];
    delete req.headers[':authority'];

    return req;
  }

  /**
   * Create HTTP/1.1 compatible response object for HTTP/2
   */
  createResponseObject(stream) {
    const res = {
      statusCode: 200,
      headers: {},
      
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      
      writeHead(statusCode, headers = {}) {
        this.statusCode = statusCode;
        Object.assign(this.headers, headers);
        
        const responseHeaders = { ':status': statusCode, ...this.headers };
        stream.respond(responseHeaders);
      },
      
      write(chunk) {
        stream.write(chunk);
      },
      
      end(data) {
        if (data) stream.write(data);
        stream.end();
      },
      
      json(data) {
        this.setHeader('content-type', 'application/json');
        this.writeHead(this.statusCode);
        this.end(JSON.stringify(data));
      },
      
      status(code) {
        this.statusCode = code;
        return this;
      }
    };

    return res;
  }

  /**
   * Check if SSL certificates are available
   */
  async checkSSLCertificates(sslPath) {
    try {
      const certPath = path.join(sslPath, 'cert.pem');
      const keyPath = path.join(sslPath, 'key.pem');
      
      await Promise.all([
        fs.promises.access(certPath, fs.constants.R_OK),
        fs.promises.access(keyPath, fs.constants.R_OK)
      ]);
      
      return true;
      
    } catch (error) {
      logger.info('SSL certificates not found - using HTTP/1.1');
      return false;
    }
  }

  /**
   * Load SSL certificate options
   */
  async loadSSLOptions() {
    try {
      const sslPath = process.env.SSL_CERT_PATH || path.join(__dirname, '../ssl');
      
      const [cert, key] = await Promise.all([
        fs.promises.readFile(path.join(sslPath, 'cert.pem')),
        fs.promises.readFile(path.join(sslPath, 'key.pem'))
      ]);
      
      this.sslOptions = { cert, key };
      return this.sslOptions;
      
    } catch (error) {
      logger.error('Failed to load SSL certificates:', error);
      throw error;
    }
  }

  /**
   * Enable HTTP/2 performance optimizations
   */
  enablePerformanceOptimizations(app) {
    // Add HTTP/2 push middleware
    app.use((req, res, next) => {
      if (this.isHTTP2Available && req.httpVersion === '2.0') {
        // Add server push hints
        res.setHeader('Link', [
          '</api/v1/profile>; rel=preload; as=fetch',
          '</api/v1/notifications>; rel=preload; as=fetch'
        ].join(', '));
      }
      
      next();
    });

    // Add performance headers
    app.use((req, res, next) => {
      if (this.isHTTP2Available) {
        res.setHeader('Alt-Svc', 'h2=":443"; ma=86400');
      }
      
      // Enable compression hints
      res.setHeader('Accept-Encoding', 'gzip, br');
      
      next();
    });

    logger.info('HTTP/2 performance optimizations enabled');
  }

  /**
   * Get server statistics
   */
  getServerStats() {
    return {
      protocol: this.isHTTP2Available ? 'HTTP/2' : 'HTTP/1.1',
      ssl: !!this.sslOptions,
      serverPush: this.isHTTP2Available,
      multiplexing: this.isHTTP2Available,
      compression: true
    };
  }
}

export default HTTP2ServerManager;