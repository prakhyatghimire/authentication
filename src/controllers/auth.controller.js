import { pool } from '../config/db.js';
import { hashPassword, comparePassword } from '../utils/hash.js';
import { generateToken } from '../utils/jwt.js';
import {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema
} from '../validators/auth.validator.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../utils/email.js';
import { createSecureToken, getExpiryDate, hashToken } from '../utils/tokens.js';
import { z } from 'zod';

const publicUserFields = (user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatar_url,
    isEmailVerified: user.is_email_verified,
    createdAt: user.created_at
});

const validationErrors = (error) => error.issues || error.errors || [];

const buildUrl = (path, token) => {
    const baseUrl = process.env.CLIENT_URL || process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${baseUrl.replace(/\/$/, '')}${path}?token=${token}`;
};

const issueAuthResponse = (res, status, message, user) => {
    const token = generateToken(user);

    return res.status(status).json({
        message,
        user: publicUserFields(user),
        token
    });
};

export const registerUser = async (req, res) => {
    try {
        const validatedData = registerSchema.parse(req.body);
        const { username, email, password } = validatedData;

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: 'User with this email already exists'
            });
        }

        const passwordHash = await hashPassword(password);
        const verificationToken = createSecureToken();
        const verificationTokenHash = hashToken(verificationToken);

        const newUser = await pool.query(
            `INSERT INTO users (
                username, email, password, role, is_email_verified,
                email_verification_token, email_verification_expires
             )
             VALUES ($1, $2, $3, $4, false, $5, $6)
             RETURNING id, username, email, role, avatar_url, is_email_verified, created_at`,
            [username, email, passwordHash, 'user', verificationTokenHash, getExpiryDate(24 * 60)]
        );

        await sendVerificationEmail(email, buildUrl('/verify-email', verificationToken));

        return issueAuthResponse(res, 201, 'User registered successfully', newUser.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validationErrors(error)
            });
        }

        console.error('Registration error:', error.message);
        res.status(500).json({
            message: 'Internal server error during registration'
        });
    }
};

export const registerSuperAdmin = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({
                message: 'Only super admin can create new super admin accounts'
            });
        }

        const validatedData = registerSchema.parse(req.body);
        const { username, email, password } = validatedData;

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: 'User with this email already exists'
            });
        }

        const passwordHash = await hashPassword(password);

        const newUser = await pool.query(
            `INSERT INTO users (username, email, password, role, is_email_verified)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id, username, email, role, avatar_url, is_email_verified, created_at`,
            [username, email, passwordHash, 'super_admin']
        );

        await pool.query(
            `INSERT INTO role_audit_log (user_id, changed_by, old_role, new_role)
             VALUES ($1, $2, $3, $4)`,
            [newUser.rows[0].id, req.user.id, null, 'super_admin']
        );

        res.status(201).json({
            message: 'Super admin created successfully',
            user: publicUserFields(newUser.rows[0])
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validationErrors(error)
            });
        }

        console.error('Super admin registration error:', error.message);
        res.status(500).json({
            message: 'Internal server error'
        });
    }
};

export const loginUser = async (req, res) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        const { email, password } = validatedData;

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND is_active = true',
            [email]
        );

        const user = result.rows[0];

        if (!user || !user.password) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        const isMatch = await comparePassword(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        return issueAuthResponse(res, 200, 'Login successful', user);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validationErrors(error)
            });
        }

        console.error('Login error:', error.message);
        res.status(500).json({
            message: 'Internal server error during login'
        });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = forgotPasswordSchema.parse(req.body);
        const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

        if (user.rows.length > 0) {
            const resetToken = createSecureToken();
            await pool.query(
                `UPDATE users
                 SET reset_password_token = $1,
                     reset_password_expires = $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE email = $3`,
                [hashToken(resetToken), getExpiryDate(15), email]
            );

            await sendPasswordResetEmail(email, buildUrl('/reset-password', resetToken));
        }

        res.status(200).json({
            message: 'If an account exists for that email, a reset link has been sent.'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validationErrors(error)
            });
        }

        console.error('Forgot password error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token, password } = resetPasswordSchema.parse(req.body);
        const tokenHash = hashToken(token);

        const user = await pool.query(
            `SELECT id FROM users
             WHERE reset_password_token = $1
               AND reset_password_expires > CURRENT_TIMESTAMP`,
            [tokenHash]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        await pool.query(
            `UPDATE users
             SET password = $1,
                 reset_password_token = NULL,
                 reset_password_expires = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [await hashPassword(password), user.rows[0].id]
        );

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validationErrors(error)
            });
        }

        console.error('Reset password error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const verifyEmail = async (req, res) => {
    try {
        const token = req.body.token || req.query.token;

        if (!token) {
            return res.status(400).json({ message: 'Verification token is required' });
        }

        const result = await pool.query(
            `UPDATE users
             SET is_email_verified = true,
                 email_verification_token = NULL,
                 email_verification_expires = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE email_verification_token = $1
               AND email_verification_expires > CURRENT_TIMESTAMP
             RETURNING id, username, email, role, avatar_url, is_email_verified, created_at`,
            [hashToken(token)]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired verification token' });
        }

        res.status(200).json({
            message: 'Email verified successfully',
            user: publicUserFields(result.rows[0])
        });
    } catch (error) {
        console.error('Email verification error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const handleOAuthCallback = (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'OAuth authentication failed' });
    }

    const token = generateToken(req.user);

    if (process.env.OAUTH_SUCCESS_REDIRECT_URL) {
        const redirectUrl = new URL(process.env.OAUTH_SUCCESS_REDIRECT_URL);
        redirectUrl.searchParams.set('token', token);
        return res.redirect(redirectUrl.toString());
    }

    return res.status(200).json({
        message: 'OAuth login successful',
        user: publicUserFields(req.user),
        token
    });
};
