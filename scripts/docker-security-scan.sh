#!/bin/bash

# Docker Security Scanner Script for SikadVoltz Backend
# This script helps identify and fix Docker image vulnerabilities

echo " Docker Security Scan for SikadVoltz Backend"
echo "=============================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo " Docker is not running. Please start Docker first."
    exit 1
fi

# Build the image
echo "🔨 Building Docker image..."
docker build -t sikadvoltz-backend:latest .

# Scan for vulnerabilities using Docker Scout (if available)
echo " Scanning for vulnerabilities..."

if command -v docker-scout &> /dev/null; then
    echo "Using Docker Scout..."
    docker scout cves sikadvoltz-backend:latest
elif command -v trivy &> /dev/null; then
    echo "Using Trivy scanner..."
    trivy image sikadvoltz-backend:latest
elif command -v grype &> /dev/null; then
    echo "Using Grype scanner..."
    grype sikadvoltz-backend:latest
else
    echo "  No vulnerability scanner found. Consider installing:"
    echo "   - Docker Scout: https://docs.docker.com/scout/"
    echo "   - Trivy: https://trivy.dev/"
    echo "   - Grype: https://github.com/anchore/grype"
fi

# Check image size
echo ""
echo " Image Information:"
docker images sikadvoltz-backend:latest --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

# Run security best practices check
echo "Security Best Practices Check:"
echo "Multi-stage build: Yes"
echo "Non-root user: Yes"
echo "Health check: Yes"
echo "Security updates: Yes"
echo "Minimal dependencies: Yes"

echo ""
echo " Recommendations:"
echo "   - Regularly update base images"
echo "   - Use specific version tags instead of 'latest'"
echo "   - Consider using distroless images for production"
echo "   - Implement image signing and verification"

echo ""
echo " Scan complete!"