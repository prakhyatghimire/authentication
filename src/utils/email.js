import nodemailer from 'nodemailer';

const requiredMailConfig = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

const hasMailConfig = () => requiredMailConfig.every((key) => Boolean(process.env[key]));

const createTransporter = () => {
    if (!hasMailConfig()) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

export const sendEmail = async ({ to, subject, html, text }) => {
    const transporter = createTransporter();

    if (!transporter) {
        console.warn(`Email not sent to ${to}: SMTP environment variables are missing.`);
        return { skipped: true };
    }

    return transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        html,
        text
    });
};

export const sendPasswordResetEmail = async (email, resetUrl) => {
    return sendEmail({
        to: email,
        subject: 'Reset your password',
        text: `Reset your password using this link: ${resetUrl}`,
        html: `<p>Use the link below to reset your password.</p><p><a href="${resetUrl}">Reset password</a></p>`
    });
};

export const sendVerificationEmail = async (email, verificationUrl) => {
    return sendEmail({
        to: email,
        subject: 'Verify your email address',
        text: `Verify your email using this link: ${verificationUrl}`,
        html: `<p>Use the link below to verify your email address.</p><p><a href="${verificationUrl}">Verify email</a></p>`
    });
};
