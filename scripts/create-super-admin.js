import { prisma } from '../src/config/db.js';
import { hashPassword } from '../src/utils/hash.js';
import readline from 'readline';

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
        const existingSuperAdminCount = await prisma.user.count({
            where: { role: 'super_admin' }
        });
        
        const isFirstSuperAdmin = existingSuperAdminCount === 0;
        
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
        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true, role: true }
        });
        
        let result;
        
        if (existingUser) {
            // Upgrade existing user to super admin
            if (isFirstSuperAdmin || existingUser.role === 'super_admin') {
                console.log(`\n⚠️  User ${email} is already ${existingUser.role}`);
                rl.close();
                return;
            }
            
            const oldRole = existingUser.role;
            result = await prisma.user.update({
                where: { email },
                data: { role: 'super_admin' },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true
                }
            });
            
            console.log(`\n✅ User ${email} upgraded from ${oldRole} to super_admin!`);
        } else {
            // Create new super admin
            const hashedPassword = await hashPassword(password);
            result = await prisma.user.create({
                data: {
                    username,
                    email,
                    password: hashedPassword,
                    role: 'super_admin'
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true
                }
            });
            
            console.log(`\n✅ Super admin ${username} created successfully!`);
        }
        
        // Log the creation
        await prisma.roleAuditLog.create({
            data: {
                user_id: result.id,
                changed_by: result.id,
                old_role: null,
                new_role: 'super_admin'
            }
        });
        
        console.log('\n========================================');
        console.log('Super Admin Details:');
        console.log(`ID: ${result.id}`);
        console.log(`Username: ${result.username}`);
        console.log(`Email: ${result.email}`);
        console.log(`Role: ${result.role}`);
        console.log('========================================\n');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
        rl.close();
    }
}

createSuperAdmin();
