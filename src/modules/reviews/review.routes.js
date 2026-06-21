import express from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import {
    addComment,
    comments,
    create,
    like,
    remove,
    removeComment,
    show,
    update
} from './review.controller.js';

const router = express.Router();

router.post('/', authenticate, create);
router.get('/:id', show);
router.put('/:id', authenticate, update);
router.delete('/:id', authenticate, remove);
router.post('/:id/like', authenticate, like);
router.get('/:id/comments', comments);
router.post('/:id/comments', authenticate, addComment);
router.delete('/:id/comments/:commentId', authenticate, removeComment);

export default router;
