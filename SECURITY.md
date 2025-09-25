# Security Implementation Guide

This document outlines the security measures implemented in the SikadVoltz backend server.

## 🔒 Security Features Implemented

### 1. Environment Variable Security
- **Strict validation** of required environment variables
- **Minimum length requirements** for JWT secrets (32+ characters)
- **Entropy validation** to ensure strong secrets
- **Fail-fast approach** if critical secrets are missing
- **No fallback secrets** in production code

### 2. Security Headers (Helmet.js)
- **Content Security Policy (CSP)** - Prevents XSS attacks
- **HTTP Strict Transport Security (HSTS)** - Forces HTTPS
- **X-Frame-Options** - Prevents clickjacking
- **X-Content-Type-Options** - Prevents MIME sniffing
- **X-XSS-Protection** - Additional XSS protection
- **Referrer Policy** - Controls referrer information
- **Hide X-Powered-By** - Removes server signature

### 3. Rate Limiting
- **API Rate Limiting**: 100 requests per 15 minutes (production)
- **Auth Rate Limiting**: 20 requests per 15 minutes for authentication
- **Password Reset Limiting**: 5 attempts per hour
- **Login Attempt Tracking**: Maximum 3 failed attempts per hour
- **Account Lockout**: 1-hour lockout after maximum attempts

### 4. Authentication Security
- **bcrypt Password Hashing** with salt rounds
- **JWT Token Management** with access/refresh token pattern
- **Token Blacklisting** for secure logout
- **Google OAuth Integration** with proper token validation
- **Session Security** with proper token expiration

### 5. HTTPS Enforcement
- **Automatic HTTPS redirect** in production
- **Secure Cookie Settings** (httpOnly, secure, sameSite)
- **Trust Proxy Configuration** for cloud deployment
- **HSTS Headers** for browser security

### 6. Input Validation
- **Express Validator** for all user inputs
- **MongoDB Schema Validation** 
- **Request Sanitization**
- **File Upload Security** (when applicable)

### 7. Monitoring & Logging
- **Security Event Logging** (failed logins, suspicious activity)
- **Rate Limit Breach Logging**
- **IP Address Tracking**
- **User Agent Analysis**
- **Suspicious Request Detection**

## 🚨 Critical Security Checklist

### Before Deployment:
- [ ] `.env` file is NOT in repository
- [ ] All environment variables are set in production
- [ ] JWT_SECRET is at least 32 characters with high entropy
- [ ] Database credentials are secure
- [ ] Google OAuth credentials are properly configured
- [ ] HTTPS is enabled and enforced
- [ ] Rate limiting is configured
- [ ] Security headers are active

### Regular Security Tasks:
- [ ] Monitor logs for suspicious activity
- [ ] Review rate limit hits
- [ ] Update dependencies regularly
- [ ] Rotate JWT secrets periodically
- [ ] Review and update CSP policies
- [ ] Monitor failed authentication attempts

## 🔧 Configuration

### Environment Variables Required:
```bash
# Database
MONGODB_URI=mongodb+srv://...

# JWT (CRITICAL - must be 32+ chars)
JWT_SECRET=your-super-secure-secret-minimum-32-characters
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_WEB_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...

# Email (for password reset)
EMAIL_USER=...
EMAIL_PASS=...
```

### Rate Limit Configuration:
- **API Endpoints**: 100 requests/15 minutes
- **Authentication**: 20 requests/15 minutes  
- **Password Reset**: 5 requests/hour
- **Login Attempts**: 3 failures/hour before lockout

### Security Headers:
All security headers are automatically configured via Helmet.js with production-optimized settings.

## 🚧 Development vs Production

### Development:
- CSP is in report-only mode
- Rate limits are more lenient
- HTTPS enforcement is disabled
- Debug logging is enabled

### Production:
- Full CSP enforcement
- Strict rate limiting
- Mandatory HTTPS
- Reduced logging verbosity

## 📞 Security Incident Response

If you suspect a security breach:

1. **Immediate Actions:**
   - Check logs for suspicious activity
   - Review recent authentication attempts
   - Check rate limit breaches

2. **Investigation:**
   - Analyze IP addresses and user agents
   - Review timeline of events
   - Check for data access patterns

3. **Response:**
   - Revoke compromised tokens
   - Reset affected user passwords
   - Update security measures if needed
   - Document the incident

## 🔄 Security Updates

Keep these packages updated regularly:
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT handling
- `express-validator` - Input validation

## 📚 Additional Resources

- [OWASP Security Guide](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/security/)
- [Express Security Guide](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)

---

**Last Updated**: September 2025  
**Security Level**: Enterprise Grade  
**Compliance**: OWASP Guidelines