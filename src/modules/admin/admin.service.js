import { prisma } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { getPagination } from '../../utils/pagination.js';

const userPublicSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    avatar_url: true,
    bio: true,
    created_at: true,
    isBanned: true
};

const paginate = (query) => {
    const page = Math.max(parseInt(query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit) || 20, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
};

export const listAdminUsers = async (query) => {
    const { page, limit, skip } = paginate(query);
    const where = {
        ...(query.search
            ? {
                OR: [
                    { username: { contains: query.search, mode: 'insensitive' } },
                    { email: { contains: query.search, mode: 'insensitive' } }
                ]
            }
            : {}),
        ...(query.role ? { role: query.role } : {})
    };

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                ...userPublicSelect,
                _count: { select: { reviews: true, lists: true } }
            },
            orderBy: { created_at: 'desc' },
            skip,
            take: limit
        }),
        prisma.user.count({ where })
    ]);

    return getPagination({ data: users, page, limit, total });
};

export const updateAdminUserRole = async ({ targetUserId, currentUserId, role }) => {
    const normalizedRole = role === 'end_user' ? 'user' : role;
    const validRoles = ['user', 'moderator', 'super_admin'];

    if (!validRoles.includes(normalizedRole)) {
        throw new ApiError(400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    if (targetUserId === currentUserId && normalizedRole !== 'super_admin') {
        throw new ApiError(400, 'You cannot downgrade your own role');
    }

    return prisma.user.update({
        where: { id: targetUserId },
        data: { role: normalizedRole },
        select: userPublicSelect
    });
};

export const banUser = async ({ targetUserId, currentUserId }) => {
    if (targetUserId === currentUserId) {
        throw new ApiError(400, 'You cannot ban your own account');
    }

    await prisma.user.update({
        where: { id: targetUserId },
        data: { isBanned: true }
    });
};

export const getFlaggedReviews = () => prisma.review.findMany({
    where: { isFlagged: true, isDeleted: false },
    include: {
        user: { select: { id: true, username: true, avatar_url: true } },
        movie: { select: { id: true, title: true, posterUrl: true } }
    },
    orderBy: { createdAt: 'desc' }
});

export const flagReview = async (reviewId) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });

    if (!review) {
        throw new ApiError(404, 'Review not found');
    }

    return prisma.review.update({
        where: { id: reviewId },
        data: { isFlagged: true }
    });
};

export const moderateDeleteReview = async (reviewId) => {
    await prisma.review.update({
        where: { id: reviewId },
        data: { isDeleted: true }
    });
};

export const listNepaliMovies = async (query) => {
    const { page, limit, skip } = paginate(query);
    const where = { source: 'NEPALI' };

    const [movies, total] = await Promise.all([
        prisma.movie.findMany({
            where,
            include: {
                nepaliDetail: true,
                createdBy: { select: { id: true, username: true, email: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        prisma.movie.count({ where })
    ]);

    return getPagination({
        data: movies.map((movie) => ({
            ...movie,
            nepaliDetail: movie.nepaliDetail?.boxOfficeNpr
                ? { ...movie.nepaliDetail, boxOfficeNpr: movie.nepaliDetail.boxOfficeNpr.toString() }
                : movie.nepaliDetail
        })),
        page,
        limit,
        total
    });
};

export const getAdminStats = async () => {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [
        totalUsers,
        totalMovies,
        tmdbMovies,
        nepaliMovies,
        totalReviews,
        newUsersThisWeek,
        newReviewsThisWeek
    ] = await Promise.all([
        prisma.user.count(),
        prisma.movie.count(),
        prisma.movie.count({ where: { source: 'TMDB' } }),
        prisma.movie.count({ where: { source: 'NEPALI' } }),
        prisma.review.count(),
        prisma.user.count({ where: { created_at: { gte: since } } }),
        prisma.review.count({ where: { createdAt: { gte: since } } })
    ]);

    return {
        totalUsers,
        totalMovies,
        moviesBySource: {
            TMDB: tmdbMovies,
            NEPALI: nepaliMovies
        },
        totalReviews,
        totalNepaliMovies: nepaliMovies,
        newUsersThisWeek,
        newReviewsThisWeek
    };
};
