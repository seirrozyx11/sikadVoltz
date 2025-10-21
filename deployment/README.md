# SikadVoltz Backend - Production Deployment Guide

##  Load Balancing & High Availability Setup

### Quick Start Commands

```bash
# 1. Start all services with monitoring
docker-compose -f deployment/docker-compose.prod.yml --profile monitoring up -d

# 2. Scale backend instances
docker-compose -f deployment/docker-compose.prod.yml up -d --scale backend1=2 --scale backend2=2

# 3. Check service health
docker-compose -f deployment/docker-compose.prod.yml ps

# 4. View logs
docker-compose -f deployment/docker-compose.prod.yml logs -f nginx backend1
```

##  Pre-Deployment Checklist

### 1. Environment Variables
Create `.env.production` file:
```bash
# Database
MONGODB_URI=mongodb://mongodb:27017/sikadvoltz
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your_secure_password

# Redis
REDIS_URL=redis://redis:6379

# Security
JWT_SECRET=your_super_secure_jwt_secret_256_bits_minimum

# Email
SENDGRID_API_KEY=your_sendgrid_api_key

# OAuth
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Monitoring
MONGO_EXPRESS_PASSWORD=your_admin_password
```

### 2. SSL Certificates
```bash
# Create SSL directory
mkdir -p ssl/

# Add your certificates
cp your_certificate.crt ssl/
cp your_private.key ssl/
# Or use Let's Encrypt
certbot certonly --webroot --webroot-path /var/www/html -d api.sikadvoltz.com
```

### 3. Update Configuration Files
- **Nginx**: Update `deployment/nginx.conf` with your domain
- **HAProxy**: Update `deployment/haproxy.cfg` with your domain
- **Docker**: Update `deployment/docker-compose.prod.yml` with your settings

## 🔧 Deployment Options

### Option 1: Nginx Load Balancer (Recommended)
```bash
# Start with Nginx
docker-compose -f deployment/docker-compose.prod.yml up -d

# Scale backend instances
docker-compose -f deployment/docker-compose.prod.yml up -d --scale backend1=3
```

### Option 2: HAProxy Load Balancer
```bash
# Replace nginx service in docker-compose.yml with:
# haproxy:
#   image: haproxy:alpine
#   volumes:
#     - ./deployment/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro

# Start with HAProxy
docker-compose -f deployment/docker-compose.prod.yml up -d
```

### Option 3: Manual Server Deployment
```bash
# On each server instance
npm run build
NODE_ENV=production PORT=3000 npm start &
NODE_ENV=production PORT=3001 npm start &
NODE_ENV=production PORT=3002 npm start &

# Configure external load balancer (AWS ALB, GCP Load Balancer, etc.)
```

##  Performance Monitoring

### Health Check Endpoints
- **Backend Health**: `https://api.sikadvoltz.com/health`
- **Nginx Status**: `https://admin.sikadvoltz.com/nginx_status`
- **HAProxy Stats**: `https://api.sikadvoltz.com:8404/stats`

### Monitoring Dashboards
- **Redis Insight**: `http://localhost:8001`
- **MongoDB Express**: `http://localhost:8081`
- **Application Logs**: `docker-compose logs -f backend1`

### Performance Metrics
```bash
# Check CPU/Memory usage
docker stats

# Monitor response times
curl -w "@curl-format.txt" -o /dev/null -s "https://api.sikadvoltz.com/health"

# Database performance
mongosh --eval "db.serverStatus()"
redis-cli info stats
```

## Security Configuration

### 1. Firewall Rules
```bash
# Allow only necessary ports
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw deny 3000   # Block direct backend access
ufw deny 6379   # Block direct Redis access
ufw deny 27017  # Block direct MongoDB access
```

### 2. Rate Limiting
- **API Endpoints**: 10 requests/second/IP
- **Authentication**: 5 requests/second/IP
- **File Uploads**: 2 requests/second/IP
- **ESP32 Telemetry**: 50 requests/second/IP

### 3. SSL/TLS Configuration
- **TLS 1.2+ Only**
- **HSTS Headers**
- **Perfect Forward Secrecy**
- **Certificate Pinning**

##  Troubleshooting

### Common Issues

1. **Backend Instance Down**
   ```bash
   # Check health
   docker exec sikadvoltz-backend-1 curl localhost:3000/health
   
   # Restart instance
   docker-compose restart backend1
   ```

2. **High Memory Usage**
   ```bash
   # Check memory stats
   docker stats
   
   # Scale down if needed
   docker-compose up -d --scale backend1=1
   ```

3. **Database Connection Issues**
   ```bash
   # Check MongoDB connection
   docker exec sikadvoltz-mongodb mongosh --eval "db.adminCommand('ping')"
   
   # Check Redis connection
   docker exec sikadvoltz-redis redis-cli ping
   ```

4. **SSL Certificate Issues**
   ```bash
   # Verify certificate
   openssl x509 -in ssl/certificate.crt -text -noout
   
   # Test SSL
   curl -I https://api.sikadvoltz.com/health
   ```

### Performance Optimization

1. **Increase Backend Instances**
   ```bash
   docker-compose up -d --scale backend1=5 --scale backend2=5
   ```

2. **Redis Memory Optimization**
   ```bash
   # Check Redis memory usage
   docker exec sikadvoltz-redis redis-cli info memory
   
   # Optimize Redis config
   echo "maxmemory 256mb" >> deployment/redis.conf
   echo "maxmemory-policy allkeys-lru" >> deployment/redis.conf
   ```

3. **Database Indexing**
   ```bash
   # Run indexing script
   docker exec sikadvoltz-backend-1 node scripts/add-critical-indexes.js
   ```

## Scaling Guidelines

### Horizontal Scaling
- **Start with**: 3 backend instances
- **Scale up**: Add 2 instances per 1000 concurrent users
- **Monitor**: CPU < 70%, Memory < 80%

### Database Scaling
- **MongoDB**: Consider sharding at 100GB+ data
- **Redis**: Consider clustering at 8GB+ memory

### Load Balancer Scaling
- **Nginx**: Can handle 10,000+ concurrent connections
- **HAProxy**: Can handle 100,000+ concurrent connections

## Performance Targets (10/10 Score)

- **Response Time**: < 100ms (health check)
- **Throughput**: 1000+ requests/second
- **Uptime**: 99.9%+
- **Memory Usage**: < 512MB per instance
- **CPU Usage**: < 50% under normal load
- **Database Queries**: < 50ms average
- **WebSocket Connections**: 10,000+ concurrent

## 📞 Support

For deployment issues:
1. Check service logs: `docker-compose logs service_name`
2. Verify configuration files
3. Test individual components
4. Monitor resource usage
5. Review security settings

Remember to update all placeholder values with your actual configuration!