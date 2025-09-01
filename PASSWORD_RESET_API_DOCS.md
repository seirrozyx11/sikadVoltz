# SikadVoltz Password Reset API Documentation

## 🚀 API Endpoints for Frontend Integration

### Base URL
- **Development**: `http://localhost:3000`
- **Production**: `https://sikadvoltz-backend.onrender.com`

## 📋 Password Reset API Endpoints

### 1. Request Password Reset

**Endpoint**: `POST /api/password-reset/forgot-password`

**Description**: Request a password reset for a user account

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "If an account exists, a password reset email has been sent",
  "delay": 0
}
```

**Rate Limiting**: Progressive delays for repeated requests

**Security Features**:
- Generic response (doesn't reveal if email exists)
- Progressive rate limiting
- IP tracking and suspicious activity detection

---

### 2. Verify Reset Token

**Endpoint**: `POST /api/password-reset/verify-reset-token`

**Description**: Verify if a password reset token is valid

**Request Body**:
```json
{
  "token": "reset-token-from-email"
}
```

**Response**:
```json
{
  "success": true,
  "valid": true,
  "message": "Token is valid",
  "expiresAt": "2025-09-02T15:30:00.000Z"
}
```

**Error Response**:
```json
{
  "success": false,
  "valid": false,
  "message": "Invalid or expired token"
}
```

---

### 3. Reset Password

**Endpoint**: `POST /api/password-reset/reset-password`

**Description**: Complete the password reset with a new password

**Request Body**:
```json
{
  "token": "reset-token-from-email",
  "newPassword": "newSecurePassword123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

**Password Requirements**:
- Minimum 8 characters
- At least one letter and one number
- Special characters recommended

---

### 4. Check Reset Status

**Endpoint**: `GET /api/password-reset/reset-status/:token`

**Description**: Check the status of a password reset token

**URL Parameters**:
- `token`: The password reset token

**Response**:
```json
{
  "success": true,
  "status": "valid",
  "expiresAt": "2025-09-02T15:30:00.000Z",
  "timeRemaining": "14 minutes"
}
```

**Status Values**:
- `valid`: Token is valid and can be used
- `expired`: Token has expired
- `used`: Token has already been used
- `invalid`: Token doesn't exist or is malformed

---

### 5. Resend Reset Email

**Endpoint**: `POST /api/password-reset/resend-reset`

**Description**: Resend the password reset email

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "If an account exists, a new password reset email has been sent",
  "delay": 1000
}
```

## 🔒 Security Features

### Rate Limiting
- **Progressive Delays**: Increasing delays for repeated attempts
- **IP-based Limiting**: Per-IP address restrictions
- **Email-based Limiting**: Per-email address restrictions

### Token Security
- **Expiration**: Tokens expire in 15 minutes
- **Single Use**: Tokens are invalidated after use
- **Cryptographic Security**: 64-byte secure random tokens
- **JWT Verification**: Server-side token validation

### Privacy Protection
- **Generic Responses**: Don't reveal if email exists
- **Email Anonymization**: Logs don't contain full email addresses
- **Suspicious Activity Detection**: Automatic risk assessment

## 📱 Frontend Integration Guide

### Flutter/Dart Example

```dart
class PasswordResetService {
  static const String baseUrl = 'http://localhost:3000';
  
  // Request password reset
  static Future<Map<String, dynamic>> requestReset(String email) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/password-reset/forgot-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email}),
    );
    return jsonDecode(response.body);
  }
  
  // Verify reset token
  static Future<Map<String, dynamic>> verifyToken(String token) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/password-reset/verify-reset-token'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'token': token}),
    );
    return jsonDecode(response.body);
  }
  
  // Reset password
  static Future<Map<String, dynamic>> resetPassword(String token, String newPassword) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/password-reset/reset-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'token': token,
        'newPassword': newPassword,
      }),
    );
    return jsonDecode(response.body);
  }
}
```

### JavaScript Example

```javascript
class PasswordResetAPI {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }
  
  async requestReset(email) {
    const response = await fetch(`${this.baseUrl}/api/password-reset/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return response.json();
  }
  
  async verifyToken(token) {
    const response = await fetch(`${this.baseUrl}/api/password-reset/verify-reset-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return response.json();
  }
  
  async resetPassword(token, newPassword) {
    const response = await fetch(`${this.baseUrl}/api/password-reset/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    return response.json();
  }
}
```

## 🎯 User Flow Implementation

### 1. Forgot Password Screen
- Input field for email address
- Submit button that calls `/forgot-password`
- Display generic success message
- Handle rate limiting delays

### 2. Password Reset Email
- User receives professional HTML email
- Email contains secure reset link
- Link format: `{FRONTEND_URL}/reset-password?token={TOKEN}`

### 3. Reset Password Screen
- Extract token from URL parameters
- Verify token validity with `/verify-reset-token`
- Show password input fields
- Submit new password with `/reset-password`

### 4. Success Confirmation
- Display success message
- Redirect to login screen
- Optional: Auto-login the user

## ⚠️ Error Handling

### Common Error Responses

**Invalid Token** (400):
```json
{
  "success": false,
  "error": "Invalid token",
  "message": "The reset token is invalid or has expired"
}
```

**Rate Limited** (429):
```json
{
  "success": false,
  "error": "Rate limited",
  "message": "Too many attempts. Please wait before trying again.",
  "retryAfter": 60
}
```

**Validation Error** (422):
```json
{
  "success": false,
  "error": "Validation failed",
  "message": "Password must be at least 8 characters",
  "details": [
    {
      "field": "newPassword",
      "message": "Password too short"
    }
  ]
}
```

## 🧪 Testing Endpoints

### Health Check
**GET** `/health` - Server health status

### API Info
**GET** `/` - API information and available endpoints

### WebSocket Info
**GET** `/ws-info` - WebSocket connection information

## 📊 Monitoring and Analytics

### Logs
- All password reset events are logged
- IP addresses are tracked (anonymized in logs)
- Failed attempts are monitored
- Email delivery status is recorded

### Metrics
- Reset request frequency
- Success/failure rates
- Email delivery rates
- Token expiration patterns

## 🚀 Production Deployment

### Environment Variables
Required for production deployment:

```env
# Email Configuration
GMAIL_USER=your-production-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
EMAIL_FROM_NAME=SikadVoltz Security
FRONTEND_URL=https://your-app-url.com

# Security
PASSWORD_RESET_JWT_SECRET=production-secret-key
PASSWORD_RESET_TOKEN_EXPIRY=15

# Monitoring
LOG_LEVEL=info
```

### CORS Configuration
Update `ALLOWED_ORIGINS` in environment variables for production domains.

## 📞 Support and Troubleshooting

### Common Issues
1. **Email not received**: Check spam folder, verify Gmail configuration
2. **Token expired**: Tokens expire in 15 minutes for security
3. **Rate limiting**: Wait for cooldown period before retry
4. **Invalid password**: Check password requirements

### Debug Information
- Check server logs at `/logs/combined.log`
- Use `/health` endpoint to verify server status
- Test email configuration with provided testing tools

---

**API Version**: 1.0.0  
**Last Updated**: September 2, 2025  
**Documentation**: Phase 3 Complete - Ready for Frontend Integration
