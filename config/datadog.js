/**
 * DataDog APM Integration
 * Alternative to New Relic for Application Performance Monitoring
 * 
 * Install: npm install dd-trace
 * Usage: Import this file at the very beginning of your app
 */

// Only initialize if DataDog is configured
if (process.env.DD_API_KEY) {
  const tracer = require('dd-trace').init({
    // Service name
    service: process.env.DD_SERVICE || 'sikadvoltz-backend',
    
    // Environment
    env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
    
    // Version
    version: process.env.DD_VERSION || '1.0.0',
    
    // Logging
    logInjection: true,
    
    // Performance monitoring
    profiling: true,
    
    // Runtime metrics
    runtimeMetrics: true,
    
    // Sampling rate (1.0 = 100% of traces)
    sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Custom tags
    tags: {
      team: 'backend',
      component: 'api',
      framework: 'express',
      database: 'mongodb',
      cache: 'redis'
    },
    
    // Plugin configurations
    plugins: {
      // HTTP requests
      http: {
        enabled: true,
        validateStatus: (code) => code < 400,
        headers: ['user-agent', 'content-type'],
      },
      
      // Express.js
      express: {
        enabled: true,
        blocklist: ['/health', '/keep-alive', '/ready'],
      },
      
      // MongoDB
      mongodb: {
        enabled: true,
        service: 'sikadvoltz-mongodb',
      },
      
      // Redis
      redis: {
        enabled: true,
        service: 'sikadvoltz-redis',
      },
      
      // Generic database
      'generic-pool': {
        enabled: true,
      },
    },
    
    // Error tracking
    reportHostname: true,
    
    // Debug mode
    debug: process.env.NODE_ENV === 'development',
    
    // Log level
    logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
  });

  // Custom metrics helper
  const StatsD = require('hot-shots');
  const dogstatsd = new StatsD({
    host: process.env.DD_AGENT_HOST || 'localhost',
    port: process.env.DD_DOGSTATSD_PORT || 8125,
    prefix: 'sikadvoltz.backend.',
    globalTags: {
      env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
      service: process.env.DD_SERVICE || 'sikadvoltz-backend',
      version: process.env.DD_VERSION || '1.0.0',
    },
  });

  // Export for custom metrics
  module.exports = {
    tracer,
    dogstatsd,
    
    // Helper functions for custom metrics
    incrementCounter: (metric, tags = {}) => {
      dogstatsd.increment(metric, 1, tags);
    },
    
    recordTiming: (metric, value, tags = {}) => {
      dogstatsd.timing(metric, value, tags);
    },
    
    recordGauge: (metric, value, tags = {}) => {
      dogstatsd.gauge(metric, value, tags);
    },
    
    recordHistogram: (metric, value, tags = {}) => {
      dogstatsd.histogram(metric, value, tags);
    },
    
    // Custom span creation
    createSpan: (operationName, options = {}) => {
      return tracer.startSpan(operationName, options);
    },
    
    // Add custom tags to current span
    addTags: (tags) => {
      const span = tracer.scope().active();
      if (span) {
        span.addTags(tags);
      }
    },
    
    // Set error on current span
    setError: (error) => {
      const span = tracer.scope().active();
      if (span) {
        span.setTag('error', true);
        span.log({
          'error.object': error,
          'error.kind': error.name,
          'error.stack': error.stack,
          message: error.message,
        });
      }
    },
  };

  console.log(' DataDog APM initialized successfully');
} else {
  console.log('  DataDog APM not initialized - DD_API_KEY not found');
  
  // Export dummy functions if DataDog is not configured
  module.exports = {
    tracer: null,
    dogstatsd: null,
    incrementCounter: () => {},
    recordTiming: () => {},
    recordGauge: () => {},
    recordHistogram: () => {},
    createSpan: () => null,
    addTags: () => {},
    setError: () => {},
  };
}