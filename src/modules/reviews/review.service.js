import { prisma } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { getPagination } from '../../utils/pagination.js';
import { logActivity } from '../../utils/activityLogger.js';

const publicUserSelect = {
    id: true,
    username: true,
    avatar_url: true
};

const validateRating = (rating) => {
    const numericRating = Number(rating);

    if (!Number.isFinite(numericRating) || numericRating < 0.5 || numericRating > 5 || numericRating * 2 !== Math.round(numericRating * 2)) {
        throw new ApiError(400, 'Rating must be a half-star value between 0.5 and 5.0');
    }

    return numericRating;
};

const paginate = (query) => {
    const page = Math.max(parseInt(query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit) || 20, 1), 50);

    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
};

export const createReview = async ({ userId, body }) => {
    const rating = validateRating(body.rating);
    const movie = await prisma.movie.findUnique({
        where: { id: body.movieId },
        select: { id: true, title: true, posterUrl: true }
    });

    if (!movie) {
        throw new ApiError(404, 'Movie not found');
    }

    const review = await prisma.review.create({
        data: {
            userId,
            movieId: movie.id,
            rating,
            body: body.body || null,
            containsSpoiler: Boolean(body.containsSpoiler)
        },
        include: {
            user: { select: publicUserSelect },
            movie: { select: { id: true, title: true, posterUrl: true } }
        }
    });

    await logActivity({
        actorId: userId,
        type: 'REVIEWED',
        targetType: 'movie',
        targetId: movie.id,
        metadata: {
            movieTitle: movie.title,
            posterUrl: movie.posterUrl,
            rating,
            reviewId: review.id
        }
    });

    return review;
};

export const updateReview = async ({ reviewId, userId, body }) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });

    if (!review || review.isDeleted) {
        throw new ApiError(404, 'Review not found');
    }

    if (review.userId !== userId) {
        throw new ApiError(403, 'You can only update your own review');
    }

    return prisma.review.update({
        where: { id: reviewId },
        data: {
            ...(body.rating !== undefined ? { rating: validateRating(body.rating) } : {}),
            ...(body.body !== undefined ? { body: body.body || null } : {}),
            ...(body.containsSpoiler !== undefined ? { containsSpoiler: Boolean(body.containsSpoiler) } : {})
        },
        include: {
            user: { select: publicUserSelect },
            movie: { select: { id: true, title: true, posterUrl: true } }
        }
    });
};

export const deleteReview = async ({ reviewId, user }) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });

    if (!review || review.isDeleted) {
        throw new ApiError(404, 'Review not found');
    }

    if (!['moderator', 'super_admin'].includes(user.role) && review.userId !== user.id) {
        throw new ApiError(403, 'You can only delete your own review');
    }

    await prisma.review.update({
        where: { id: reviewId },
        data: { isDeleted: true }
    });
};

export const getMovieReviews = async ({ movieId, query }) => {
    const { page, limit, skip } = paginate(query);
    const sort = query.sort === 'popular'
        ? { likes: { _count: 'desc' } }
        : { createdAt: 'desc' };
    const where = { movieId, isDeleted: false };

    const [reviews, total] = await Promise.all([
        prisma.review.findMany({
            where,
            include: {
                user: { select: publicUserSelect },
                _count: { select: { likes: true, comments: true } }
            },
            orderBy: sort,
            skip,
            take: limit
        }),
        prisma.review.count({ where })
    ]);

    return getPagination({ data: reviews, page, limit, total });
};

export const toggleReviewLike = async ({ reviewId, userId }) => {
    const review = await prisma.review.findUnique({
        where: { id: reviewId },
        select: { id: true, isDeleted: true, movieId: true }
    });

    if (!review || review.isDeleted) {
        throw new ApiError(404, 'Review not found');
    }

    const existing = await prisma.reviewLike.findUnique({
        where: {
            reviewId_userId: {
                reviewId,
                userId
            }
        }
    });

    if (existing) {
        await prisma.reviewLike.delete({ where: { id: existing.id } });
        const likeCount = await prisma.reviewLike.count({ where: { reviewId } });
        return { liked: false, likeCount };
    }

    await prisma.reviewLike.create({ data: { reviewId, userId } });
    await logActivity({
        actorId: userId,
        type: 'LIKED_REVIEW',
        targetType: 'review',
        targetId: reviewId,
        metadata: { movieId: review.movieId }
    });

    const likeCount = await prisma.reviewLike.count({ where: { reviewId } });
    return { liked: true, likeCount };
};

export const getReviewComments = async ({ reviewId, query }) => {
    const { page, limit, skip } = paginate(query);
    const where = { reviewId, isDeleted: false, parentCommentId: null };

    const [comments, total] = await Promise.all([
        prisma.reviewComment.findMany({
            where,
            include: {
                user: { select: publicUserSelect },
                replies: {
                    where: { isDeleted: false },
                    include: { user: { select: publicUserSelect } },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        prisma.reviewComment.count({ where })
    ]);

    return getPagination({ data: comments, page, limit, total });
};

export const createReviewComment = async ({ reviewId, userId, body }) => {
    if (!body.body?.trim()) {
        throw new ApiError(400, 'Comment body is required');
    }

    const review = await prisma.review.findUnique({
        where: { id: reviewId },
        select: { id: true, isDeleted: true }
    });

    if (!review || review.isDeleted) {
        throw new ApiError(404, 'Review not found');
    }

    if (body.parentCommentId) {
        const parentComment = await prisma.reviewComment.findUnique({
            where: { id: body.parentCommentId },
            select: { reviewId: true }
        });

        if (!parentComment || parentComment.reviewId !== reviewId) {
            throw new ApiError(400, 'Parent comment does not belong to this review');
        }
    }

    const comment = await prisma.reviewComment.create({
        data: {
            reviewId,
            userId,
            body: body.body.trim(),
            parentCommentId: body.parentCommentId || null
        },
        include: { user: { select: publicUserSelect } }
    });

    await logActivity({
        actorId: userId,
        type: 'COMMENTED_ON_REVIEW',
        targetType: 'review',
        targetId: reviewId,
        metadata: { commentId: comment.id }
    });

    return comment;
};

export const deleteReviewComment = async ({ reviewId, commentId, user }) => {
    const comment = await prisma.reviewComment.findFirst({
        where: { id: commentId, reviewId }
    });

    if (!comment || comment.isDeleted) {
        throw new ApiError(404, 'Comment not found');
    }

    if (!['moderator', 'super_admin'].includes(user.role) && comment.userId !== user.id) {
        throw new ApiError(403, 'You can only delete your own comment');
    }

    await prisma.reviewComment.update({
        where: { id: commentId },
        data: {
            isDeleted: true,
            body: '[deleted]'
        }
    });
};

export const getReviewById = async (reviewId) => {
    const review = await prisma.review.findFirst({
        where: { id: reviewId, isDeleted: false },
        include: {
            user: { select: publicUserSelect },
            movie: { select: { id: true, title: true, posterUrl: true } },
            _count: { select: { likes: true, comments: true } }
        }
    });

    if (!review) {
        throw new ApiError(404, 'Review not found');
    }

    return review;
};
