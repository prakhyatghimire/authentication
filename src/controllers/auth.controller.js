import { prisma } from '../config/db.js';
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

const publicUserSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    avatar_url: true,
    is_email_verified: true,
    created_at: true
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

        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true }
        });

        if (existingUser) {
            return res.status(409).json({
                message: 'User with this email already exists'
            });
        }

        const passwordHash = await hashPassword(password);
        const verificationToken = createSecureToken();
        const verificationTokenHash = hashToken(verificationToken);

        const newUser = await prisma.user.create({
            data: {
                username,
                email,
                password: passwordHash,
                role: 'user',
                is_email_verified: false,
                email_verification_token: verificationTokenHash,
                email_verification_expires: getExpiryDate(24 * 60)
            },
            select: publicUserSelect
        });

        await sendVerificationEmail(email, buildUrl('/verify-email', verificationToken));

        return issueAuthResponse(res, 201, 'User registered successfully', newUser);
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

        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true }
        });

        if (existingUser) {
            return res.status(409).json({
                message: 'User with this email already exists'
            });
        }

        const passwordHash = await hashPassword(password);

        const newUser = await prisma.user.create({
            data: {
                username,
                email,
                password: passwordHash,
                role: 'super_admin',
                is_email_verified: true,
                roleAuditLogs: {
                    create: {
                        changed_by: req.user.id,
                        old_role: null,
                        new_role: 'super_admin'
                    }
                }
            },
            select: publicUserSelect
        });

        res.status(201).json({
            message: 'Super admin created successfully',
            user: publicUserFields(newUser)
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

        const user = await prisma.user.findFirst({
            where: {
                email,
                is_active: true
            }
        });

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

        await prisma.user.update({
            where: { id: user.id },
            data: { last_login_at: new Date() }
        });

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
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true }
        });

        if (user) {
            const resetToken = createSecureToken();
            await prisma.user.update({
                where: { email },
                data: {
                    reset_password_token: hashToken(resetToken),
                    reset_password_expires: getExpiryDate(15)
                }
            });

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

        const user = await prisma.user.findFirst({
            where: {
                reset_password_token: tokenHash,
                reset_password_expires: {
                    gt: new Date()
                }
            },
            select: { id: true }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: await hashPassword(password),
                reset_password_token: null,
                reset_password_expires: null
            }
        });

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

        const user = await prisma.user.findFirst({
            where: {
                email_verification_token: hashToken(token),
                email_verification_expires: {
                    gt: new Date()
                }
            },
            select: { id: true }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired verification token' });
        }

        const result = await prisma.user.update({
            where: { id: user.id },
            data: {
                is_email_verified: true,
                email_verification_token: null,
                email_verification_expires: null
            },
            select: publicUserSelect
        });

        res.status(200).json({
            message: 'Email verified successfully',
            user: publicUserFields(result)
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
