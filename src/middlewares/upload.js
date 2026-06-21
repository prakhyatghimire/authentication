import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { cloudinary } from '../config/cloudinary.js';

const createStorage = (folder) => new CloudinaryStorage({
    cloudinary,
    params: {
        folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
    }
});

export const posterUpload = multer({
    storage: createStorage('movies/posters')
});

export const avatarUpload = multer({
    storage: createStorage('movies/people')
});
