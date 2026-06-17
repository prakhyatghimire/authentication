import { prisma } from '../config/db.js';

const validRoles = ['user', 'moderator', 'super_admin'];
const roleRank = {
    super_admin: 1,
    moderator: 2,
    user: 3
};

const roleSort = (a, b) => {
    const rankDifference = (roleRank[a.role] || 99) - (roleRank[b.role] || 99);
    return rankDifference || a.id - b.id;
};

const superAdminUserSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    avatar_url: true,
    is_active: true,
    created_at: true,
    updated_at: true,
    last_login_at: true
};

const moderatorUserSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    avatar_url: true,
    created_at: true
};

// Get all users (with role-based filtering)
export const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const currentUserRole = req.user.role;

        if (!['super_admin', 'moderator'].includes(currentUserRole)) {
            return res.status(403).json({
                message: 'Access denied. Insufficient permissions.'
            });
        }

        const where = currentUserRole === 'super_admin'
            ? {}
            : { role: { not: 'super_admin' } };

        const [allUsers, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: currentUserRole === 'super_admin' ? superAdminUserSelect : moderatorUserSelect
            }),
            prisma.user.count({ where })
        ]);

        const users = allUsers.sort(roleSort).slice(offset, offset + limit);

        res.status(200).json({
            users,
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

        if (!validRoles.includes(role)) {
            return res.status(400).json({
                message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
            });
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, email: true, role: true }
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const targetRole = targetUser.role;

        if (currentUser.role !== 'super_admin') {
            return res.status(403).json({
                message: 'Only super admin can change roles'
            });
        }

        if (userId === currentUser.id) {
            return res.status(403).json({
                message: 'You cannot change your own role'
            });
        }

        if (targetRole === 'super_admin' && role !== 'super_admin') {
            const superAdminCount = await prisma.user.count({
                where: { role: 'super_admin' }
            });

            if (superAdminCount <= 1) {
                return res.status(400).json({
                    message: 'Cannot demote the only super admin'
                });
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { role },
                select: { id: true, username: true, email: true, role: true }
            });

            await tx.roleAuditLog.create({
                data: {
                    user_id: userId,
                    changed_by: currentUser.id,
                    old_role: targetRole,
                    new_role: role
                }
            });

            return updatedUser;
        });

        res.status(200).json({
            message: `User role updated from ${targetRole} to ${role}`,
            user: result,
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

        if (currentUser.role !== 'super_admin') {
            return res.status(403).json({
                message: 'Only super admin can delete users'
            });
        }

        if (userId === currentUser.id) {
            return res.status(403).json({
                message: 'You cannot delete your own account'
            });
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, email: true, role: true }
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (targetUser.role === 'super_admin') {
            const superAdminCount = await prisma.user.count({
                where: { role: 'super_admin' }
            });

            if (superAdminCount <= 1) {
                return res.status(400).json({
                    message: 'Cannot delete the only super admin'
                });
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.roleAuditLog.create({
                data: {
                    user_id: userId,
                    changed_by: currentUser.id,
                    old_role: targetUser.role,
                    new_role: 'DELETED'
                }
            });

            await tx.user.delete({
                where: { id: userId }
            });
        });

        res.status(200).json({
            message: 'User deleted successfully',
            deletedUser: targetUser,
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

        if (!validRoles.includes(role)) {
            return res.status(400).json({
                message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
            });
        }

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

        const users = await prisma.user.findMany({
            where: {
                role,
                ...(currentUserRole === 'moderator' && role === 'moderator'
                    ? { id: { not: req.user.id } }
                    : {})
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                created_at: true
            },
            orderBy: { id: 'asc' }
        });

        res.status(200).json({
            role,
            count: users.length,
            users,
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

        const auditLog = await prisma.roleAuditLog.findMany({
            include: {
                user: {
                    select: { username: true, email: true }
                },
                changedBy: {
                    select: { username: true, email: true }
                }
            },
            orderBy: { changed_at: 'desc' },
            take: 100
        });

        const rows = auditLog.map(({ user, changedBy, ...entry }) => ({
            ...entry,
            user_username: user?.username || null,
            user_email: user?.email || null,
            changed_by_username: changedBy?.username || null,
            changed_by_email: changedBy?.email || null
        }));

        res.status(200).json({
            auditLog: rows,
            count: rows.length
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

        const groupedRoles = await prisma.user.groupBy({
            by: ['role'],
            _count: { role: true }
        });

        const totalUsers = groupedRoles.reduce((sum, row) => sum + row._count.role, 0);
        const statistics = groupedRoles
            .map((row) => ({
                role: row.role,
                count: row._count.role.toString(),
                percentage: totalUsers === 0 ? '0' : ((row._count.role * 100) / totalUsers).toString()
            }))
            .sort(roleSort);

        res.status(200).json({
            statistics,
            totalUsers
        });
    } catch (error) {
        console.error('Get role statistics error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
};
