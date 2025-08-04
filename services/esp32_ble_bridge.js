// Enhanced BLE Bridge Service for SIKAD-VOLTZ
// Optional component for advanced data processing and analytics

const noble = require('@abandonware/noble');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

class ESP32BLEBridge {
  constructor() {
    this.app = express();
    this.wss = null;
    this.connectedPeripheral = null;
    this.dataCharacteristic = null;
    this.commandCharacteristic = null;
    this.latestData = null;
    this.analytics = {
      totalPackets: 0,
      avgLatency: 0,
      connectionUptime: 0,
      startTime: Date.now()
    };
    
    this.setupExpress();
    this.setupBLE();
  }

  setupExpress() {
    this.app.use(cors());
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        ble_connected: !!this.connectedPeripheral,
        uptime: process.uptime(),
        analytics: this.analytics
      });
    });

    // Get latest metrics
    this.app.get('/metrics', (req, res) => {
      res.json({
        success: true,
        data: this.latestData,
        timestamp: new Date().toISOString(),
        analytics: this.analytics
      });
    });

    // Send command to ESP32
    this.app.post('/command', async (req, res) => {
      const { command } = req.body;
      
      if (!this.commandCharacteristic) {
        return res.status(400).json({
          success: false,
          message: 'ESP32 not connected'
        });
      }

      try {
        await this.sendCommand(command);
        res.json({
          success: true,
          message: `Command "${command}" sent successfully`
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    // Start HTTP server
    const PORT = process.env.PORT || 3001;
    this.app.listen(PORT, () => {
      console.log(`🚀 SIKAD-VOLTZ BLE Bridge running on port ${PORT}`);
    });

    // Setup WebSocket server for real-time data
    this.wss = new WebSocket.Server({ port: 3002 });
    this.wss.on('connection', (ws) => {
      console.log('📱 Mobile app connected via WebSocket');
      
      // Send latest data immediately
      if (this.latestData) {
        ws.send(JSON.stringify({
          type: 'data',
          payload: this.latestData
        }));
      }

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'command' && data.command) {
            this.sendCommand(data.command);
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        console.log('📱 Mobile app disconnected');
      });
    });
  }

  setupBLE() {
    console.log('🔍 Initializing BLE scanner...');

    noble.on('stateChange', (state) => {
      console.log(`📡 Bluetooth state: ${state}`);
      if (state === 'poweredOn') {
        console.log('🔍 Scanning for SIKAD-VOLTZ devices...');
        noble.startScanning(['4fafc201-1fb5-459e-8fcc-c5c9c331914b'], false);
      } else {
        noble.stopScanning();
      }
    });

    noble.on('discover', async (peripheral) => {
      const deviceName = peripheral.advertisement.localName;
      console.log(`🔍 Found device: ${deviceName} (${peripheral.id})`);

      if (deviceName === 'SIKAD-VOLTZ') {
        console.log('✅ Found SIKAD-VOLTZ device!');
        noble.stopScanning();
        
        try {
          await this.connectToESP32(peripheral);
        } catch (error) {
          console.error('❌ Connection failed:', error);
          // Restart scanning after failure
          setTimeout(() => {
            console.log('🔄 Retrying scan...');
            noble.startScanning(['4fafc201-1fb5-459e-8fcc-c5c9c331914b'], false);
          }, 5000);
        }
      }
    });

    noble.on('disconnect', () => {
      console.log('🔌 ESP32 disconnected, restarting scan...');
      this.connectedPeripheral = null;
      this.dataCharacteristic = null;
      this.commandCharacteristic = null;
      
      // Restart scanning
      setTimeout(() => {
        noble.startScanning(['4fafc201-1fb5-459e-8fcc-c5c9c331914b'], false);
      }, 2000);
    });
  }

  async connectToESP32(peripheral) {
    console.log('🔗 Connecting to ESP32...');
    
    await peripheral.connectAsync();
    console.log('✅ Connected to ESP32');
    
    this.connectedPeripheral = peripheral;
    this.analytics.connectionUptime = Date.now();

    // Discover services
    const services = await peripheral.discoverServicesAsync(['4fafc201-1fb5-459e-8fcc-c5c9c331914b']);
    if (services.length === 0) {
      throw new Error('SIKAD-VOLTZ service not found');
    }

    const service = services[0];
    console.log(`🔍 Found service: ${service.uuid}`);

    // Discover characteristics
    const characteristics = await service.discoverCharacteristicsAsync([
      'beb5483e-36e1-4688-b7f5-ea07361b26a8', // Data characteristic
      '9a8ca9ef-e43f-4157-9fee-c37a3d7dc12d'  // Command characteristic
    ]);

    for (const char of characteristics) {
      if (char.uuid === 'beb5483e36e14688b7f5ea07361b26a8') {
        this.dataCharacteristic = char;
        console.log('📊 Data characteristic found');
        
        // Subscribe to notifications
        await char.subscribeAsync();
        char.on('data', (data) => {
          this.handleDataFromESP32(data);
        });
        
      } else if (char.uuid === '9a8ca9efe43f41579feec37a3d7dc12d') {
        this.commandCharacteristic = char;
        console.log('📤 Command characteristic found');
      }
    }

    console.log('🎉 ESP32 fully connected and configured!');
    
    // Send initial status request
    await this.sendCommand('GET_STATUS');
  }

  handleDataFromESP32(buffer) {
    try {
      const jsonString = buffer.toString('utf8');
      const data = JSON.parse(jsonString);
      
      this.latestData = {
        ...data,
        server_timestamp: new Date().toISOString(),
        latency: Date.now() - (data.timestamp || Date.now())
      };

      this.analytics.totalPackets++;
      this.analytics.avgLatency = (this.analytics.avgLatency + this.latestData.latency) / 2;

      // Broadcast to all WebSocket clients
      if (this.wss) {
        this.wss.clients.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'data',
              payload: this.latestData
            }));
          }
        });
      }

      // Log important metrics every 50 packets
      if (this.analytics.totalPackets % 50 === 0) {
        console.log(`📊 Metrics: Speed=${data.speed}km/h, Power=${data.watts}W, Packets=${this.analytics.totalPackets}, Latency=${this.latestData.latency}ms`);
      }

    } catch (error) {
      console.error('❌ Data parsing error:', error);
    }
  }

  async sendCommand(command) {
    if (!this.commandCharacteristic) {
      throw new Error('ESP32 not connected');
    }

    console.log(`📤 Sending command: ${command}`);
    const buffer = Buffer.from(command, 'utf8');
    await this.commandCharacteristic.writeAsync(buffer, false);
    
    // Broadcast command to WebSocket clients
    if (this.wss) {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'command_sent',
            command: command,
            timestamp: new Date().toISOString()
          }));
        }
      });
    }
  }
}

// Start the bridge
const bridge = new ESP32BLEBridge();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down BLE Bridge...');
  if (bridge.connectedPeripheral) {
    bridge.connectedPeripheral.disconnect();
  }
  process.exit(0);
});

module.exports = ESP32BLEBridge;
