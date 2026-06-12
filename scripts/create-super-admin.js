import { pool } from '../src/config/db.js';
import { hashPassword } from '../src/utils/hash.js';
import readline from 'readline';
import crypto from 'crypto';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function createSuperAdmin() {
    console.log('\n========================================');
    console.log('     CREATE SUPER ADMIN USER');
    console.log('========================================\n');
    
    const username = await question('Username: ');
    const email = await question('Email: ');
    const password = await question('Password (min 8 chars): ');
    const confirmPassword = await question('Confirm Password: ');
    
    if (password !== confirmPassword) {
        console.log('\n❌ Passwords do not match!');
        rl.close();
        return;
    }
    
    if (password.length < 8) {
        console.log('\n❌ Password must be at least 8 characters!');
        rl.close();
        return;
    }
    
    try {
        // Check if any super admin exists
        const existingSuperAdmin = await pool.query(
            'SELECT id FROM users WHERE role = $1',
            ['super_admin']
        );
        
        const isFirstSuperAdmin = existingSuperAdmin.rows.length === 0;
        
        if (!isFirstSuperAdmin) {
            console.log('\n⚠️  A super admin already exists!');
            const confirm = await question('Do you want to create another super admin? (yes/no): ');
            
            if (confirm.toLowerCase() !== 'yes') {
                console.log('\n❌ Operation cancelled.');
                rl.close();
                return;
            }
        }
        
        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id, role FROM users WHERE email = $1',
            [email]
        );
        
        let result;
        
        if (existingUser.rows.length > 0) {
            // Upgrade existing user to super admin
            if (isFirstSuperAdmin || existingUser.rows[0].role === 'super_admin') {
                console.log(`\n⚠️  User ${email} is already ${existingUser.rows[0].role}`);
                rl.close();
                return;
            }
            
            const oldRole = existingUser.rows[0].role;
            result = await pool.query(
                `UPDATE users 
                 SET role = $1, updated_at = CURRENT_TIMESTAMP 
                 WHERE email = $2 
                 RETURNING id, username, email, role`,
                ['super_admin', email]
            );
            
            console.log(`\n✅ User ${email} upgraded from ${oldRole} to super_admin!`);
        } else {
            // Create new super admin
            const hashedPassword = await hashPassword(password);
            result = await pool.query(
                `INSERT INTO users (username, email, password, role) 
                 VALUES ($1, $2, $3, $4) 
                 RETURNING id, username, email, role`,
                [username, email, hashedPassword, 'super_admin']
            );
            
            console.log(`\n✅ Super admin ${username} created successfully!`);
        }
        
        // Log the creation
        await pool.query(
            `INSERT INTO role_audit_log (user_id, changed_by, old_role, new_role)
             VALUES ($1, $1, $2, $3)`,
            [result.rows[0].id, null, 'super_admin']
        );
        
        console.log('\n========================================');
        console.log('Super Admin Details:');
        console.log(`ID: ${result.rows[0].id}`);
        console.log(`Username: ${result.rows[0].username}`);
        console.log(`Email: ${result.rows[0].email}`);
        console.log(`Role: ${result.rows[0].role}`);
        console.log('========================================\n');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        pool.end();
        rl.close();
    }
}

createSuperAdmin();