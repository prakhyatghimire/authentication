import express from 'express';
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware.js';
import { avatarUpload } from '../../middlewares/upload.js';
import {
    activityFeed,
    follow,
    followers,
    following,
    lists,
    reviews,
    show,
    updateMe
} from './user.controller.js';

const router = express.Router();

router.get('/feed/activity', authenticate, activityFeed);
router.put('/me/profile', authenticate, avatarUpload.single('avatar'), updateMe);
router.get('/:username', show);
router.get('/:username/reviews', reviews);
router.get('/:username/lists', optionalAuthenticate, lists);
router.post('/:username/follow', authenticate, follow);
router.get('/:username/followers', followers);
router.get('/:username/following', following);

export default router;
