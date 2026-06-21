import {
    addMovieToList,
    createList,
    deleteList,
    getMyLists,
    getUserLists,
    removeMovieFromList,
    updateList
} from './list.service.js';

const asyncController = (handler) => async (req, res, next) => {
    try {
        await handler(req, res, next);
    } catch (error) {
        next(error);
    }
};

export const index = asyncController(async (req, res) => {
    const lists = await getMyLists(req.user.id);
    res.status(200).json({ success: true, data: lists });
});

export const create = asyncController(async (req, res) => {
    const list = await createList({ userId: req.user.id, body: req.body });
    res.status(201).json({ success: true, data: list });
});

export const update = asyncController(async (req, res) => {
    const list = await updateList({ listId: req.params.id, userId: req.user.id, body: req.body });
    res.status(200).json({ success: true, data: list });
});

export const remove = asyncController(async (req, res) => {
    await deleteList({ listId: req.params.id, userId: req.user.id });
    res.status(200).json({ success: true });
});

export const addMovie = asyncController(async (req, res) => {
    const list = await addMovieToList({ listId: req.params.id, userId: req.user.id, body: req.body });
    res.status(200).json({ success: true, data: list });
});

export const removeMovie = asyncController(async (req, res) => {
    await removeMovieFromList({ listId: req.params.id, userId: req.user.id, movieId: req.params.movieId });
    res.status(200).json({ success: true });
});

export const userLists = asyncController(async (req, res) => {
    const lists = await getUserLists({ username: req.params.username, requesterId: req.user?.id });
    res.status(200).json({ success: true, data: lists });
});
