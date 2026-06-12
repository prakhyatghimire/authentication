import jwt from 'jsonwebtoken';

export const generateToken = (user) => {
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
        throw new Error('JWT_SECRET is not defined');
    }

    const payload = {
        id: user.id,
        email: user.email,
        role: user.role || 'user',
        username: user.username,
        roleLevel: getRoleLevel(user.role)
    };

    return jwt.sign(payload, secret, { expiresIn: '24h' });
};

const getRoleLevel = (role) => {
    const levels = {
        'user': 1,
        'moderator': 2,
        'super_admin': 3
    };
    return levels[role] || 1;
};

export const verifyToken = (token) => {
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
        throw new Error('JWT_SECRET is not defined');
    }

    try {
        return jwt.verify(token, secret);
    } catch (error) {
        throw error;
    }
};

export const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch (error) {
        return null;
    }
};