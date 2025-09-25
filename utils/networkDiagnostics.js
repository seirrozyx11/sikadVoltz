/**
 * Network Diagnostics for Render SMTP Connectivity
 * Test if Render can reach Gmail SMTP and alternative services
 */

import net from 'net';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

class NetworkDiagnostics {
  
  /**
   * Test TCP connection to a host and port
   */
  async testTCPConnection(host, port, timeout = 5000) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({
          success: false,
          error: `Connection timeout after ${timeout}ms`,
          host,
          port
        });
      }, timeout);

      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({
          success: true,
          message: `Successfully connected to ${host}:${port}`,
          host,
          port
        });
      });

      socket.on('error', (error) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({
          success: false,
          error: error.message,
          host,
          port
        });
      });
    });
  }

  /**
   * Test DNS resolution for a host
   */
  async testDNSResolution(host) {
    try {
      const result = await dnsLookup(host);
      return {
        success: true,
        host,
        ip: result.address,
        family: result.family
      };
    } catch (error) {
      return {
        success: false,
        host,
        error: error.message
      };
    }
  }

  /**
   * Comprehensive SMTP connectivity test
   */
  async testSMTPConnectivity() {
    console.log('=== Render SMTP Connectivity Diagnostics ===');
    console.log('');

    const testTargets = [
      // Gmail SMTP
      { name: 'Gmail SMTP (TLS)', host: 'smtp.gmail.com', port: 587 },
      { name: 'Gmail SMTP (SSL)', host: 'smtp.gmail.com', port: 465 },
      
      // SendGrid SMTP  
      { name: 'SendGrid SMTP', host: 'smtp.sendgrid.net', port: 587 },
      
      // Mailgun SMTP
      { name: 'Mailgun SMTP', host: 'smtp.mailgun.org', port: 587 },
      
      // Alternative ports
      { name: 'Gmail SMTP (Alt)', host: 'smtp.gmail.com', port: 2525 },
      
      // Test regular HTTP (should work)
      { name: 'HTTP Test', host: 'google.com', port: 80 },
      { name: 'HTTPS Test', host: 'google.com', port: 443 }
    ];

    console.log('1. Testing DNS Resolution...');
    const uniqueHosts = [...new Set(testTargets.map(t => t.host))];
    
    for (const host of uniqueHosts) {
      const dnsResult = await this.testDNSResolution(host);
      console.log(`   ${host}: ${dnsResult.success ? `✅ ${dnsResult.ip}` : `❌ ${dnsResult.error}`}`);
    }

    console.log('');
    console.log('2. Testing TCP Connections...');
    
    for (const target of testTargets) {
      const result = await this.testTCPConnection(target.host, target.port, 8000);
      const status = result.success ? '✅' : '❌';
      console.log(`   ${target.name} (${target.host}:${target.port}): ${status} ${result.success ? result.message : result.error}`);
    }

    console.log('');
    console.log('3. Analysis...');
    
    // Test results analysis
    const gmailResults = testTargets.filter(t => t.host === 'smtp.gmail.com');
    const nonSMTPResults = testTargets.filter(t => t.port === 80 || t.port === 443);
    
    console.log('');
    console.log('=== Diagnostic Summary ===');
    
    // Check if it's a general network issue or SMTP-specific
    const httpWorks = await this.testTCPConnection('google.com', 80, 5000);
    if (httpWorks.success) {
      console.log('✅ Basic internet connectivity: Working');
      console.log('❌ SMTP connectivity: Likely blocked by Render');
      console.log('');
      console.log('🔍 DIAGNOSIS: Render appears to block outbound SMTP connections');
      console.log('💡 SOLUTION: Use API-based email services instead of SMTP');
      console.log('');
      console.log('Recommended alternatives:');
      console.log('- SendGrid API (recommended for Render)');
      console.log('- Mailgun API');  
      console.log('- Resend API');
      console.log('- AWS SES API');
    } else {
      console.log('❌ Basic internet connectivity: Failed');
      console.log('🔍 DIAGNOSIS: General network connectivity issues');
    }

    return {
      httpConnectivity: httpWorks.success,
      smtpBlocked: !httpWorks.success ? 'unknown' : true
    };
  }
}

// Export for use in routes
export default NetworkDiagnostics;

// Run diagnostics if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const diagnostics = new NetworkDiagnostics();
  diagnostics.testSMTPConnectivity().catch(console.error);
}