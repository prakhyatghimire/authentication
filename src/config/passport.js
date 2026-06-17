import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { prisma } from './db.js';

const oauthUserSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    avatar_url: true,
    is_email_verified: true,
    created_at: true
};

const upsertOAuthUser = async ({ provider, providerId, email, username, avatarUrl }) => {
    if (!email) {
        throw new Error(`${provider} account did not provide an email address`);
    }

    const existing = await prisma.user.findFirst({
        where: {
            OR: [
                { email },
                {
                    auth_provider: provider,
                    provider_id: providerId
                }
            ]
        },
        select: { id: true }
    });

    if (existing) {
        const result = await prisma.user.update({
            where: { id: existing.id },
            data: {
                auth_provider: provider,
                provider_id: providerId,
                ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
                is_email_verified: true,
                last_login_at: new Date()
            },
            select: oauthUserSelect
        });

        return result;
    }

    const result = await prisma.user.create({
        data: {
            username,
            email,
            role: 'user',
            avatar_url: avatarUrl,
            auth_provider: provider,
            provider_id: providerId,
            is_email_verified: true,
            last_login_at: new Date()
        },
        select: oauthUserSelect
    });

    return result;
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
