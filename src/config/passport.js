import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { pool } from './db.js';

const upsertOAuthUser = async ({ provider, providerId, email, username, avatarUrl }) => {
    if (!email) {
        throw new Error(`${provider} account did not provide an email address`);
    }

    const existing = await pool.query(
        'SELECT id, username, email, role, avatar_url, is_email_verified, created_at FROM users WHERE email = $1 OR (auth_provider = $2 AND provider_id = $3) LIMIT 1',
        [email, provider, providerId]
    );

    if (existing.rows.length > 0) {
        const result = await pool.query(
            `UPDATE users
             SET auth_provider = $1,
                 provider_id = $2,
                 avatar_url = COALESCE($3, avatar_url),
                 is_email_verified = true,
                 last_login_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING id, username, email, role, avatar_url, is_email_verified, created_at`,
            [provider, providerId, avatarUrl, existing.rows[0].id]
        );

        return result.rows[0];
    }

    const result = await pool.query(
        `INSERT INTO users (username, email, role, avatar_url, auth_provider, provider_id, is_email_verified, last_login_at)
         VALUES ($1, $2, 'user', $3, $4, $5, true, CURRENT_TIMESTAMP)
         RETURNING id, username, email, role, avatar_url, is_email_verified, created_at`,
        [username, email, avatarUrl, provider, providerId]
    );

    return result.rows[0];
};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value;
            const user = await upsertOAuthUser({
                provider: 'google',
                providerId: profile.id,
                email,
                username: profile.displayName || email?.split('@')[0],
                avatarUrl: profile.photos?.[0]?.value
            });

            done(null, user);
        } catch (error) {
            done(error, null);
        }
    }));
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/auth/github/callback',
        scope: ['user:email']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.find((item) => item.primary)?.value || profile.emails?.[0]?.value;
            const user = await upsertOAuthUser({
                provider: 'github',
                providerId: profile.id,
                email,
                username: profile.username || profile.displayName || email?.split('@')[0],
                avatarUrl: profile.photos?.[0]?.value
            });

            done(null, user);
        } catch (error) {
            done(error, null);
        }
    }));
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

export default passport;
