#!/bin/bash
# Render Build Script for Ultra-Secure Deployment

echo "🔒 Building ultra-secure SikadVoltz backend..."

# Build using distroless Dockerfile
docker build -f Dockerfile.distroless -t sikadvoltz-backend .

echo "✅ Ultra-secure image built successfully!"
echo "🛡️ Security features enabled:"
echo "   - No shell access"
echo "   - No package manager"
echo "   - Minimal attack surface"
echo "   - Google-maintained base image"
echo "   - Enterprise-grade security"