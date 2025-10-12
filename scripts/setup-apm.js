/**
 * APM Setup Script - Install and Configure Monitoring
 * 
 * This script helps set up Application Performance Monitoring
 * with either New Relic or DataDog.
 * 
 * Run: node scripts/setup-apm.js [newrelic|datadog]
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function installPackage(packageName) {
  console.log(`📦 Installing ${packageName}...`);
  try {
    execSync(`npm install ${packageName}`, { stdio: 'inherit' });
    console.log(`✅ ${packageName} installed successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to install ${packageName}:`, error.message);
    return false;
  }
}

function updateEnvFile(updates) {
  const envPath = '.env';
  let envContent = '';
  
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    console.log('📄 Creating new .env file...');
  }
  
  console.log('🔧 Updating .env file...');
  
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const newLine = `${key}=${value}`;
    
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, newLine);
      console.log(`  ✏️  Updated ${key}`);
    } else {
      envContent += `\n${newLine}`;
      console.log(`  ➕ Added ${key}`);
    }
  }
  
  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log('✅ Environment variables updated');
}

async function setupNewRelic() {
  console.log('\n🚀 Setting up New Relic APM...\n');
  
  // Install New Relic
  if (!installPackage('newrelic')) {
    return false;
  }
  
  // Get license key
  const licenseKey = await prompt('Enter your New Relic License Key: ');
  if (!licenseKey) {
    console.error('❌ License key is required');
    return false;
  }
  
  const appName = await prompt('Enter your application name (or press Enter for "SikadVoltz Backend"): ') || 'SikadVoltz Backend';
  
  // Update environment variables
  updateEnvFile({
    'NEW_RELIC_APP_NAME': appName,
    'NEW_RELIC_LICENSE_KEY': licenseKey,
  });
  
  console.log('\n✅ New Relic APM setup completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Restart your application');
  console.log('2. Generate some traffic to your API');
  console.log('3. Check your New Relic dashboard in 5-10 minutes');
  console.log('4. Configure alerts and notifications in New Relic UI');
  
  return true;
}

async function setupDataDog() {
  console.log('\n🐕 Setting up DataDog APM...\n');
  
  // Install DataDog
  if (!installPackage('dd-trace hot-shots')) {
    return false;
  }
  
  // Get API key
  const apiKey = await prompt('Enter your DataDog API Key: ');
  if (!apiKey) {
    console.error('❌ API key is required');
    return false;
  }
  
  const service = await prompt('Enter your service name (or press Enter for "sikadvoltz-backend"): ') || 'sikadvoltz-backend';
  const env = await prompt('Enter your environment (or press Enter for "production"): ') || 'production';
  const version = await prompt('Enter your version (or press Enter for "1.0.0"): ') || '1.0.0';
  
  // Update environment variables
  updateEnvFile({
    'DD_API_KEY': apiKey,
    'DD_SERVICE': service,
    'DD_ENV': env,
    'DD_VERSION': version,
  });
  
  // Update index.js to import DataDog tracer
  const indexPath = 'index.js';
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  
  if (!indexContent.includes('dd-trace')) {
    const newRelicImportRegex = /import '\.\/newrelic\.js';\s*\n/;
    const replacement = `// 📊 MONITORING: Initialize DataDog APM first (must be first import)
require('./config/datadog.js');

`;
    
    if (newRelicImportRegex.test(indexContent)) {
      indexContent = indexContent.replace(newRelicImportRegex, replacement);
    } else {
      indexContent = replacement + indexContent;
    }
    
    fs.writeFileSync(indexPath, indexContent);
    console.log('✅ Updated index.js with DataDog initialization');
  }
  
  console.log('\n✅ DataDog APM setup completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Install DataDog Agent on your server');
  console.log('2. Restart your application');  
  console.log('3. Generate some traffic to your API');
  console.log('4. Check your DataDog APM dashboard');
  console.log('5. Set up alerts and monitors in DataDog UI');
  
  return true;
}

async function setupCustomMetrics() {
  console.log('\n📊 Setting up custom metrics...\n');
  
  const metricsCode = `
// Custom APM metrics example
import { dogstatsd } from './config/datadog.js'; // For DataDog
// import newrelic from 'newrelic'; // For New Relic

// Example: Track API endpoint performance
app.use('/api', (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // DataDog metrics
    if (dogstatsd) {
      dogstatsd.timing('api.request.duration', duration, {
        endpoint: req.route?.path || req.path,
        method: req.method,
        status_code: res.statusCode
      });
      
      dogstatsd.increment('api.request.count', 1, {
        endpoint: req.route?.path || req.path,
        method: req.method,
        status_code: res.statusCode
      });
    }
    
    // New Relic metrics
    if (typeof newrelic !== 'undefined') {
      newrelic.recordMetric('Custom/API/RequestDuration', duration);
      newrelic.recordMetric('Custom/API/RequestCount', 1);
    }
  });
  
  next();
});

// Example: Track database operations
async function trackDatabaseOperation(operation, fn) {
  const startTime = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    // Track successful operations
    if (dogstatsd) {
      dogstatsd.timing('database.operation.duration', duration, {
        operation,
        status: 'success'
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Track failed operations
    if (dogstatsd) {
      dogstatsd.timing('database.operation.duration', duration, {
        operation,
        status: 'error'
      });
      dogstatsd.increment('database.operation.error', 1, { operation });
    }
    
    throw error;
  }
}
`;
  
  fs.writeFileSync('examples/custom-metrics.js', metricsCode);
  console.log('✅ Created custom metrics example at examples/custom-metrics.js');
}

async function main() {
  console.log('🎯 SikadVoltz Backend - APM Setup Tool\n');
  
  const args = process.argv.slice(2);
  let choice = args[0];
  
  if (!choice) {
    console.log('Choose your APM provider:');
    console.log('1. New Relic (Recommended for beginners)');
    console.log('2. DataDog (Advanced features)');
    console.log('3. Both (for comparison)');
    console.log('4. Custom metrics only\n');
    
    const input = await prompt('Enter your choice (1-4): ');
    choice = ['', 'newrelic', 'datadog', 'both', 'custom'][parseInt(input)] || 'newrelic';
  }
  
  let success = false;
  
  switch (choice) {
    case 'newrelic':
    case '1':
      success = await setupNewRelic();
      break;
      
    case 'datadog':
    case '2':
      success = await setupDataDog();
      break;
      
    case 'both':
    case '3':
      success = await setupNewRelic() && await setupDataDog();
      break;
      
    case 'custom':
    case '4':
      await setupCustomMetrics();
      success = true;
      break;
      
    default:
      console.error('❌ Invalid choice');
      process.exit(1);
  }
  
  if (success) {
    console.log('\n🎯 Performance Monitoring Benefits:');
    console.log('  • Real-time performance tracking');
    console.log('  • Automatic error detection and alerting');
    console.log('  • Database query performance monitoring');
    console.log('  • API endpoint response time tracking');
    console.log('  • Memory and CPU usage monitoring');
    console.log('  • Custom business metrics');
    console.log('  • Distributed tracing across services');
    
    console.log('\n📈 This will help achieve 10/10 backend score through:');
    console.log('  • Proactive performance optimization');
    console.log('  • Quick incident response');
    console.log('  • Data-driven scaling decisions');
    console.log('  • Enhanced reliability monitoring');
  }
  
  rl.close();
}

main().catch(console.error);