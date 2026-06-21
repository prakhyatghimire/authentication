import {
    getActivityFeed,
    getFollowers,
    getFollowing,
    getProfileLists,
    getPublicProfile,
    getUserReviews,
    toggleFollow,
    updateMyProfile
} from './user.service.js';

const asyncController = (handler) => async (req, res, next) => {
    try {
        await handler(req, res, next);
    } catch (error) {
        next(error);
    }
};

export const show = asyncController(async (req, res) => {
    const profile = await getPublicProfile(req.params.username);
    res.status(200).json({ success: true, data: profile });
});

export const reviews = asyncController(async (req, res) => {
    const result = await getUserReviews({ username: req.params.username, query: req.query });
    res.status(200).json({ success: true, data: result });
});

export const lists = asyncController(async (req, res) => {
    const result = await getProfileLists({ username: req.params.username, requesterId: req.user?.id });
    res.status(200).json({ success: true, data: result });
});

export const follow = asyncController(async (req, res) => {
    const result = await toggleFollow({ username: req.params.username, requesterId: req.user.id });
    res.status(200).json({ success: true, data: result });
});

export const followers = asyncController(async (req, res) => {
    const result = await getFollowers({ username: req.params.username, query: req.query });
    res.status(200).json({ success: true, data: result });
});

export const following = asyncController(async (req, res) => {
    const result = await getFollowing({ username: req.params.username, query: req.query });
    res.status(200).json({ success: true, data: result });
});

export const updateMe = asyncController(async (req, res) => {
    const profile = await updateMyProfile({ userId: req.user.id, body: req.body, file: req.file });
    res.status(200).json({ success: true, data: profile });
});

export const activityFeed = asyncController(async (req, res) => {
    const result = await getActivityFeed({ userId: req.user.id, query: req.query });
    res.status(200).json({ success: true, data: result });
});
