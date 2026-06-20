import { ApiError } from '../../utils/apiError.js';
import {
    getMovieById,
    getNewReleases,
    getPopularMovies,
    searchMovies,
    syncTmdbMovieById
} from './movie.service.js';

const asyncController = (handler) => async (req, res, next) => {
    try {
        await handler(req, res, next);
    } catch (error) {
        if (error.response?.status) {
            return next(new ApiError(error.response.status, error.response.data?.status_message || error.message));
        }

        next(error);
    }
};

export const syncTmdbMovie = asyncController(async (req, res) => {
    const movie = await syncTmdbMovieById(req.params.tmdb_id);

    res.status(200).json({
        success: true,
        data: movie
    });
});

export const popularMovies = asyncController(async (req, res) => {
    const movies = await getPopularMovies();

    res.status(200).json({
        success: true,
        data: movies
    });
});

export const newReleases = asyncController(async (req, res) => {
    const movies = await getNewReleases();

    res.status(200).json({
        success: true,
        data: movies
    });
});

export const search = asyncController(async (req, res) => {
    const result = await searchMovies(req.query);

    res.status(200).json({
        success: true,
        data: {
            movies: result.data,
            page: result.page,
            totalPages: result.totalPages,
            total: result.total
        }
    });
});

export const showMovie = asyncController(async (req, res) => {
    const movie = await getMovieById(req.params.id);

    res.status(200).json({
        success: true,
        data: movie
    });
});
