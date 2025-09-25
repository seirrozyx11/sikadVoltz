# SikadVoltz Backend - Render Deployment Guide

## 🚀 Render Environment Configuration

### Required Environment Variables

Set these in your Render service Environment tab:

```bash
# Server Configuration
NODE_ENV=production
PORT=10000  # Render uses port 10000 by default

# Database
MONGODB_URI=mongodb+srv://sln32166:eZxbTCNCIikJILkW@cluster0.gwbpaaz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

# JWT Security (MUST be 64+ character secure hex string)
JWT_SECRET=0c3d61b94be8d907167c298c0f9cb5d63edb34fbe059b730a9fb80754595939aaaf4305a5511a0dddf4fec8d6678a85e44ef21d923f1b3f1014dd0eefb0efffc
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_WEB_CLIENT_ID=388468876773-r9mhc5e79g94bgqpkc0mo2edq4apd0mf.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=388468876773-qpjpb0p8rq2t9ljs8lps20e304iunvln.apps.googleusercontent.com

# CORS (Production - Mobile Apps Only)
ALLOWED_ORIGINS=capacitor://localhost,ionic://localhost

# Email Configuration
EMAIL_USER=sikadvoltz.app@gmail.com
EMAIL_PASS=nqti vrru zfoc rnqp
EMAIL_FROM=sikadvoltz.app@gmail.com
EMAIL_PORT=587
EMAIL_HOST=smtp.gmail.com
FRONTEND_URL=https://sikadvoltz-backend.onrender.com

# Logging (Production)
LOG_LEVEL=info
```

## 🔧 Deployment Steps

### 1. Environment Setup
1. Go to Render Dashboard → Your Service → Environment
2. Add all environment variables listed above
3. **IMPORTANT**: Use the new JWT_SECRET provided above
4. Save and redeploy

### 2. Build Configuration
Render should automatically detect your Node.js app and use:
- **Build Command**: `npm install`
- **Start Command**: `npm start` or `node index.js`

### 3. Health Check
After deployment, test your endpoints:
```bash
# Health check
curl https://your-app-name.onrender.com/api/health

# Test login
curl -X POST https://your-app-name.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'
```

## 🔐 Security Notes

### JWT Secret Requirements
- **Minimum 32 characters** (we use 128 for extra security)
- **High entropy** (random hex string)
- **Never commit to Git** (use environment variables only)

### Production Security
- CORS restricted to mobile app origins only
- HTTPS enforced by Render automatically
- Rate limiting enabled for authentication endpoints
- Helmet.js security headers applied

## 🐛 Troubleshooting

### Common Issues

**1. JWT Validation Error**
```
Environment validation failed: JWT secret has low entropy
```
**Solution**: Use the new JWT_SECRET provided above

**2. Database Connection Error**
**Solution**: Verify MONGODB_URI is correct and MongoDB allows connections from Render IPs

**3. CORS Errors**
**Solution**: Check ALLOWED_ORIGINS includes your app's origin

**4. Email Not Working**
**Solution**: Verify Gmail App Password is correct (not regular password)

### Debug Environment
If you need to debug environment variables:
```bash
# In Render shell or logs
node scripts/validate-env.js
```

## 📝 Deployment Checklist

- [ ] All environment variables set in Render
- [ ] JWT_SECRET updated with secure 128-character hex string
- [ ] MongoDB URI configured and accessible
- [ ] Google OAuth credentials set
- [ ] Email configuration tested
- [ ] CORS origins configured for production
- [ ] Build and start commands verified
- [ ] Health check endpoint responding
- [ ] Authentication endpoints working
- [ ] Rate limiting functioning

## 🔄 Updates

When updating environment variables:
1. Go to Render Dashboard → Environment
2. Update the variable
3. **Manual redeploy required** (auto-deploy doesn't trigger on env changes)
4. Monitor logs for successful startup

## 📞 Support

If you encounter issues:
1. Check Render logs for specific error messages
2. Use the debug script: `node scripts/validate-env.js`
3. Verify all environment variables are set correctly
4. Test individual endpoints to isolate issues

---

**Last Updated**: September 21, 2025
**Render Service**: SikadVoltz Backend
**Node.js Version**: 22.x