import { verifyToken } from '../utils/jwt.js';
import { prisma } from '../config/db.js';

const hydrateUser = async (token) => {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
            avatar_url: true,
            isBanned: true
        }
    });

    if (!user) {
        throw new Error('Invalid or expired token');
    }

    if (user.isBanned) {
        const error = new Error('Account suspended');
        error.statusCode = 403;
        throw error;
    }

    return {
        ...payload,
        ...user
    };
};

export const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];

    try {
        req.user = await hydrateUser(token);
        next();
    } catch (error) {
        return res.status(error.statusCode || 401).json({
            message: error.statusCode ? error.message : 'Invalid or expired token'
        });
    }
};

export const optionalAuthenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return next();
    }

    try {
        req.user = await hydrateUser(authHeader.split(' ')[1]);
    } catch (error) {
        req.user = null;
    }

    next();
};
