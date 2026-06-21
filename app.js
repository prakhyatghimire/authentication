import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import authRoutes from './src/routes/auth.routes.js';
import movieRoutes from './src/modules/movies/movie.routes.js';
import reviewRoutes from './src/modules/reviews/review.routes.js';
import listRoutes from './src/modules/lists/list.routes.js';
import userRoutes from './src/modules/users/user.routes.js';
import adminRoutes from './src/modules/admin/admin.routes.js';
import passport from './src/config/passport.js';
import { errorHandler } from './src/middlewares/errorHandler.js';
import './src/jobs/tmdbSync.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_URL || true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'change-this-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'Auth API is running' });
});

app.use(errorHandler);

export default app;
