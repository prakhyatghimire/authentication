import { ApiError } from '../../utils/apiError.js';
import {
    addNepaliMovieCast,
    createNepaliMovie,
    deleteNepaliMovie,
    getRecommendedMovies,
    getMovieById,
    getNewReleases,
    getPopularMovies,
    removeNepaliMovieCast,
    searchMovies,
    syncTmdbMovieById,
    updateNepaliMovie
} from './movie.service.js';
import { getMovieReviews } from '../reviews/review.service.js';

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

export const createNepali = asyncController(async (req, res) => {
    const movie = await createNepaliMovie({
        body: req.body,
        file: req.file,
        userId: req.user.id
    });

    res.status(201).json({
        success: true,
        data: movie
    });
});

export const updateNepali = asyncController(async (req, res) => {
    const movie = await updateNepaliMovie({
        id: req.params.id,
        body: req.body,
        file: req.file
    });

    res.status(200).json({
        success: true,
        data: movie
    });
});

export const deleteNepali = asyncController(async (req, res) => {
    const result = await deleteNepaliMovie(req.params.id);

    res.status(200).json({
        success: true,
        message: result.message
    });
});

export const addNepaliCast = asyncController(async (req, res) => {
    const cast = await addNepaliMovieCast({
        movieId: req.params.id,
        body: req.body
    });

    res.status(201).json({
        success: true,
        data: cast
    });
});

export const deleteNepaliCast = asyncController(async (req, res) => {
    await removeNepaliMovieCast({
        movieId: req.params.id,
        castId: req.params.castId
    });

    res.status(200).json({
        success: true
    });
});

export const recommendedMovies = asyncController(async (req, res) => {
    const result = await getRecommendedMovies(req.user.id);

    res.status(200).json({
        success: true,
        data: result
    });
});

export const movieReviews = asyncController(async (req, res) => {
    const result = await getMovieReviews({
        movieId: req.params.id,
        query: req.query
    });

    res.status(200).json({
        success: true,
        data: result
    });
});
