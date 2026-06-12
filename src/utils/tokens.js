import crypto from 'crypto';

export const createSecureToken = () => crypto.randomBytes(32).toString('hex');

export const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

export const getExpiryDate = (minutes) => {
    return new Date(Date.now() + minutes * 60 * 1000);
};
