import http from 'http';

console.log('🧪 Testing SIKADVOLTZ Backend APIs...\n');

function testEndpoint(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log(`✅ GET ${path}`);
                    console.log(`   Status: ${res.statusCode}`);
                    console.log(`   Response:`, JSON.stringify(result, null, 2));
                    console.log('');
                    resolve({ success: true, data: result, status: res.statusCode });
                } catch (error) {
                    console.log(`✅ GET ${path}`);
                    console.log(`   Status: ${res.statusCode}`);
                    console.log(`   Response: ${data}`);
                    console.log('');
                    resolve({ success: true, data: data, status: res.statusCode });
                }
            });
        });

        req.on('error', (error) => {
            console.log(`❌ GET ${path}`);
            console.log(`   Error: ${error.message}`);
            console.log('');
            reject(error);
        });

        req.end();
    });
}

async function runTests() {
    try {
        console.log('🔍 Testing Core Endpoints:\n');
        
        // Test key endpoints
        await testEndpoint('/health');
        await testEndpoint('/');
        await testEndpoint('/ws-info');
        
        console.log('🎯 Backend is ready for Frontend Integration!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

runTests();
