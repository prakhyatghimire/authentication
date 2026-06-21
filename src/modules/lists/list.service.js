import { prisma } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { logActivity } from '../../utils/activityLogger.js';

const listInclude = {
    _count: {
        select: { movies: true }
    }
};

const getOwnedList = async ({ listId, userId }) => {
    const list = await prisma.list.findFirst({
        where: { id: listId, userId }
    });

    if (!list) {
        throw new ApiError(404, 'List not found');
    }

    return list;
};

export const getMyLists = (userId) => prisma.list.findMany({
    where: { userId },
    include: listInclude,
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }]
});

export const createList = ({ userId, body }) => {
    if (!body.name?.trim()) {
        throw new ApiError(400, 'List name is required');
    }

    return prisma.list.create({
        data: {
            userId,
            name: body.name.trim(),
            description: body.description || null,
            isPrivate: Boolean(body.isPrivate)
        },
        include: listInclude
    });
};

export const updateList = async ({ listId, userId, body }) => {
    const list = await getOwnedList({ listId, userId });

    if (list.isSystem && body.name !== undefined) {
        throw new ApiError(400, 'Cannot rename system lists');
    }

    return prisma.list.update({
        where: { id: listId },
        data: {
            ...(body.name !== undefined ? { name: body.name.trim() } : {}),
            ...(body.description !== undefined ? { description: body.description || null } : {}),
            ...(body.isPrivate !== undefined ? { isPrivate: Boolean(body.isPrivate) } : {})
        },
        include: listInclude
    });
};

export const deleteList = async ({ listId, userId }) => {
    const list = await getOwnedList({ listId, userId });

    if (list.isSystem) {
        throw new ApiError(400, 'Cannot delete system lists');
    }

    await prisma.list.delete({ where: { id: listId } });
};

export const addMovieToList = async ({ listId, userId, body }) => {
    const list = await getOwnedList({ listId, userId });
    const movie = await prisma.movie.findUnique({
        where: { id: body.movieId },
        select: { id: true, title: true, posterUrl: true }
    });

    if (!movie) {
        throw new ApiError(404, 'Movie not found');
    }

    await prisma.listMovie.upsert({
        where: {
            listId_movieId: {
                listId,
                movieId: movie.id
            }
        },
        create: {
            listId,
            movieId: movie.id,
            notes: body.notes || null,
            sortOrder: body.sortOrder !== undefined ? parseInt(body.sortOrder) : null
        },
        update: {
            notes: body.notes || null,
            sortOrder: body.sortOrder !== undefined ? parseInt(body.sortOrder) : null
        }
    });

    await logActivity({
        actorId: userId,
        type: list.systemType === 'watched' ? 'WATCHED' : 'ADDED_TO_LIST',
        targetType: list.systemType === 'watched' ? 'movie' : 'list',
        targetId: list.systemType === 'watched' ? movie.id : list.id,
        metadata: {
            listName: list.name,
            movieId: movie.id,
            movieTitle: movie.title,
            posterUrl: movie.posterUrl
        }
    });

    return prisma.list.findUnique({
        where: { id: listId },
        include: listInclude
    });
};

export const removeMovieFromList = async ({ listId, userId, movieId }) => {
    await getOwnedList({ listId, userId });

    await prisma.listMovie.deleteMany({
        where: { listId, movieId }
    });
};

export const getUserLists = async ({ username, requesterId }) => {
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
        include: listInclude,
        orderBy: { createdAt: 'desc' }
    });
};
