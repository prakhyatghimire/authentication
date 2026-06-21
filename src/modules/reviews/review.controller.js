import {
    createReview,
    createReviewComment,
    deleteReview,
    deleteReviewComment,
    getReviewById,
    getReviewComments,
    toggleReviewLike,
    updateReview
} from './review.service.js';

const asyncController = (handler) => async (req, res, next) => {
    try {
        await handler(req, res, next);
    } catch (error) {
        next(error);
    }
};

export const create = asyncController(async (req, res) => {
    const review = await createReview({ userId: req.user.id, body: req.body });
    res.status(201).json({ success: true, data: review });
});

export const update = asyncController(async (req, res) => {
    const review = await updateReview({ reviewId: req.params.id, userId: req.user.id, body: req.body });
    res.status(200).json({ success: true, data: review });
});

export const remove = asyncController(async (req, res) => {
    await deleteReview({ reviewId: req.params.id, user: req.user });
    res.status(200).json({ success: true, message: 'Review deleted' });
});

export const like = asyncController(async (req, res) => {
    const result = await toggleReviewLike({ reviewId: req.params.id, userId: req.user.id });
    res.status(200).json({ success: true, data: result });
});

export const comments = asyncController(async (req, res) => {
    const result = await getReviewComments({ reviewId: req.params.id, query: req.query });
    res.status(200).json({ success: true, data: result });
});

export const addComment = asyncController(async (req, res) => {
    const comment = await createReviewComment({ reviewId: req.params.id, userId: req.user.id, body: req.body });
    res.status(201).json({ success: true, data: comment });
});

export const removeComment = asyncController(async (req, res) => {
    await deleteReviewComment({ reviewId: req.params.id, commentId: req.params.commentId, user: req.user });
    res.status(200).json({ success: true });
});

export const show = asyncController(async (req, res) => {
    const review = await getReviewById(req.params.id);
    res.status(200).json({ success: true, data: review });
});
