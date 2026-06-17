import express from 'express';
import { 
    registerUser, 
    registerSuperAdmin,
    loginUser,
    forgotPassword,
    resetPassword,
    verifyEmail,
    handleOAuthCallback
} from '../controllers/auth.controller.js';
import passport from '../config/passport.js';

import {
    getAllUsers,
    updateUserRole,
    deleteUser,
    getUsersByRole,
    getRoleAuditLog,
    getRoleStatistics
} from '../controllers/admin.controller.js';

import { authenticate } from '../middlewares/auth.middleware.js';
import { 
    isSuperAdmin, 
    isModeratorOrHigher
} from '../middlewares/role.middleware.js';
import { authRateLimiter, passwordResetRateLimiter } from '../middlewares/rateLimit.middleware.js';

const router = express.Router();

const requireOAuthConfig = (provider) => (req, res, next) => {
    const providerKey = provider.toUpperCase();

    if (!process.env[`${providerKey}_CLIENT_ID`] || !process.env[`${providerKey}_CLIENT_SECRET`]) {
        return res.status(503).json({
            message: `${provider} OAuth is not configured`
        });
    }

    next();
};

// ========== PUBLIC ROUTES ==========
router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.post('/forgot-password', passwordResetRateLimiter, forgotPassword);
router.post('/reset-password', passwordResetRateLimiter, resetPassword);
router.post('/verify-email', authRateLimiter, verifyEmail);
router.get('/verify-email', authRateLimiter, verifyEmail);

// ========== OAUTH ROUTES ==========
router.get('/google', authRateLimiter, requireOAuthConfig('google'), passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
    '/google/callback',
    authRateLimiter,
    requireOAuthConfig('google'),
    passport.authenticate('google', { session: false, failureRedirect: '/api/auth/oauth/failure' }),
    handleOAuthCallback
);
router.get('/oauth-urls', (req, res) => {
    res.json({
        google: `${process.env.API_URL || 'http://localhost:3000'}/api/auth/google`,
        github: `${process.env.API_URL || 'http://localhost:3000'}/api/auth/github`
    });
});


router.get('/github', authRateLimiter, requireOAuthConfig('github'), passport.authenticate('github', { scope: ['user:email'] }));
router.get(
    '/github/callback',
    authRateLimiter,
    requireOAuthConfig('github'),
    passport.authenticate('github', { session: false, failureRedirect: '/api/auth/oauth/failure' }),
    handleOAuthCallback
);

router.get('/oauth/failure', (req, res) => {
    res.status(401).json({ message: 'OAuth authentication failed' });
});

// ========== SUPER ADMIN ONLY ROUTES ==========
// Create new super admin (requires existing super admin)
router.post('/register/super-admin', authenticate, isSuperAdmin, registerSuperAdmin);

// Role management
router.put('/users/:id/role', authenticate, isSuperAdmin, updateUserRole);
router.get('/audit-log', authenticate, isSuperAdmin, getRoleAuditLog);
router.get('/statistics/roles', authenticate, isSuperAdmin, getRoleStatistics);

// Delete any user (except self)
router.delete('/users/:id', authenticate, isSuperAdmin, deleteUser);

// ========== MODERATOR + SUPER ADMIN ROUTES ==========
// View users (moderators see limited, super admins see all)
router.get('/users', authenticate, isModeratorOrHigher, getAllUsers);
router.get('/users/role/:role', authenticate, isModeratorOrHigher, getUsersByRole);

// ========== PERMISSION-BASED ROUTES ==========
// Any authenticated user can access their own profile
router.get('/profile/me', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

export default router;
