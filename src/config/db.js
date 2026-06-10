import pg from "pg";
import dotenv from 'dotenv';

// Force load .env from the correct location
dotenv.config({ path: '/Users/prakhyat/Downloads/backend/.env' });

const { Pool } = pg;

// Debug: Print what we're connecting to
console.log('🔧 Connecting to database:', process.env.DB_DATABASE);
console.log('🔧 Using user:', process.env.DB_USER);

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

// Test the connection immediately
pool.query('SELECT current_database()', (err, result) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Actually connected to:', result.rows[0].current_database);
    }
});

export { pool };