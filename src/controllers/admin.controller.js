import { pool } from '../config/db.js';

// Get all users (with role-based filtering)
export const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const currentUserRole = req.user.role;
        
        let query;
        let params = [limit, offset];
        
        // Different access levels see different data
        if (currentUserRole === 'super_admin') {
            // Super admin sees everything including sensitive data
            query = `
                SELECT id, username, email, role, avatar_url, 
                       is_active, created_at, updated_at, last_login_at
                FROM users 
                ORDER BY 
                    CASE role 
                        WHEN 'super_admin' THEN 1 
                        WHEN 'moderator' THEN 2 
                        WHEN 'user' THEN 3 
                    END,
                    id
                LIMIT $1 OFFSET $2
            `;
        } else if (currentUserRole === 'moderator') {
            // Moderator sees all users but not super admin details
            query = `
                SELECT id, username, email, role, avatar_url, created_at
                FROM users 
                WHERE role != 'super_admin'
                ORDER BY id
                LIMIT $1 OFFSET $2
            `;
        } else {
            return res.status(403).json({ 
                message: 'Access denied. Insufficient permissions.' 
            });
        }
        
        const result = await pool.query(query, params);
        
        // Get total count based on role
        let countQuery;
        if (currentUserRole === 'super_admin') {
            countQuery = 'SELECT COUNT(*) FROM users';
        } else {
            countQuery = 'SELECT COUNT(*) FROM users WHERE role != $1';
            params = ['super_admin'];
        }
        
        const countResult = await pool.query(countQuery, 
            currentUserRole === 'super_admin' ? [] : ['super_admin']
        );
        const total = parseInt(countResult.rows[0].count);
        
        res.status(200).json({
            users: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            userRole: currentUserRole
        });
        
    } catch (error) {
        console.error('Get all users error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update user role (Super admin only)
export const updateUserRole = async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { role } = req.body;
        const currentUser = req.user;
        
        if (isNaN(userId)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }
        
        const validRoles = ['user', 'moderator', 'super_admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ 
                message: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
            });
        }
        
        // Get target user
        const targetUser = await pool.query(
            'SELECT id, username, email, role FROM users WHERE id = $1',
            [userId]
        );
        
        if (targetUser.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const targetRole = targetUser.rows[0].role;
        
        // Permission checks
        if (currentUser.role !== 'super_admin') {
            return res.status(403).json({ 
                message: 'Only super admin can change roles' 
            });
        }
        
        // Prevent changing own role (to avoid locking out super admin)
        if (userId === currentUser.id) {
            return res.status(403).json({ 
                message: 'You cannot change your own role' 
            });
        }
        
        // Cannot demote the only super admin
        if (targetRole === 'super_admin' && role !== 'super_admin') {
            const superAdminCount = await pool.query(
                'SELECT COUNT(*) FROM users WHERE role = $1',
                ['super_admin']
            );
            
            if (parseInt(superAdminCount.rows[0].count) <= 1) {
                return res.status(400).json({ 
                    message: 'Cannot demote the only super admin' 
                });
            }
        }
        
        // Update role
        const result = await pool.query(
            `UPDATE users 
             SET role = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING id, username, email, role`,
            [role, userId]
        );
        
        // Log the role change
        await pool.query(
            `INSERT INTO role_audit_log (user_id, changed_by, old_role, new_role)
             VALUES ($1, $2, $3, $4)`,
            [userId, currentUser.id, targetRole, role]
        );
        
        res.status(200).json({
            message: `User role updated from ${targetRole} to ${role}`,
            user: result.rows[0],
            changedBy: {
                id: currentUser.id,
                username: currentUser.username,
                role: currentUser.role
            }
        });
        
    } catch (error) {
        console.error('Update user role error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Delete user (Super admin only, cannot delete self)
export const deleteUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const currentUser = req.user;
        
        if (isNaN(userId)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }
        
        // Super admin check
        if (currentUser.role !== 'super_admin') {
            return res.status(403).json({ 
                message: 'Only super admin can delete users' 
            });
        }
        
        // Cannot delete self
        if (userId === currentUser.id) {
            return res.status(403).json({ 
                message: 'You cannot delete your own account' 
            });
        }
        
        // Get user info before deleting for logging
        const targetUser = await pool.query(
            'SELECT id, username, email, role FROM users WHERE id = $1',
            [userId]
        );
        
        if (targetUser.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Prevent deleting the only super admin
        if (targetUser.rows[0].role === 'super_admin') {
            const superAdminCount = await pool.query(
                'SELECT COUNT(*) FROM users WHERE role = $1',
                ['super_admin']
            );
            
            if (parseInt(superAdminCount.rows[0].count) <= 1) {
                return res.status(400).json({ 
                    message: 'Cannot delete the only super admin' 
                });
            }
        }
        
        // Log deletion
        await pool.query(
            `INSERT INTO role_audit_log (user_id, changed_by, old_role, new_role)
             VALUES ($1, $2, $3, $4)`,
            [userId, currentUser.id, targetUser.rows[0].role, 'DELETED']
        );
        
        // Delete user
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        
        res.status(200).json({
            message: 'User deleted successfully',
            deletedUser: targetUser.rows[0],
            deletedBy: {
                id: currentUser.id,
                username: currentUser.username,
                role: currentUser.role
            }
        });
        
    } catch (error) {
        console.error('Delete user error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get users by role
export const getUsersByRole = async (req, res) => {
    try {
        const { role } = req.params;
        const currentUserRole = req.user.role;
        
        const validRoles = ['user', 'moderator', 'super_admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ 
                message: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
            });
        }
        
        // Permission checks
        if (currentUserRole === 'user') {
            return res.status(403).json({ 
                message: 'Access denied' 
            });
        }
        
        if (currentUserRole === 'moderator' && role === 'super_admin') {
            return res.status(403).json({ 
                message: 'Moderators cannot view super admin list' 
            });
        }
        
        let query;
        let params = [role];
        
        if (currentUserRole === 'moderator' && role === 'moderator') {
            // Moderators can see other moderators
            query = `
                SELECT id, username, email, role, created_at
                FROM users 
                WHERE role = $1 AND id != $2
                ORDER BY id
            `;
            params = [role, req.user.id];
        } else {
            query = `
                SELECT id, username, email, role, created_at
                FROM users 
                WHERE role = $1
                ORDER BY id
            `;
        }
        
        const result = await pool.query(query, params);
        
        res.status(200).json({
            role: role,
            count: result.rows.length,
            users: result.rows,
            accessedBy: {
                id: req.user.id,
                username: req.user.username,
                role: currentUserRole
            }
        });
        
    } catch (error) {
        console.error('Get users by role error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get role audit log (Super admin only)
export const getRoleAuditLog = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ 
                message: 'Only super admin can view audit logs' 
            });
        }
        
        const result = await pool.query(`
            SELECT 
                ral.*,
                u1.username as user_username,
                u1.email as user_email,
                u2.username as changed_by_username,
                u2.email as changed_by_email
            FROM role_audit_log ral
            JOIN users u1 ON ral.user_id = u1.id
            JOIN users u2 ON ral.changed_by = u2.id
            ORDER BY ral.changed_at DESC
            LIMIT 100
        `);
        
        res.status(200).json({
            auditLog: result.rows,
            count: result.rows.length
        });
        
    } catch (error) {
        console.error('Get audit log error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get role statistics (Super admin only)
export const getRoleStatistics = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ 
                message: 'Only super admin can view statistics' 
            });
        }
        
        const result = await pool.query(`
            SELECT 
                role,
                COUNT(*) as count,
                COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
            FROM users
            GROUP BY role
            ORDER BY 
                CASE role 
                    WHEN 'super_admin' THEN 1 
                    WHEN 'moderator' THEN 2 
                    WHEN 'user' THEN 3 
                END
        `);
        
        res.status(200).json({
            statistics: result.rows,
            totalUsers: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0)
        });
        
    } catch (error) {
        console.error('Get role statistics error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};