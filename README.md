# SikadVoltz Backend

Backend service for the SikadVoltz cycling training application, built with Node.js, Express, and MongoDB.

## Features

- RESTful API endpoints for user authentication and plan management
- WebSocket support for real-time features
- Request validation and error handling
- Environment-based configuration
- Comprehensive logging
- CORS support
- Health check endpoint

## Prerequisites

- Node.js 16.x or higher
- MongoDB 5.0 or higher
- npm 8.x or higher

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment (development/production) | development |
| MONGODB_URI | MongoDB connection string | mongodb://localhost:27017/sikadvoltz |
| JWT_SECRET | Secret for JWT token signing | your_jwt_secret_key_here |
| JWT_EXPIRES_IN | JWT token expiration | 7d |
| ALLOWED_ORIGINS | Comma-separated list of allowed origins | http://localhost:8080 |
| LOG_LEVEL | Logging level (error, warn, info, http, verbose, debug, silly) | info |

## API Documentation

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Plans

- `POST /api/plans` - Create a new training plan
- `GET /api/plans/current` - Get current user's plan
- `POST /api/plans/:id/sessions` - Record a training session
- `POST /api/plans/:id/missed` - Record a missed session

### Health Check

- `GET /health` - Health check endpoint

## WebSocket

The WebSocket server runs on the same port as the HTTP server. Connect using `ws://localhost:3000`.

## Logging

Logs are stored in the `logs/` directory:
- `error.log` - Error level logs
- `combined.log` - All logs

In development mode, logs are also output to the console with colors.

## Development

- `npm run dev` - Start development server with hot-reload
- `npm start` - Start production server
- `npm test` - Run tests (coming soon)
- `npm run lint` - Lint code (coming soon)

## Production Deployment

1. Set `NODE_ENV=production`
2. Update `.env` with production values
3. Install production dependencies:
   ```bash
   npm ci --only=production
   ```
4. Start the server:
   ```bash
   npm start
   ```

## License

MIT
