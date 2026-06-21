import express from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { isModeratorOrHigher, isSuperAdmin } from '../../middlewares/role.middleware.js';
import { posterUpload } from '../../middlewares/upload.js';
import {
    addNepaliCast,
    createNepali,
    deleteNepali,
    deleteNepaliCast,
    movieReviews,
    newReleases,
    popularMovies,
    recommendedMovies,
    search,
    showMovie,
    syncTmdbMovie,
    updateNepali
} from './movie.controller.js';

const router = express.Router();

router.post('/tmdb/sync/:tmdb_id', authenticate, isModeratorOrHigher, syncTmdbMovie);
router.get('/recommended', authenticate, recommendedMovies);
router.post('/nepali', authenticate, isModeratorOrHigher, posterUpload.single('poster'), createNepali);
router.put('/nepali/:id', authenticate, isModeratorOrHigher, posterUpload.single('poster'), updateNepali);
router.delete('/nepali/:id', authenticate, isSuperAdmin, deleteNepali);
router.post('/nepali/:id/cast', authenticate, isModeratorOrHigher, addNepaliCast);
router.delete('/nepali/:id/cast/:castId', authenticate, isModeratorOrHigher, deleteNepaliCast);
router.get('/popular', popularMovies);
router.get('/new-releases', newReleases);
router.get('/search', search);
router.get('/:id/reviews', movieReviews);
router.get('/:id', showMovie);

export default router;
