import jwt from 'jsonwebtoken';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // 🔒 SECURITY: No fallback - validated by environmentValidator
    req.user = decoded;
    console.log('Decoded payload:', decoded);
    next();
  } catch (err) {
    console.error('JWT Verify Error:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export default authenticateToken;
