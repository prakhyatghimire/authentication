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
import { cloudinary } from '../../config/cloudinary.js';
import { getRecommendations } from '../../utils/recommendationClient.js';

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

const parseOptionalDate = (value) => {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

const parseGenres = (genres) => {
    if (Array.isArray(genres)) {
        return genres.map((genre) => String(genre).trim()).filter(Boolean);
    }

    if (typeof genres === 'string') {
        return genres.split(',').map((genre) => genre.trim()).filter(Boolean);
    }

    return [];
};

const parseAwards = (awards) => {
    if (!awards) {
        return undefined;
    }

    if (typeof awards !== 'string') {
        return awards;
    }

    try {
        return JSON.parse(awards);
    } catch (error) {
        throw new ApiError(400, 'Awards must be valid JSON');
    }
};

const parseBigInt = (value) => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    try {
        return BigInt(value);
    } catch (error) {
        throw new ApiError(400, 'boxOfficeNpr must be a valid number');
    }
};

const serializeMovie = (movie) => {
    if (!movie?.nepaliDetail?.boxOfficeNpr) {
        return movie;
    }

    return {
        ...movie,
        nepaliDetail: {
            ...movie.nepaliDetail,
            boxOfficeNpr: movie.nepaliDetail.boxOfficeNpr.toString()
        }
    };
};

const getCloudinaryPublicId = (url) => {
    if (!url) {
        return null;
    }

    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
    return match?.[1] || null;
};

export const createNepaliMovie = async ({ body, file, userId }) => {
    const title = body.title?.trim();

    if (!title) {
        throw new ApiError(400, 'Title is required');
    }

    const releaseDate = parseOptionalDate(body.releaseDate) || null;
    const slug = await createUniqueSlug({ title, releaseDate });
    const genres = parseGenres(body.genres);

    const movie = await prisma.$transaction(async (tx) => {
        const createdMovie = await tx.movie.create({
            data: {
                source: 'NEPALI',
                title,
                slug,
                description: body.description || null,
                releaseDate,
                runtime: body.runtime ? parseInt(body.runtime) : null,
                posterUrl: file?.path || null,
                language: body.language || 'ne',
                genres,
                status: body.status || null,
                createdById: userId
            }
        });

        await tx.nepaliMovieDetail.create({
            data: {
                movieId: createdMovie.id,
                productionHouse: body.productionHouse || null,
                distributor: body.distributor || null,
                boxOfficeNpr: parseBigInt(body.boxOfficeNpr),
                awards: parseAwards(body.awards),
                extraNotes: body.extraNotes || null
            }
        });

        return tx.movie.findUnique({
            where: { id: createdMovie.id },
            include: { nepaliDetail: true, cast: { include: { person: true } } }
        });
    });

    return serializeMovie(movie);
};

export const updateNepaliMovie = async ({ id, body, file }) => {
    const existing = await prisma.movie.findUnique({
        where: { id },
        include: { nepaliDetail: true }
    });

    if (!existing || existing.source !== 'NEPALI') {
        throw new ApiError(404, 'Nepali movie not found');
    }

    const releaseDate = body.releaseDate !== undefined ? parseOptionalDate(body.releaseDate) || null : existing.releaseDate;
    const title = body.title?.trim() || existing.title;
    const shouldRegenerateSlug = body.title !== undefined || body.releaseDate !== undefined;
    const slug = shouldRegenerateSlug
        ? await createUniqueSlug({ title, releaseDate, currentMovieId: existing.id })
        : existing.slug;

    const movieData = {
        ...(body.title !== undefined ? { title } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.releaseDate !== undefined ? { releaseDate } : {}),
        ...(body.runtime !== undefined ? { runtime: body.runtime ? parseInt(body.runtime) : null } : {}),
        ...(file?.path ? { posterUrl: file.path } : {}),
        ...(body.language !== undefined ? { language: body.language || 'ne' } : {}),
        ...(body.genres !== undefined ? { genres: parseGenres(body.genres) } : {}),
        ...(body.status !== undefined ? { status: body.status || null } : {}),
        slug
    };

    const detailData = {
        ...(body.productionHouse !== undefined ? { productionHouse: body.productionHouse || null } : {}),
        ...(body.distributor !== undefined ? { distributor: body.distributor || null } : {}),
        ...(body.boxOfficeNpr !== undefined ? { boxOfficeNpr: parseBigInt(body.boxOfficeNpr) || null } : {}),
        ...(body.awards !== undefined ? { awards: parseAwards(body.awards) || null } : {}),
        ...(body.extraNotes !== undefined ? { extraNotes: body.extraNotes || null } : {})
    };

    const movie = await prisma.$transaction(async (tx) => {
        await tx.movie.update({
            where: { id },
            data: movieData
        });

        await tx.nepaliMovieDetail.upsert({
            where: { movieId: id },
            create: { movieId: id, ...detailData },
            update: detailData
        });

        return tx.movie.findUnique({
            where: { id },
            include: { nepaliDetail: true, cast: { include: { person: true } } }
        });
    });

    return serializeMovie(movie);
};

export const deleteNepaliMovie = async (id) => {
    const movie = await prisma.movie.findUnique({
        where: { id },
        select: { id: true, source: true, posterUrl: true }
    });

    if (!movie || movie.source !== 'NEPALI') {
        throw new ApiError(404, 'Nepali movie not found');
    }

    const publicId = getCloudinaryPublicId(movie.posterUrl);

    if (publicId) {
        await cloudinary.uploader.destroy(publicId);
    }

    await prisma.movie.delete({ where: { id } });

    return { message: 'Movie deleted' };
};

export const addNepaliMovieCast = async ({ movieId, body }) => {
    const movie = await prisma.movie.findUnique({
        where: { id: movieId },
        select: { id: true, source: true }
    });

    if (!movie || movie.source !== 'NEPALI') {
        throw new ApiError(404, 'Nepali movie not found');
    }

    const role = body.role;

    if (!['DIRECTOR', 'ACTOR', 'WRITER'].includes(role)) {
        throw new ApiError(400, 'Invalid cast role');
    }

    let personId = body.personId;

    if (!personId) {
        if (!body.name?.trim()) {
            throw new ApiError(400, 'personId or name is required');
        }

        const person = await prisma.person.create({
            data: {
                name: body.name.trim(),
                tmdbPersonId: null
            }
        });

        personId = person.id;
    } else {
        const person = await prisma.person.findUnique({ where: { id: personId } });

        if (!person) {
            throw new ApiError(404, 'Person not found');
        }
    }

    return prisma.movieCast.upsert({
        where: {
            movieId_personId_role: {
                movieId,
                personId,
                role
            }
        },
        create: {
            movieId,
            personId,
            role,
            characterName: body.characterName || null,
            orderIndex: body.orderIndex !== undefined ? parseInt(body.orderIndex) : null
        },
        update: {
            characterName: body.characterName || null,
            orderIndex: body.orderIndex !== undefined ? parseInt(body.orderIndex) : null
        },
        include: { person: true }
    });
};

export const removeNepaliMovieCast = async ({ movieId, castId }) => {
    const cast = await prisma.movieCast.findFirst({
        where: {
            id: castId,
            movieId,
            movie: { source: 'NEPALI' }
        }
    });

    if (!cast) {
        throw new ApiError(404, 'Cast entry not found');
    }

    await prisma.movieCast.delete({ where: { id: castId } });
};

export const getRecommendedMovies = async (userId) => {
    const engineMovieIds = await getRecommendations(userId);

    if (engineMovieIds.length > 0) {
        const movies = await prisma.movie.findMany({
            where: { id: { in: engineMovieIds } }
        });
        const byId = new Map(movies.map((movie) => [movie.id, movie]));

        return {
            movies: engineMovieIds.map((id) => byId.get(id)).filter(Boolean),
            source: 'engine'
        };
    }

    const watchedList = await prisma.list.findFirst({
        where: {
            userId,
            systemType: 'watched'
        },
        include: {
            movies: {
                select: { movieId: true }
            }
        }
    });

    const watchedMovieIds = watchedList?.movies.map((item) => item.movieId) || [];
    const movies = await prisma.movie.findMany({
        where: {
            id: { notIn: watchedMovieIds },
            tmdbRating: { not: null }
        },
        orderBy: { tmdbRating: 'desc' },
        take: 20
    });

    return {
        movies,
        source: 'fallback'
    };
};

export const refreshTmdbListMovie = upsertTmdbListMovie;
export const refreshTmdbMovie = upsertTmdbMovie;
