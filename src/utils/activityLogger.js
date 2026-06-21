import { prisma } from '../config/db.js';

export const logActivity = async ({ actorId, type, targetType, targetId, metadata = null }) => {
    try {
        await prisma.activityFeed.create({
            data: {
                actorId,
                activityType: type,
                targetType,
                targetId,
                metadata
            }
        });
    } catch (error) {
        // Activity logging should never block the primary user action.
    }
};
