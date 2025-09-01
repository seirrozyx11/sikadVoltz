# Gmail SMTP Configuration Guide for SikadVoltz

## 🔧 STEP-BY-STEP GMAIL SETUP

### Step 1: Enable 2-Factor Authentication

1. **Go to Google Account Settings**:
   - Visit: https://myaccount.google.com/
   - Click on "Security" in the left sidebar

2. **Enable 2-Step Verification**:
   - Scroll down to "2-Step Verification"
   - Click "Get started" and follow the setup process
   - Verify with your phone number
   - **✅ 2FA is now required for App Passwords**

### Step 2: Generate App Password

1. **Access App Passwords**:
   - Go to: https://myaccount.google.com/apppasswords
   - You may need to sign in again

2. **Create New App Password**:
   - Select app: "Mail"
   - Select device: "Other (custom name)"
   - Enter name: "SikadVoltz Backend"
   - Click "Generate"

3. **Copy the 16-Character Password**:
   - Google will display a 16-character password
   - **Copy this immediately** - it won't be shown again
   - Format: `abcd efgh ijkl mnop` (spaces will be removed)

### Step 3: Configure Environment Variables

Add these to your `.env` file in `sv_backend` folder:

```env
# Gmail SMTP Configuration
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop

# Email Settings
EMAIL_FROM_NAME=SikadVoltz Security
FRONTEND_URL=http://localhost:8082

# Password Reset Security
PASSWORD_RESET_JWT_SECRET=your-super-secure-reset-secret-key-here
PASSWORD_RESET_TOKEN_EXPIRY=15
```

### Step 4: Test Configuration

Run the email configuration test:
```bash
cd sv_backend
node test_email_config.js
```

## 🔒 SECURITY BEST PRACTICES

### App Password Security
- **Never share** your app password
- **Use different passwords** for different applications
- **Revoke unused** app passwords regularly
- **Monitor** email sending activity

### Environment Variable Security
- **Never commit** `.env` files to version control
- **Use different credentials** for development vs production
- **Rotate passwords** regularly
- **Restrict access** to environment variables

## 📧 EMAIL CONFIGURATION VALIDATION

### Expected Behavior
- **Connection**: SMTP connection should establish successfully
- **Authentication**: Gmail should accept the app password
- **Sending**: Test emails should be delivered
- **Templates**: HTML and text versions should render correctly

### Troubleshooting Common Issues

#### "Authentication failed"
- **Solution**: Regenerate app password
- **Check**: 2FA is enabled on Google account
- **Verify**: Username and password are correct

#### "Connection timeout"
- **Solution**: Check firewall settings
- **Verify**: Port 587 is not blocked
- **Try**: Different network connection

#### "Daily sending limit exceeded"
- **Solution**: Gmail has daily sending limits
- **Development**: Use test email addresses
- **Production**: Consider professional email service

## 🌐 PRODUCTION CONSIDERATIONS

### Gmail Limits
- **Daily limit**: 500 emails per day for free accounts
- **Rate limit**: 100 emails per hour
- **Recipient limit**: 500 recipients per message

### Alternative Services (Future)
- **SendGrid**: Professional email service
- **AWS SES**: Amazon email service
- **Mailgun**: Developer-focused email API

## 🧪 TESTING CHECKLIST

- [ ] 2FA enabled on Gmail account
- [ ] App password generated successfully
- [ ] Environment variables configured
- [ ] SMTP connection test passes
- [ ] Test email sent and received
- [ ] HTML template renders correctly
- [ ] Text fallback works
- [ ] Mobile email display verified

## 📱 MOBILE EMAIL TESTING

Test your reset emails on:
- [ ] iPhone Mail app
- [ ] Android Gmail app
- [ ] Outlook mobile
- [ ] Web Gmail interface

## 🎯 NEXT STEPS

After Gmail configuration:
1. **Run email tests** to verify functionality
2. **Test password reset flow** end-to-end
3. **Validate email templates** on multiple devices
4. **Prepare frontend integration** documentation

## 📞 SUPPORT

If you encounter issues:
1. **Check logs**: `logs/combined.log` for error details
2. **Verify credentials**: Test with Gmail directly
3. **Test network**: Ensure SMTP ports are open
4. **Review quotas**: Check Gmail sending limits

---

**Ready to configure Gmail? Let's test the email functionality!**
