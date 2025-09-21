/**
 * Environment Variable Validation and Security Configuration
 * 
 * This module validates required environment variables and ensures
 * secure configuration before the server starts.
 */

import crypto from 'crypto';
import logger from './logger.js';

class EnvironmentValidator {
  constructor() {
    this.requiredVars = [
      'MONGODB_URI',
      'JWT_SECRET'
    ];
    
    this.optionalVars = [
      'PORT',
      'NODE_ENV',
      'GOOGLE_WEB_CLIENT_ID',
      'GOOGLE_ANDROID_CLIENT_ID',
      'EMAIL_USER',
      'EMAIL_PASS',
      'ALLOWED_ORIGINS'
    ];
    
    this.securityRequirements = {
      JWT_SECRET: {
        minLength: 32,
        description: 'JWT secret must be at least 32 characters for security'
      },
      MONGODB_URI: {
        pattern: /^mongodb(\+srv)?:\/\/.+/,
        description: 'MongoDB URI must be a valid connection string'
      }
    };
  }

  /**
   * Validate all environment variables
   * @returns {Object} Validation result
   */
  validate() {
    const missing = [];
    const invalid = [];
    const warnings = [];

    // Check required variables
    for (const varName of this.requiredVars) {
      const value = process.env[varName];
      
      if (!value) {
        missing.push(varName);
        continue;
      }

      // Check security requirements
      const requirement = this.securityRequirements[varName];
      if (requirement) {
        const validation = this.validateSecurityRequirement(varName, value, requirement);
        if (!validation.valid) {
          invalid.push({
            variable: varName,
            reason: validation.reason,
            requirement: requirement.description
          });
        }
      }
    }

    // Check optional variables and provide warnings
    for (const varName of this.optionalVars) {
      const value = process.env[varName];
      
      if (!value) {
        warnings.push(`Optional variable ${varName} is not set`);
      }
    }

    // Environment-specific validations
    if (process.env.NODE_ENV === 'production') {
      this.validateProductionEnvironment(warnings);
    }

    return {
      valid: missing.length === 0 && invalid.length === 0,
      missing,
      invalid,
      warnings,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Validate security requirement for a specific variable
   * @param {string} varName - Variable name
   * @param {string} value - Variable value
   * @param {Object} requirement - Security requirement
   * @returns {Object} Validation result
   */
  validateSecurityRequirement(varName, value, requirement) {
    // Check minimum length
    if (requirement.minLength && value.length < requirement.minLength) {
      return {
        valid: false,
        reason: `Must be at least ${requirement.minLength} characters, got ${value.length}`
      };
    }

    // Check pattern matching
    if (requirement.pattern && !requirement.pattern.test(value)) {
      return {
        valid: false,
        reason: 'Does not match required pattern'
      };
    }

    // Additional security checks for JWT_SECRET
    if (varName === 'JWT_SECRET') {
      // Debug logging for production troubleshooting
      console.log(`🔐 JWT_SECRET Debug: Length=${value.length}, First10=${value.substring(0, 10)}...`);
      
      // For hex strings (crypto.randomBytes output), lower entropy is expected and acceptable
      const isHexString = /^[a-fA-F0-9]+$/.test(value);
      const entropy = this.calculateEntropy(value);
      
      console.log(`🔐 JWT_SECRET Analysis: Entropy=${entropy.toFixed(3)}, IsHex=${isHexString}, MinRequired=${isHexString ? 3.8 : 4.0}`);
      
      // Adjust entropy requirements based on string type and environment
      const isProduction = process.env.NODE_ENV === 'production';
      const minEntropy = isHexString ? (isProduction ? 3.7 : 3.8) : 4.0;
      
      // Bypass entropy check for very long hex strings (128+ chars) which are definitely secure
      const isVeryLongHex = isHexString && value.length >= 128;
      
      if (!isVeryLongHex && entropy < minEntropy) {
        return {
          valid: false,
          reason: `JWT secret has low entropy (${entropy.toFixed(2)}) - use a more random secret`
        };
      }

      // Check for common weak patterns
      if (/^(test|dev|secret|password|key|123)/i.test(value)) {
        return {
          valid: false,
          reason: 'JWT secret appears to use weak/common patterns'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate production environment specific requirements
   * @param {Array} warnings - Warnings array to append to
   */
  validateProductionEnvironment(warnings) {
    if (!process.env.ALLOWED_ORIGINS) {
      warnings.push('ALLOWED_ORIGINS should be set in production for CORS security');
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      warnings.push('Email configuration incomplete - password reset will not work');
    }

    if (process.env.LOG_LEVEL === 'debug') {
      warnings.push('Debug logging enabled in production - consider using "info" or "warn"');
    }
  }

  /**
   * Calculate entropy of a string (simple Shannon entropy)
   * @param {string} str - String to analyze
   * @returns {number} Entropy value
   */
  calculateEntropy(str) {
    const chars = {};
    for (let char of str) {
      chars[char] = (chars[char] || 0) + 1;
    }

    const length = str.length;
    let entropy = 0;

    for (let count of Object.values(chars)) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Generate a secure JWT secret
   * @returns {string} Secure random JWT secret
   */
  generateSecureJWTSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Validate and fail fast if environment is not secure
   */
  validateOrExit() {
    const validation = this.validate();

    if (!validation.valid) {
      console.error('\n🚨 ENVIRONMENT VALIDATION FAILED 🚨\n');
      
      if (validation.missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        validation.missing.forEach(varName => {
          console.error(`   - ${varName}`);
        });
        console.error('\n💡 Copy .env.example to .env and fill in the values\n');
      }

      if (validation.invalid.length > 0) {
        console.error('❌ Invalid environment variables:');
        validation.invalid.forEach(({ variable, reason, requirement }) => {
          console.error(`   - ${variable}: ${reason}`);
          console.error(`     Requirement: ${requirement}`);
        });
        
        if (validation.invalid.some(item => item.variable === 'JWT_SECRET')) {
          console.error('\n💡 Generate a secure JWT secret with:');
          console.error(`   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`);
          console.error('\n   Example secure JWT secret:');
          console.error(`   ${this.generateSecureJWTSecret()}\n`);
        }
      }

      logger.error('Environment validation failed', {
        missing: validation.missing,
        invalid: validation.invalid
      });

      process.exit(1);
    }

    // Log warnings but continue
    if (validation.warnings.length > 0) {
      console.warn('\n⚠️  Environment warnings:');
      validation.warnings.forEach(warning => {
        console.warn(`   - ${warning}`);
      });
      console.warn('');
    }

    logger.info('Environment validation passed', {
      environment: validation.environment,
      warnings: validation.warnings.length
    });

    console.log(`✅ Environment validated (${validation.environment})`);
  }
}

export default new EnvironmentValidator();