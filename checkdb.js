// test-insert.js
import { prisma } from './src/config/db.js';
import { hashPassword } from './src/utils/hash.js';

async function testInsert() {
    try {
        console.log('🔍 Starting direct insert test...\n');
        
        // Test 1: Check connection
        const dbCheck = await prisma.$queryRaw`SELECT current_database()`;
        console.log('✅ Connected to database:', dbCheck[0].current_database);
        
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
        const result = await prisma.user.create({
            data: {
                username: testUsername,
                email: testEmail,
                password: hashedPassword
            },
            select: {
                id: true,
                username: true,
                email: true
            }
        });
        
        console.log('✅ User inserted successfully!');
        console.log('   User ID:', result.id);
        console.log('   Username:', result.username);
        console.log('   Email:', result.email);
        
        // Clean up
        console.log('\n🗑️  Cleaning up...');
        await prisma.user.delete({ where: { id: result.id } });
        console.log('✅ Test user deleted');
        
        console.log('\n🎉 All tests passed!');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Error code:', error.code);
        console.error('Error detail:', error.detail);
    } finally {
        await prisma.$disconnect();
    }
}

testInsert();
