import { prisma } from '../../config/db.js';
import { tmdb } from '../../config/tmdb.js';
import { ApiError } from '../../utils/apiError.js';
import {
    buildMovieSlug,
    mapTmdbListMovieToPrisma,
    mapTmdbMovieToPrisma,
    mapTmdbPersonToPrisma
} from '../../utils/tmdbMapper.js';
import { getPagination } from '../../utils/pagination.js';

const movieInclude = {
    cast: {
        include: {
            person: true
        },
        orderBy: [
            { role: 'asc' },
            { orderIndex: 'asc' }
        ]
    }
};

const assertTmdbConfigured = () => {
    if (!process.env.TMDB_API_KEY) {
        throw new ApiError(500, 'TMDB_API_KEY is not configured');
    }
};

const createUniqueSlug = async ({ title, releaseDate, tmdbId, currentMovieId = null }) => {
    const baseSlug = buildMovieSlug(title, releaseDate);
    let slug = baseSlug;
    let counter = 2;

    while (true) {
        const existing = await prisma.movie.findUnique({
            where: { slug },
            select: { id: true, tmdbId: true }
        });

        if (!existing || existing.id === currentMovieId || existing.tmdbId === tmdbId) {
            return slug;
        }

        slug = `${baseSlug}-${counter}`;
        counter += 1;
    }
};

const upsertTmdbMovie = async (tmdbMovie, { includeCast = false } = {}) => {
    const mappedMovie = mapTmdbMovieToPrisma(tmdbMovie);

    if (!mappedMovie.tmdbId) {
        throw new ApiError(400, 'TMDB movie is missing an id');
    }

    const existingMovie = await prisma.movie.findUnique({
        where: { tmdbId: mappedMovie.tmdbId },
        select: { id: true }
    });

    const slug = await createUniqueSlug({
        title: mappedMovie.title,
        releaseDate: mappedMovie.releaseDate,
        tmdbId: mappedMovie.tmdbId,
        currentMovieId: existingMovie?.id
    });

    return prisma.movie.upsert({
        where: { tmdbId: mappedMovie.tmdbId },
        create: {
            ...mappedMovie,
            slug
        },
        update: {
            ...mappedMovie,
            slug
        },
        ...(includeCast ? { include: movieInclude } : {})
    });
};

const upsertTmdbListMovie = async (tmdbMovie) => {
    const mappedMovie = mapTmdbListMovieToPrisma(tmdbMovie);

    if (!mappedMovie.tmdbId) {
        return null;
    }

    const existingMovie = await prisma.movie.findUnique({
        where: { tmdbId: mappedMovie.tmdbId },
        select: { id: true, genres: true, runtime: true, status: true }
    });

    const slug = await createUniqueSlug({
        title: mappedMovie.title,
        releaseDate: mappedMovie.releaseDate,
        tmdbId: mappedMovie.tmdbId,
        currentMovieId: existingMovie?.id
    });

    return prisma.movie.upsert({
        where: { tmdbId: mappedMovie.tmdbId },
        create: {
            ...mappedMovie,
            slug
        },
        update: {
            ...mappedMovie,
            slug,
            genres: existingMovie?.genres?.length ? existingMovie.genres : mappedMovie.genres,
            runtime: existingMovie?.runtime ?? mappedMovie.runtime,
            status: existingMovie?.status ?? mappedMovie.status
        }
    });
};

const syncMovieCredits = async (movieId, credits) => {
    const directors = Array.isArray(credits?.crew)
        ? credits.crew.filter((person) => person?.job === 'Director')
        : [];
    const actors = Array.isArray(credits?.cast)
        ? credits.cast
            .slice()
            .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999))
            .slice(0, 15)
        : [];

    const castItems = [
        ...directors.map((person, index) => ({
            person,
            role: 'DIRECTOR',
            characterName: null,
            orderIndex: index
        })),
        ...actors.map((person) => ({
            person,
            role: 'ACTOR',
            characterName: person?.character || null,
            orderIndex: typeof person?.order === 'number' ? person.order : null
        }))
    ];

    await Promise.all(castItems.map(async (item) => {
        const personData = mapTmdbPersonToPrisma(item.person);

        if (!personData.tmdbPersonId) {
            return;
        }

        const person = await prisma.person.upsert({
            where: { tmdbPersonId: personData.tmdbPersonId },
            create: personData,
            update: personData
        });

        await prisma.movieCast.upsert({
            where: {
                movieId_personId_role: {
                    movieId,
                    personId: person.id,
                    role: item.role
                }
            },
            create: {
                movieId,
                personId: person.id,
                role: item.role,
                characterName: item.characterName,
                orderIndex: item.orderIndex
            },
            update: {
                characterName: item.characterName,
                orderIndex: item.orderIndex
            }
        });
    }));
};

export const syncTmdbMovieById = async (tmdbId) => {
    assertTmdbConfigured();

    const numericTmdbId = Number(tmdbId);

    if (!Number.isInteger(numericTmdbId)) {
        throw new ApiError(400, 'Invalid TMDB movie id');
    }

    const [movieResponse, creditsResponse] = await Promise.all([
        tmdb.get(`/movie/${numericTmdbId}`),
        tmdb.get(`/movie/${numericTmdbId}/credits`)
    ]);

    const movie = await upsertTmdbMovie(movieResponse.data);
    await syncMovieCredits(movie.id, creditsResponse.data);

    return prisma.movie.findUnique({
        where: { id: movie.id },
        include: movieInclude
    });
};

export const getPopularMovies = async () => {
    assertTmdbConfigured();

    const response = await tmdb.get('/movie/popular');
    const movies = await Promise.all((response.data?.results || []).map(upsertTmdbListMovie));

    return movies.filter(Boolean);
};

export const getNewReleases = async () => {
    assertTmdbConfigured();

    const response = await tmdb.get('/movie/now_playing');
    const movies = await Promise.all((response.data?.results || []).map(upsertTmdbListMovie));

    return movies.filter(Boolean);
};

export const searchMovies = async ({ q, genre, language, page = 1, limit = 20 }) => {
    const currentPage = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    const skip = (currentPage - 1) * pageSize;
    const where = {
        ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
        ...(genre ? { genres: { has: genre } } : {}),
        ...(language ? { language } : {})
    };

    const [localMovies, localTotal] = await Promise.all([
        prisma.movie.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' }
        }),
        prisma.movie.count({ where })
    ]);

    if (localMovies.length > 0 || !q) {
        return getPagination({
            data: localMovies,
            page: currentPage,
            limit: pageSize,
            total: localTotal
        });
    }

    assertTmdbConfigured();

    const response = await tmdb.get('/search/movie', {
        params: {
            query: q,
            page: currentPage
        }
    });
    const syncedMovies = await Promise.all((response.data?.results || []).map(upsertTmdbListMovie));
    const movies = syncedMovies.filter(Boolean).slice(0, pageSize);
    const total = response.data?.total_results || movies.length;

    return getPagination({
        data: movies,
        page: currentPage,
        limit: pageSize,
        total
    });
};

export const getMovieById = async (id) => {
    const movie = await prisma.movie.findUnique({
        where: { id },
        include: movieInclude
    });

    if (!movie) {
        throw new ApiError(404, 'Movie not found');
    }

    return movie;
};
