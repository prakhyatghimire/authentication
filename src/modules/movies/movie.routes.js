import express from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { isModeratorOrHigher } from '../../middlewares/role.middleware.js';
import {
    newReleases,
    popularMovies,
    search,
    showMovie,
    syncTmdbMovie
} from './movie.controller.js';

const router = express.Router();

router.post('/tmdb/sync/:tmdb_id', authenticate, isModeratorOrHigher, syncTmdbMovie);
router.get('/popular', popularMovies);
router.get('/new-releases', newReleases);
router.get('/search', search);
router.get('/:id', showMovie);

export default router;
