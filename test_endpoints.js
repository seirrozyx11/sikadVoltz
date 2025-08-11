// API Endpoint Testing Script
console.log('🧪 Testing SIKADVOLTZ Backend APIs...\n');

const BASE_URL = 'http://localhost:3000';

async function testEndpoint(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${BASE_URL}${endpoint}`, options);
        const result = await response.json();
        
        console.log(`✅ ${method} ${endpoint}`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(result, null, 2));
        console.log('');
        
        return { success: response.ok, data: result, status: response.status };
    } catch (error) {
        console.log(`❌ ${method} ${endpoint}`);
        console.log(`   Error: ${error.message}`);
        console.log('');
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('🔍 Testing Core Endpoints:\n');
    
    // 1. Health Check
    await testEndpoint('/health');
    
    // 2. Root endpoint
    await testEndpoint('/');
    
    // 3. WebSocket info
    await testEndpoint('/ws-info');
    
    // 4. Test calculation endpoint (without auth for now)
    await testEndpoint('/health/calculations');
    
    console.log('🎯 Ready for Frontend Integration!');
    console.log('📋 Key endpoints available:');
    console.log('   - Auth: POST /api/auth/register, /api/auth/login');
    console.log('   - Profile: GET/POST /api/profile');
    console.log('   - Plans: GET/POST /api/plans');
    console.log('   - Calories: GET/POST /api/calories');
    console.log('   - ESP32: POST /api/esp32/register, /api/esp32/telemetry');
}

// Run the tests
runTests().catch(console.error);
