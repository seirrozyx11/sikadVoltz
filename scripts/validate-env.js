#!/usr/bin/env node

/**
 * Environment Validation Debug Script
 * 
 * This script helps debug environment variable issues
 * Usage: node scripts/validate-env.js
 */

import dotenv from 'dotenv';
import environmentValidator from '../utils/environmentValidator.js';

// Load environment variables
dotenv.config();

console.log('🔧 Environment Validation Debug Tool\n');

// Show loaded environment
console.log(' Loaded Environment Variables:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   PORT: ${process.env.PORT || 'not set'}`);
console.log(`   MONGODB_URI: ${process.env.MONGODB_URI ? 'set' : ' not set'}`);
console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? `set (${process.env.JWT_SECRET.length} chars)` : ' not set'}`);
console.log(`   GOOGLE_WEB_CLIENT_ID: ${process.env.GOOGLE_WEB_CLIENT_ID ? 'set' : ' not set'}`);
console.log(`   EMAIL_USER: ${process.env.EMAIL_USER ? 'set' : ' not set'}`);
console.log('');

// Validate
const result = environmentValidator.validate();

console.log(' Validation Result:');
console.log(`   Valid: ${result.valid ? 'YES' : ' NO'}`);
console.log(`   Environment: ${result.environment}`);
console.log('');

if (result.missing.length > 0) {
  console.log(' Missing Variables:');
  result.missing.forEach(var_ => console.log(`   - ${var_}`));
  console.log('');
}

if (result.invalid.length > 0) {
  console.log(' Invalid Variables:');
  result.invalid.forEach(({ variable, reason, requirement }) => {
    console.log(`   - ${variable}: ${reason}`);
    console.log(`     Requirement: ${requirement}`);
  });
  console.log('');
}

if (result.warnings.length > 0) {
  console.log('  Warnings:');
  result.warnings.forEach(warning => console.log(`   - ${warning}`));
  console.log('');
}

// JWT Secret analysis
if (process.env.JWT_SECRET) {
  console.log('JWT Secret Analysis:');
  const secret = process.env.JWT_SECRET;
  const chars = {};
  for (let char of secret) {
    chars[char] = (chars[char] || 0) + 1;
  }
  
  const length = secret.length;
  let entropy = 0;
  for (let count of Object.values(chars)) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }
  
  const isHex = /^[a-fA-F0-9]+$/.test(secret);
  
  console.log(`   Length: ${length} characters`);
  console.log(`   Entropy: ${entropy.toFixed(3)}`);
  console.log(`   Unique chars: ${Object.keys(chars).length}`);
  console.log(`   Type: ${isHex ? 'Hex string' : 'Mixed characters'}`);
  console.log(`   Security: ${entropy >= (isHex ? 3.8 : 4.0) ? 'Good' : ' Weak'}`);
  console.log('');
}

if (result.valid) {
  console.log(' Environment validation passed! Server can start safely.');
} else {
  console.log(' Environment validation failed! Please fix the issues above.');
  process.exit(1);
}