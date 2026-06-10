// test-insert.js
import { pool } from './src/config/db.js';
import { hashPassword } from './src/utils/hash.js';

async function testInsert() {
    try {
        console.log('🔍 Starting direct insert test...\n');
        
        // Test 1: Check connection
        const dbCheck = await pool.query('SELECT current_database()');
        console.log('✅ Connected to database:', dbCheck.rows[0].current_database);
        
        // Test 2: Create test user
        const testEmail = `test_${Date.now()}@example.com`;
        const testUsername = `user_${Date.now()}`;
        const testPassword = 'Password123!';
        
        console.log('📝 Test data:');
        console.log('   Email:', testEmail);
        console.log('   Username:', testUsername);
        console.log('   Password:', testPassword);
        
        // Hash password
        console.log('\n🔐 Hashing password...');
        const hashedPassword = await hashPassword(testPassword);
        console.log('✅ Password hashed');
        
        // Insert user
        console.log('\n💾 Inserting user...');
        const result = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
            [testUsername, testEmail, hashedPassword]
        );
        
        console.log('✅ User inserted successfully!');
        console.log('   User ID:', result.rows[0].id);
        console.log('   Username:', result.rows[0].username);
        console.log('   Email:', result.rows[0].email);
        
        // Clean up
        console.log('\n🗑️  Cleaning up...');
        await pool.query('DELETE FROM users WHERE id = $1', [result.rows[0].id]);
        console.log('✅ Test user deleted');
        
        console.log('\n🎉 All tests passed!');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Error code:', error.code);
        console.error('Error detail:', error.detail);
    } finally {
        pool.end();
    }
}

testInsert();