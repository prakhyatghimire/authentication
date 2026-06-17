import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const buildDatabaseUrl = () => {
    const {
        DB_USER,
        DB_PASSWORD,
        DB_HOST = 'localhost',
        DB_PORT = '5432',
        DB_DATABASE
    } = process.env;

    if (!DB_USER || !DB_DATABASE) {
        return null;
    }

    const user = encodeURIComponent(DB_USER);
    const password = DB_PASSWORD ? `:${encodeURIComponent(DB_PASSWORD)}` : '';

    return `postgresql://${user}${password}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`;
};

if (!process.env.DATABASE_URL) {
    const databaseUrl = buildDatabaseUrl();

    if (databaseUrl) {
        process.env.DATABASE_URL = databaseUrl;
    }
}

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
