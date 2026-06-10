// src/controllers/auth.controller.js
import { pool } from '../config/db.js';
import { hashPassword, comparePassword } from '../utils/hash.js';
import { generateToken } from '../utils/jwt.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import { z } from 'zod';

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

        const newUser = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, passwordHash]
        );

        const token = generateToken({
            id: newUser.rows[0].id,
            email: newUser.rows[0].email
        });

        res.status(201).json({
            message: 'User registered successfully',
            user: newUser.rows[0],
            token
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: error.errors.map(err => ({
                    code: err.code,
                    message: err.message,
                    path: err.path
                }))
            });
        }

        console.error('Registration error:', error.message);
        res.status(500).json({
            message: 'Internal server error during registration'
        });
    }
};

export const loginUser = async (req, res) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        const { email, password } = validatedData;

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        const user = result.rows[0];

        if (!user) {
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

        const token = generateToken({
            id: user.id,
            email: user.email
        });

        res.status(200).json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            token
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: error.errors.map(err => ({
                    code: err.code,
                    message: err.message,
                    path: err.path
                }))
            });
        }

        console.error('Login error:', error.message);
        res.status(500).json({
            message: 'Internal server error during login'
        });
    }
};