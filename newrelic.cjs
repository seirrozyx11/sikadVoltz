/**
 * New Relic Agent Configuration
 * 
 * This configuration file is used to enable New Relic APM monitoring
 * for the SikadVoltz backend application.
 */
'use strict';

/**
 * Array of application names.
 */
exports.app_name = [process.env.NEW_RELIC_APP_NAME || 'SikadVoltz Backend'];

/**
 * Your New Relic license key.
 */
exports.license_key = process.env.NEW_RELIC_LICENSE_KEY || 'your_license_key_here';

/**
 * This setting controls distributed tracing.
 * Distributed tracing lets you see the path that a request takes through your
 * distributed system.
 */
exports.distributed_tracing = {
  enabled: true,
};

/**
 * Logging configuration
 */
exports.logging = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  filepath: process.env.NEW_RELIC_LOG_FILE || 'stdout',
  enabled: true,
};

/**
 * Application monitoring configuration
 */
exports.application_logging = {
  enabled: true,
  forwarding: {
    enabled: true,
    max_samples_stored: 10000,
  },
  metrics: {
    enabled: true,
  },
  local_decorating: {
    enabled: true,
  },
};

/**
 * Browser monitoring configuration
 */
exports.browser_monitoring = {
  enable: false, // We're API-only, no browser monitoring needed
};

/**
 * Transaction tracer configuration
 */
exports.transaction_tracer = {
  enabled: true,
  transaction_threshold: 'apdex_f',
  record_sql: 'obfuscated',
  explain_threshold: 500,
  top_n: 20,
};

/**
 * Error collector configuration
 */
exports.error_collector = {
  enabled: true,
  ignore_status_codes: [404],
  capture_events: true,
  max_event_samples_stored: 100,
};

/**
 * Custom insights events
 */
exports.custom_insights_events = {
  enabled: true,
  max_samples_stored: 1000,
};

/**
 * API configuration
 */
exports.api = {
  enabled: true,
};

/**
 * Attributes configuration
 */
exports.attributes = {
  enabled: true,
  include_enabled: true,
  exclude: [
    'request.headers.authorization',
    'request.headers.cookie',
    'request.headers.x-*',
  ],
  include: [
    'request.method',
    'request.uri',
    'response.status',
    'response.headers.contentType',
  ],
};

/**
 * High security mode - disable for development
 */
exports.high_security = process.env.NODE_ENV === 'production';

/**
 * Security agent - available with paid plans
 */
exports.security = {
  enabled: false, // Enable if you have New Relic Security
  agent: {
    enabled: false,
  },
  detection: {
    rci: {
      enabled: true,
    },
    rxss: {
      enabled: true,
    },
    deserialization: {
      enabled: true,
    },
  },
};

/**
 * Allow all data types to be sent to New Relic
 */
exports.allow_all_headers = false;

/**
 * Obfuscate SQL queries for security
 */
exports.record_sql = 'obfuscated';

/**
 * Capture request parameters (be careful with sensitive data)
 */
exports.capture_params = false;

/**
 * Ignored routes (to reduce noise)
 */
exports.rules = {
  ignore: [
    '/health',
    '/keep-alive',
    '/ready',
    '/robots.txt',
    '/favicon.ico',
  ],
};

/**
 * Custom metrics for business logic
 */
exports.custom_metrics_enabled = true;

/**
 * Performance monitoring for external services
 */
exports.external_segments = {
  enabled: true,
};

/**
 * Database query monitoring
 */
exports.datastore_tracer = {
  enabled: true,
  instance_reporting: {
    enabled: true,
  },
  database_name_reporting: {
    enabled: true,
  },
};

/**
 * Slow query monitoring
 */
exports.slow_sql = {
  enabled: true,
  max_samples: 10,
};

/**
 * Memory usage monitoring
 */
exports.gc_metrics = {
  enabled: true,
};

/**
 * Environment-specific overrides
 */
if (process.env.NODE_ENV === 'development') {
  exports.logging.level = 'debug';
  exports.high_security = false;
  exports.capture_params = true;
}

if (process.env.NODE_ENV === 'test') {
  exports.enabled = false;
  exports.logging.enabled = false;
}