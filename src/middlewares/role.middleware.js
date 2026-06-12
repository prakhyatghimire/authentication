// Role-based access control middleware
const ROLE_HIERARCHY = {
    'user': 1,
    'moderator': 2,
    'super_admin': 3
};

// Check if user has required role or higher
export const requireRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                message: 'Authentication required' 
            });
        }

        const userRole = req.user.role;
        const userLevel = ROLE_HIERARCHY[userRole];
        const requiredLevel = ROLE_HIERARCHY[requiredRole];

        if (!userLevel || userLevel < requiredLevel) {
            return res.status(403).json({ 
                message: `Access denied. ${requiredRole} role or higher required.`,
                currentRole: userRole,
                requiredRole: requiredRole
            });
        }

        next();
    };
};

// Specific role checkers
export const isSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ 
            message: 'Super admin access required' 
        });
    }
    next();
};

export const isModeratorOrHigher = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (!['moderator', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ 
            message: 'Moderator or higher access required' 
        });
    }
    next();
};

export const isAdminOrHigher = isModeratorOrHigher; // Alias

// Check if user can manage other users (moderator+)
export const canManageUsers = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (req.user.role === 'user') {
        return res.status(403).json({ 
            message: 'Cannot manage users. Insufficient permissions.' 
        });
    }
    next();
};

// Check if user can manage roles (super admin only)
export const canManageRoles = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ 
            message: 'Only super admin can manage roles' 
        });
    }
    next();
};

// Check if user can delete users (super admin only)
export const canDeleteUsers = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ 
            message: 'Only super admin can delete users' 
        });
    }
    next();
};

// Check if user can access/modify specific user's data
export const canAccessUserData = (req, res, next) => {
    const targetUserId = parseInt(req.params.id);
    const currentUser = req.user;
    
    if (!currentUser) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    // User can access their own data
    if (currentUser.id === targetUserId) {
        return next();
    }
    
    // Moderator can access any user data
    if (currentUser.role === 'moderator') {
        return next();
    }
    
    // Super admin can access any user data
    if (currentUser.role === 'super_admin') {
        return next();
    }
    
    return res.status(403).json({ 
        message: 'You do not have permission to access this user\'s data' 
    });
};