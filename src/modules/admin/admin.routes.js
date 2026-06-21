import express from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { isModeratorOrHigher, isSuperAdmin } from '../../middlewares/role.middleware.js';
import {
    ban,
    deleteReview,
    flag,
    flaggedReviews,
    nepaliMovies,
    stats,
    updateRole,
    users
} from './admin.controller.js';

const router = express.Router();

router.get('/users', authenticate, isSuperAdmin, users);
router.put('/users/:id/role', authenticate, isSuperAdmin, updateRole);
router.delete('/users/:id', authenticate, isSuperAdmin, ban);
router.get('/reviews/flagged', authenticate, isModeratorOrHigher, flaggedReviews);
router.post('/reviews/:id/flag', authenticate, isModeratorOrHigher, flag);
router.delete('/reviews/:id', authenticate, isModeratorOrHigher, deleteReview);
router.get('/movies/nepali', authenticate, isModeratorOrHigher, nepaliMovies);
router.get('/stats', authenticate, isSuperAdmin, stats);

export default router;
