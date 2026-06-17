const { spawnSync } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

if (!process.env.DATABASE_URL && process.env.DB_USER && process.env.DB_DATABASE) {
    const user = encodeURIComponent(process.env.DB_USER);
    const password = process.env.DB_PASSWORD ? `:${encodeURIComponent(process.env.DB_PASSWORD)}` : '';
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '5432';

    process.env.DATABASE_URL = `postgresql://${user}${password}@${host}:${port}/${process.env.DB_DATABASE}`;
}

const prismaBin = path.resolve(__dirname, '../node_modules/.bin/prisma');
const result = spawnSync(prismaBin, process.argv.slice(2), {
    stdio: 'inherit',
    env: process.env
});

process.exit(result.status ?? 1);
