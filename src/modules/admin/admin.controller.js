import {
    banUser,
    flagReview,
    getAdminStats,
    getFlaggedReviews,
    listAdminUsers,
    listNepaliMovies,
    moderateDeleteReview,
    updateAdminUserRole
} from './admin.service.js';

const asyncController = (handler) => async (req, res, next) => {
    try {
        await handler(req, res, next);
    } catch (error) {
        next(error);
    }
};

export const users = asyncController(async (req, res) => {
    const result = await listAdminUsers(req.query);
    res.status(200).json({ success: true, data: result });
});

export const updateRole = asyncController(async (req, res) => {
    const user = await updateAdminUserRole({
        targetUserId: parseInt(req.params.id),
        currentUserId: req.user.id,
        role: req.body.role
    });
    res.status(200).json({ success: true, data: user });
});

export const ban = asyncController(async (req, res) => {
    await banUser({ targetUserId: parseInt(req.params.id), currentUserId: req.user.id });
    res.status(200).json({ success: true, message: 'User banned' });
});

export const flaggedReviews = asyncController(async (req, res) => {
    const reviews = await getFlaggedReviews();
    res.status(200).json({ success: true, data: reviews });
});

export const flag = asyncController(async (req, res) => {
    const review = await flagReview(req.params.id);
    res.status(200).json({ success: true, data: review });
});

export const deleteReview = asyncController(async (req, res) => {
    await moderateDeleteReview(req.params.id);
    res.status(200).json({ success: true });
});

export const nepaliMovies = asyncController(async (req, res) => {
    const result = await listNepaliMovies(req.query);
    res.status(200).json({ success: true, data: result });
});

export const stats = asyncController(async (req, res) => {
    const result = await getAdminStats();
    res.status(200).json({ success: true, data: result });
});
