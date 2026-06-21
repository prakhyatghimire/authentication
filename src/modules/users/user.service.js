import { prisma } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { getPagination } from '../../utils/pagination.js';
import { logActivity } from '../../utils/activityLogger.js';

const publicUserSelect = {
    id: true,
    username: true,
    avatar_url: true,
    bio: true,
    created_at: true
};

const paginate = (query) => {
    const page = Math.max(parseInt(query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit) || 20, 1), 50);

    return { page, limit, skip: (page - 1) * limit };
};

const findUserByUsername = async (username) => {
    const user = await prisma.user.findUnique({
        where: { username },
        select: publicUserSelect
    });

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    return user;
};

export const getPublicProfile = async (username) => {
    const user = await findUserByUsername(username);
    const [followersCount, followingCount, reviewsCount, watchedList, likedList] = await Promise.all([
        prisma.follow.count({ where: { followingId: user.id } }),
        prisma.follow.count({ where: { followerId: user.id } }),
        prisma.review.count({ where: { userId: user.id, isDeleted: false } }),
        prisma.list.findFirst({
            where: { userId: user.id, systemType: 'watched' },
            include: {
                movies: {
                    orderBy: { addedAt: 'desc' },
                    take: 4,
                    include: { movie: true }
                },
                _count: { select: { movies: true } }
            }
        }),
        prisma.list.findFirst({
            where: { userId: user.id, systemType: 'liked' },
            include: {
                movies: {
                    orderBy: { addedAt: 'desc' },
                    take: 4,
                    include: { movie: true }
                }
            }
        })
    ]);

    return {
        ...user,
        counts: {
            followers: followersCount,
            following: followingCount,
            reviews: reviewsCount,
            watchedMovies: watchedList?._count.movies || 0
        },
        recentlyWatched: watchedList?.movies.map((item) => item.movie) || [],
        likedMovies: likedList?.movies.map((item) => item.movie) || []
    };
};

export const getUserReviews = async ({ username, query }) => {
    const user = await findUserByUsername(username);
    const { page, limit, skip } = paginate(query);
    const where = { userId: user.id, isDeleted: false };

    const [reviews, total] = await Promise.all([
        prisma.review.findMany({
            where,
            include: {
                movie: { select: { id: true, title: true, posterUrl: true } },
                _count: { select: { likes: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        prisma.review.count({ where })
    ]);

    return getPagination({ data: reviews, page, limit, total });
};

export const getProfileLists = async ({ username, requesterId }) => {
    const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true }
    });

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    return prisma.list.findMany({
        where: {
            userId: user.id,
            ...(requesterId === user.id ? {} : { isPrivate: false })
        },
        include: { _count: { select: { movies: true } } },
        orderBy: { createdAt: 'desc' }
    });
};

export const toggleFollow = async ({ username, requesterId }) => {
    const targetUser = await prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true }
    });

    if (!targetUser) {
        throw new ApiError(404, 'User not found');
    }

    if (targetUser.id === requesterId) {
        throw new ApiError(400, 'Cannot follow yourself');
    }

    const existing = await prisma.follow.findUnique({
        where: {
            followerId_followingId: {
                followerId: requesterId,
                followingId: targetUser.id
            }
        }
    });

    if (existing) {
        await prisma.follow.delete({
            where: {
                followerId_followingId: {
                    followerId: requesterId,
                    followingId: targetUser.id
                }
            }
        });

        const followerCount = await prisma.follow.count({ where: { followingId: targetUser.id } });
        return { following: false, followerCount };
    }

    await prisma.follow.create({
        data: {
            followerId: requesterId,
            followingId: targetUser.id
        }
    });
    await logActivity({
        actorId: requesterId,
        type: 'FOLLOWED_USER',
        targetType: 'user',
        targetId: String(targetUser.id),
        metadata: { username: targetUser.username }
    });

    const followerCount = await prisma.follow.count({ where: { followingId: targetUser.id } });
    return { following: true, followerCount };
};

export const getFollowers = async ({ username, query }) => {
    const user = await findUserByUsername(username);
    const { page, limit, skip } = paginate(query);
    const where = { followingId: user.id };

    const [followers, total] = await Promise.all([
        prisma.follow.findMany({
            where,
            include: { follower: { select: publicUserSelect } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        prisma.follow.count({ where })
    ]);

    return getPagination({ data: followers.map((item) => item.follower), page, limit, total });
};

export const getFollowing = async ({ username, query }) => {
    const user = await findUserByUsername(username);
    const { page, limit, skip } = paginate(query);
    const where = { followerId: user.id };

    const [following, total] = await Promise.all([
        prisma.follow.findMany({
            where,
            include: { following: { select: publicUserSelect } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        prisma.follow.count({ where })
    ]);

    return getPagination({ data: following.map((item) => item.following), page, limit, total });
};

export const updateMyProfile = async ({ userId, body, file }) => {
    if (body.username) {
        const existing = await prisma.user.findUnique({
            where: { username: body.username },
            select: { id: true }
        });

        if (existing && existing.id !== userId) {
            throw new ApiError(409, 'Username is already taken');
        }
    }

    return prisma.user.update({
        where: { id: userId },
        data: {
            ...(body.bio !== undefined ? { bio: body.bio || null } : {}),
            ...(body.username ? { username: body.username } : {}),
            ...(file?.path ? { avatar_url: file.path } : {})
        },
        select: publicUserSelect
    });
};

export const getActivityFeed = async ({ userId, query }) => {
    const page = Math.max(parseInt(query.page) || 1, 1);
    const limit = 20;
    const follows = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true }
    });
    const actorIds = [userId, ...follows.map((item) => item.followingId)];
    const [activities, total] = await Promise.all([
        prisma.activityFeed.findMany({
            where: { actorId: { in: actorIds } },
            include: { actor: { select: publicUserSelect } },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit
        }),
        prisma.activityFeed.count({ where: { actorId: { in: actorIds } } })
    ]);

    return getPagination({ data: activities, page, limit, total });
};
