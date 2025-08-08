import mongoose from 'mongoose';

// Individual telemetry data point schema
const telemetrySchema = new mongoose.Schema({
  deviceId: { 
    type: String, 
    required: true,
    index: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  sessionId: { 
    type: String, 
    required: true,
    index: true 
  },
  // Location data
  coordinates: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' }
  },
  // Core metrics from ESP32
  metrics: {
    speed: { type: Number, min: 0, max: 120, default: 0 }, // km/h
    distance: { type: Number, min: 0, default: 0 }, // km
    sessionTime: { type: Number, min: 0, default: 0 }, // seconds
    watts: { type: Number, min: 0, max: 2000, default: 0 }, // watts
    pulseCount: { type: Number, min: 0, default: 0 }
  },
  // Device status
  battery: {
    voltage: { type: Number, min: 0, max: 20, default: 0 },
    level: { type: Number, min: 0, max: 100, default: 0 }
  },
  workoutActive: { type: Boolean, default: false },
  // Raw data for debugging
  rawData: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, index: true }
}, { 
  timeseries: { 
    timeField: 'timestamp',
    granularity: 'seconds'
  },
  timestamps: true 
});

// Ride session schema for aggregated data
const rideSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  deviceId: { 
    type: String, 
    required: true 
  },
  sessionId: { 
    type: String, 
    required: true,
    unique: true,
    index: true 
  },
  // Session summary
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  duration: { type: Number, default: 0 }, // seconds
  // Aggregated metrics
  totalDistance: { type: Number, min: 0, default: 0 }, // km
  maxSpeed: { type: Number, min: 0, default: 0 }, // km/h
  avgSpeed: { type: Number, min: 0, default: 0 }, // km/h
  totalCalories: { type: Number, min: 0, default: 0 }, // kcal
  avgPower: { type: Number, min: 0, default: 0 }, // watts
  maxPower: { type: Number, min: 0, default: 0 }, // watts
  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'cancelled'],
    default: 'active'
  },
  // Plan integration
  planId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CyclingPlan' 
  },
  plannedHours: { type: Number, default: 0 },
  actualHours: { type: Number, default: 0 },
  // Route data
  route: [{
    lat: Number,
    lng: Number,
    timestamp: Date,
    speed: Number,
    altitude: Number
  }],
  // Statistics
  dataPoints: { type: Number, default: 0 },
  lastUpdate: { type: Date, default: Date.now }
}, { timestamps: true });

// ESP32 Device registration schema
const esp32DeviceSchema = new mongoose.Schema({
  deviceId: { 
    type: String, 
    required: true,
    unique: true,
    index: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  deviceName: { type: String, default: 'SIKAD-VOLTZ' },
  firmwareVersion: { type: String, default: '1.0.0' },
  lastSeen: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  // Device configuration
  wheelCircumference: { type: Number, default: 2.07 }, // meters
  batteryThreshold: { type: Number, default: 20 }, // percentage
  // Statistics
  totalSessions: { type: Number, default: 0 },
  totalDistance: { type: Number, default: 0 },
  totalTime: { type: Number, default: 0 }
}, { timestamps: true });

// Indexes for performance
telemetrySchema.index({ userId: 1, timestamp: -1 });
telemetrySchema.index({ sessionId: 1, timestamp: 1 });
telemetrySchema.index({ deviceId: 1, timestamp: -1 });

rideSessionSchema.index({ userId: 1, startTime: -1 });
rideSessionSchema.index({ status: 1, userId: 1 });
rideSessionSchema.index({ planId: 1, startTime: -1 });

esp32DeviceSchema.index({ userId: 1, isActive: 1 });

// Static methods for Telemetry
telemetrySchema.statics.getSessionData = async function(sessionId) {
  return this.find({ sessionId }).sort({ timestamp: 1 });
};

telemetrySchema.statics.getUserRecentData = async function(userId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({ 
    userId, 
    timestamp: { $gte: since } 
  }).sort({ timestamp: -1 });
};

// Static methods for RideSession
rideSessionSchema.statics.createNewSession = async function(userId, deviceId) {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session = new this({
    userId,
    deviceId,
    sessionId,
    startTime: new Date(),
    status: 'active'
  });
  
  return await session.save();
};

rideSessionSchema.statics.getUserActiveSessions = async function(userId) {
  return this.find({ 
    userId, 
    status: 'active' 
  }).sort({ startTime: -1 });
};

rideSessionSchema.statics.completeSession = async function(sessionId, finalMetrics) {
  const session = await this.findOne({ sessionId });
  if (!session) return null;
  
  session.status = 'completed';
  session.endTime = new Date();
  session.duration = Math.floor((session.endTime - session.startTime) / 1000);
  session.actualHours = session.duration / 3600;
  
  // Update metrics
  if (finalMetrics) {
    session.totalDistance = finalMetrics.distance || session.totalDistance;
    session.maxSpeed = finalMetrics.maxSpeed || session.maxSpeed;
    session.avgSpeed = finalMetrics.avgSpeed || session.avgSpeed;
    session.totalCalories = finalMetrics.calories || session.totalCalories;
    session.avgPower = finalMetrics.avgPower || session.avgPower;
    session.maxPower = finalMetrics.maxPower || session.maxPower;
  }
  
  return await session.save();
};

// Instance methods for RideSession
rideSessionSchema.methods.updateMetrics = function(telemetryData) {
  // Update real-time metrics
  if (telemetryData.metrics) {
    this.totalDistance = Math.max(this.totalDistance, telemetryData.metrics.distance || 0);
    this.maxSpeed = Math.max(this.maxSpeed, telemetryData.metrics.speed || 0);
    this.maxPower = Math.max(this.maxPower, telemetryData.metrics.watts || 0);
    
    // Calculate running averages
    this.dataPoints = (this.dataPoints || 0) + 1;
    this.avgSpeed = ((this.avgSpeed * (this.dataPoints - 1)) + (telemetryData.metrics.speed || 0)) / this.dataPoints;
    this.avgPower = ((this.avgPower * (this.dataPoints - 1)) + (telemetryData.metrics.watts || 0)) / this.dataPoints;
  }
  
  this.lastUpdate = new Date();
  return this.save();
};

// Create models
const Telemetry = mongoose.model('Telemetry', telemetrySchema);
const RideSession = mongoose.model('RideSession', rideSessionSchema);
const ESP32Device = mongoose.model('ESP32Device', esp32DeviceSchema);

export { Telemetry, RideSession, ESP32Device };
export default Telemetry;