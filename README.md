<<<<<<< HEAD
# SikadVoltz Backend Server

## 🚀 Overview

SikadVoltz backend is a comprehensive Node.js/Express server that powers the SikadVoltz fitness cycling application. It provides secure APIs for user authentication, workout tracking, real-time telemetry, and password reset functionality.

## 🏗️ Architecture

### Core Components
- **Authentication**: JWT-based secure authentication system
- **Password Reset**: Complete forgot password system with email integration
- **Real-time Communication**: WebSocket support for live telemetry
- **Database**: MongoDB integration with Mongoose ODM
- **Email Service**: Gmail SMTP integration for notifications

### Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB Atlas
- **Session Storage**: Redis (with memory fallback)
- **Authentication**: JWT tokens
- **Email**: Nodemailer with Gmail SMTP
- **Validation**: express-validator
- **Logging**: Winston logger

## 📁 Project Structure

```
sv_backend/
├── controllers/          # Request handlers and business logic
├── middleware/           # Express middleware
├── scripts/              # Setup and maintenance scripts
│   ├── redis-setup.js    # Redis initialization
│   └── redis-health-check.js # Redis testing
├── migrations/           # Database migration scripts
├── models/              # Mongoose data models
├── routes/              # API route definitions
├── scripts/             # Database setup and utility scripts
├── services/            # Business logic and external integrations
├── utils/               # Utility functions
├── index.js             # Main application entry point
└── package.json         # Dependencies and scripts
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js 18+ installed
- MongoDB Atlas account or local MongoDB instance
- Gmail account for email services

### Environment Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with required variables
4. Run database migrations

## 🚀 Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout

### Password Reset
- `POST /api/password-reset/forgot-password` - Request password reset
- `POST /api/password-reset/verify-reset-token` - Verify reset token
- `POST /api/password-reset/reset-password` - Reset password
- `GET /api/password-reset/reset-status/:token` - Check reset status
- `POST /api/password-reset/resend-reset` - Resend reset email

### User Management
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `POST /api/health-screening` - Health screening data

### Workout & Plans
- `GET /api/plans` - Get cycling plans
- `POST /api/plans` - Create cycling plan
- `GET /api/workout-history` - Get workout history
- `POST /api/workout-history` - Save workout session

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt password encryption
- **Rate Limiting**: API rate limiting for security
- **Input Validation**: Request validation middleware
- **CORS Configuration**: Cross-origin resource sharing setup
- **Token Blacklisting**: Logout token invalidation
- **Password Reset Security**: Time-limited, single-use reset tokens

## 🗄️ Redis Session Management (Phase 1 Optimization)

Scalable session storage using Redis with automatic fallback to memory storage.

### Quick Setup
```bash
# Start Redis (Docker)
npm run redis:up

# Test Redis connection
npm run redis:test

# Initialize Redis
npm run redis:setup
```

### Environment Configuration
```env
REDIS_URL=redis://localhost:6379
```

### Features
- ✅ Horizontal session scaling
- ✅ Session persistence across server restarts
- ✅ Automatic fallback to memory storage
- ✅ Production-ready configuration
- ✅ Zero breaking changes

See `REDIS_SETUP.md` and `REDIS_PRODUCTION_GUIDE.md` for detailed documentation.

## 📧 Email Integration

The server includes comprehensive email functionality with Gmail SMTP integration and professional HTML templates.

See `GMAIL_SETUP_GUIDE.md` for detailed email configuration instructions.

## 🛠️ Password Reset System

Complete password reset functionality with secure token generation, email delivery, rate limiting, and audit logging.

See `PASSWORD_RESET_API_DOCS.md` and `PASSWORD_RESET_SETUP.md` for detailed documentation.

## 📝 License

This project is licensed under the terms specified in the LICENSE file.

---

**SikadVoltz Backend** - Powering the future of fitness cycling technology.
=======
# sikadVoltz
>>>>>>> 814a1b788c35fc4e960a13311c32f9e39e789a64
