import pg from "pg";
import dotenv from 'dotenv';


dotenv.config({ path: '/Users/prakhyat/Downloads/backend/.env' });

const { Pool } = pg;
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

export { pool };