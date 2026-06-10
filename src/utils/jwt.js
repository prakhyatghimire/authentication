import jwt from "jsonwebtoken"; 

export function generateToken(payload) {  
  
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }
  if (!payload.id) {
    throw new Error('Payload must contain user id');
  }
  
  try {
    return jwt.sign(payload, secret, { expiresIn: "1h" });
  } catch (error) {
    throw new Error(`Token generation failed: ${error.message}`);
  }
}