import cron from 'node-cron';
import { prisma } from '../config/db.js';
import { tmdb } from '../config/tmdb.js';
import { refreshTmdbListMovie, refreshTmdbMovie } from '../modules/movies/movie.service.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const syncListEndpoint = async (endpoint) => {
    const response = await tmdb.get(endpoint);
    const movies = response.data?.results || [];

    await Promise.all(movies.map(refreshTmdbListMovie));
};

const syncFullMovieBatch = async (movies) => {
    for (const movie of movies) {
        if (!movie.tmdbId) {
            continue;
        }

        const response = await tmdb.get(`/movie/${movie.tmdbId}`);
        await refreshTmdbMovie(response.data);
    }
};

export const refreshPopularAndNewMovies = async () => {
    await Promise.all([
        syncListEndpoint('/movie/popular'),
        syncListEndpoint('/movie/now_playing')
    ]);
};

export const refreshAllTmdbMovies = async () => {
    const batchSize = 50;
    let skip = 0;

    while (true) {
        const movies = await prisma.movie.findMany({
            where: { source: 'TMDB', tmdbId: { not: null } },
            select: { id: true, tmdbId: true },
            skip,
            take: batchSize,
            orderBy: { createdAt: 'asc' }
        });

        if (movies.length === 0) {
            break;
        }

        await syncFullMovieBatch(movies);
        skip += batchSize;
        await delay(500);
    }
};

export const refreshStaleTmdbMovies = async () => {
    const staleBefore = new Date();
    staleBefore.setDate(staleBefore.getDate() - 30);

    const movies = await prisma.movie.findMany({
        where: {
            source: 'TMDB',
            tmdbId: { not: null },
            OR: [
                { lastSyncedAt: null },
                { lastSyncedAt: { lt: staleBefore } }
            ]
        },
        select: { id: true, tmdbId: true },
        take: 50,
        orderBy: { lastSyncedAt: 'asc' }
    });

    await syncFullMovieBatch(movies);
    console.info(`Refreshed ${movies.length} stale TMDB movies`);
};

const safeJob = (name, handler) => async () => {
    try {
        await handler();
    } catch (error) {
        console.error(`${name} failed:`, error.message);
    }
};

export const tmdbSyncJobs = process.env.ENABLE_SYNC_JOBS === 'true'
    ? [
        cron.schedule('0 2 * * *', safeJob('Daily TMDB list sync', refreshPopularAndNewMovies)),
        cron.schedule('0 3 * * 0', safeJob('Weekly TMDB full sync', refreshAllTmdbMovies)),
        cron.schedule('0 */6 * * *', safeJob('Stale TMDB sync', refreshStaleTmdbMovies))
    ]
    : [];
