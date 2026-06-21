import express from 'express';
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware.js';
import {
    addMovie,
    create,
    index,
    remove,
    removeMovie,
    update,
    userLists
} from './list.controller.js';

const router = express.Router();

router.get('/', authenticate, index);
router.post('/', authenticate, create);
router.put('/:id', authenticate, update);
router.delete('/:id', authenticate, remove);
router.post('/:id/movies', authenticate, addMovie);
router.delete('/:id/movies/:movieId', authenticate, removeMovie);
router.get('/user/:username', optionalAuthenticate, userLists);

export default router;
