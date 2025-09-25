# Render Production Email Test Guide

## Overview
This guide provides step-by-step instructions to test the single-port SMTP configuration (587) on Render production environment after deployment.

## Deployment Status
✅ **DEPLOYED**: Single-port SMTP configuration pushed to GitHub and deploying to Render
- **Commit**: f4a57d0 - "Simplify: Use single-port SMTP configuration (587) as configured in Render"
- **Changes**: Simplified renderEmailService.js to use only EMAIL_PORT=587 as configured in Render environment

## Production Testing Endpoints

### 1. Configuration Check
```bash
curl -X GET https://your-render-app.onrender.com/api/email-test/config
```

**Expected Response:**
```json
{
  "configured": true,
  "service": "Gmail",
  "configuration": {
    "name": "Gmail TLS (Port 587)",
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "configuredInRender": true
  },
  "renderOptimized": false
}
```

### 2. Connection Test (Most Important)
```bash
curl -X POST https://your-render-app.onrender.com/api/email-test/connection
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Email configuration working: Gmail TLS (Port 587)",
  "configuration": "Gmail TLS (Port 587)",
  "duration": "1500ms",
  "timestamp": "2025-09-25T...",
  "renderOptimized": false,
  "recommendation": "Using configured port 587 as specified in Render environment",
  "hostingEnvironment": "Render Production",
  "configuredPort": "587"
}
```

**Expected Response (Failure):**
```json
{
  "success": false,
  "error": "Connection timeout after 15 seconds",
  "configuration": "Gmail TLS (Port 587)",
  "timestamp": "2025-09-25T...",
  "recommendation": "Check network connectivity, SMTP credentials, or Render firewall rules",
  "hostingEnvironment": "Render Production"
}
```

### 3. Test Email Send
```bash
curl -X POST https://your-render-app.onrender.com/api/email-test/send-test \
  -H "Content-Type: application/json" \
  -d '{"to": "your-email@gmail.com"}'
```

## Monitoring Render Logs

### 1. Access Render Dashboard
- Go to render.com dashboard
- Select your sikadvoltz backend service
- Click on "Logs" tab

### 2. Watch for Deployment
Look for deployment success messages:
```
==> Build successful 🎉
==> Deploying...
==> Deploy successful 🎉
```

### 3. Monitor Email Service Logs
Look for these log patterns after testing:

**Successful Connection:**
```
[INFO] Testing email connection using configured port 587...
[INFO] Testing email configuration: Gmail TLS (Port 587)
[INFO] Gmail TLS (Port 587) test successful in 1200ms
[INFO] Render email service configured with Gmail TLS (Port 587)
```

**Connection Failure:**
```
[INFO] Testing email connection using configured port 587...
[INFO] Testing email configuration: Gmail TLS (Port 587)
[ERROR] Gmail TLS (Port 587) test failed: Connection timeout after 15 seconds
[ERROR] Email service configuration failed
```

## Password Reset Testing

### 1. Trigger Real Password Reset
```bash
curl -X POST https://your-render-app.onrender.com/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test-user@gmail.com"}'
```

### 2. Check Response Time
- **Before Fix**: 15+ seconds with timeout errors
- **After Fix**: 2-5 seconds with successful delivery using configured port 587

### 3. Monitor Email Delivery
- Check that port 587 TLS connection works
- Verify email arrives within 30 seconds
- Confirm reset links work properly

## Performance Benchmarks

### Success Metrics
- **Connection Test**: < 3 seconds total
- **Port 587 Success**: TLS connection working in < 2 seconds
- **Email Delivery**: Password reset emails sent within 5 seconds

### Failure Indicators
- Port 587 timing out (network/firewall issue)
- Authentication errors (credential issue) 
- Connection refused (service issue)

## Troubleshooting

### If Port 587 Fails
1. Check Render environment variables:
   ```bash
   EMAIL_USER=sikadvoltz@gmail.com
   EMAIL_PASS=nqti vrru zfoc rnqp
   EMAIL_PORT=587
   ```

2. Verify Gmail App Password is still valid
3. Check Render firewall restrictions for port 587
4. Confirm TLS configuration is working

### If Performance is Still Slow
- Check Render server location vs Gmail servers
- Verify port 587 is not blocked by Render
- Consider alternative email services (SendGrid, etc.)
- Monitor for DNS resolution issues

## Next Steps After Testing

1. **Success**: Document results and monitor production usage
2. **Partial Success**: Fine-tune timeout values if needed
3. **Failure**: Investigate Render network restrictions or alternative solutions

---

**Testing Status**: 🔄 Ready for Production Testing
**Deploy Time**: After commit f4a57d0 deployment completes
**Priority**: High - This uses the explicitly configured port 587 in Render environment