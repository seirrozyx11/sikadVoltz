# Password Reset & Email Configuration for SikadVoltz

## Environment Variables Required

Add these variables to your `.env` file or environment configuration:

### Email Service Configuration (Gmail SMTP)
```
# Gmail account for sending emails
GMAIL_USER=your-email@gmail.com

# Gmail App Password (NOT your regular password)
# Generate at: https://myaccount.google.com/apppasswords
GMAIL_APP_PASSWORD=your-16-character-app-password

# Email sender display name
EMAIL_FROM_NAME=SikadVoltz Security

# Frontend URL for password reset links
FRONTEND_URL=http://localhost:8082
```

### Security Configuration
```
# JWT Secret for password reset tokens (should be different from auth JWT)
PASSWORD_RESET_JWT_SECRET=your-super-secure-reset-secret-key

# Token expiration time (in minutes)
PASSWORD_RESET_TOKEN_EXPIRY=15

# Rate limiting configuration
PASSWORD_RESET_MAX_ATTEMPTS_PER_HOUR=5
PASSWORD_RESET_MAX_ATTEMPTS_PER_DAY=10
```

## Gmail Setup Instructions

### 1. Enable 2-Factor Authentication
- Go to your Google Account settings
- Security → 2-Step Verification
- Turn on 2-Step Verification

### 2. Generate App Password
- Go to Google Account → Security
- 2-Step Verification → App passwords
- Select app: "Mail"
- Select device: "Other (custom name)" → "SikadVoltz Backend"
- Copy the 16-character password

### 3. Update Environment Variables
```
GMAIL_USER=youremail@gmail.com
GMAIL_APP_PASSWORD=abcd-efgh-ijkl-mnop
```

## API Endpoints

### Password Reset Flow

1. **Request Password Reset**
   ```
   POST /api/password-reset/forgot-password
   Content-Type: application/json
   
   {
     "email": "user@example.com"
   }
   ```

2. **Verify Reset Token**
   ```
   POST /api/password-reset/verify-reset-token
   Content-Type: application/json
   
   {
     "token": "reset-token-from-email"
   }
   ```

3. **Reset Password**
   ```
   POST /api/password-reset/reset-password
   Content-Type: application/json
   
   {
     "token": "reset-token-from-email",
     "newPassword": "newSecurePassword123"
   }
   ```

4. **Check Reset Status**
   ```
   GET /api/password-reset/reset-status/your-reset-token
   ```

5. **Resend Reset Email**
   ```
   POST /api/password-reset/resend-reset
   Content-Type: application/json
   
   {
     "email": "user@example.com"
   }
   ```

## Security Features

### Rate Limiting
- Progressive delays: First attempt instant, subsequent attempts have increasing delays
- Per-IP and per-email rate limiting
- Automatic lockout after suspicious activity

### Token Security
- Cryptographically secure random tokens
- JWT-based verification with expiration
- Single-use tokens (invalidated after use)
- Token blacklisting for extra security

### Email Security
- Professional responsive HTML templates
- Dark mode support
- Security warnings for suspicious activity
- Email anonymization in logs

### Monitoring & Logging
- Comprehensive security event logging
- IP address tracking
- Failed attempt monitoring
- Suspicious activity detection

## Testing

### Test Email Configuration
```bash
curl -X POST http://localhost:3000/api/password-reset/test-email
```

### Test Password Reset Flow
```bash
# 1. Request reset
curl -X POST http://localhost:3000/api/password-reset/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 2. Check email for reset link and token
# 3. Reset password with token
curl -X POST http://localhost:3000/api/password-reset/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"your-token","newPassword":"NewPassword123"}'
```

## Frontend Integration

### Reset Password Form
```javascript
// Request password reset
const requestReset = async (email) => {
  const response = await fetch('/api/password-reset/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  return response.json();
};

// Reset password with token
const resetPassword = async (token, newPassword) => {
  const response = await fetch('/api/password-reset/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword })
  });
  return response.json();
};
```

## Deployment Notes

### Render Configuration
Add environment variables in Render dashboard:
- Settings → Environment → Add Environment Variable
- Add all required email and security variables

### Production Security
- Use strong, unique JWT secrets
- Monitor rate limiting logs
- Set up email delivery monitoring
- Consider additional authentication factors

## Troubleshooting

### Common Issues

1. **"Email service not configured"**
   - Check GMAIL_USER and GMAIL_APP_PASSWORD are set
   - Verify App Password is correct (16 characters)

2. **"Authentication failed"**
   - Regenerate Gmail App Password
   - Ensure 2FA is enabled on Gmail account

3. **"Token expired"**
   - Tokens expire in 15 minutes by default
   - Request new reset link

4. **Rate limiting triggered**
   - Wait for cooldown period
   - Check logs for suspicious activity

### Debug Commands
```bash
# Check environment variables
npm run debug-env

# Test email service
npm run test-email

# View password reset logs
tail -f logs/combined.log | grep "password-reset"
```
