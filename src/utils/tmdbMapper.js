import slugify from 'slugify';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

const buildImageUrl = (path, size = 'w500') => {
    if (!path) {
        return null;
    }

    return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
};

const getReleaseYear = (releaseDate) => {
    if (!releaseDate) {
        return null;
    }

    const date = new Date(releaseDate);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.getUTCFullYear();
};

export const buildMovieSlug = (title, releaseDate) => {
    const year = getReleaseYear(releaseDate);
    const parts = [title || 'untitled', year].filter(Boolean);

    return slugify(parts.join('-'), {
        lower: true,
        strict: true
    });
};

export const mapTmdbMovieToPrisma = (movie) => {
    const releaseDate = movie?.release_date ? new Date(movie.release_date) : null;
    const genres = Array.isArray(movie?.genres)
        ? movie.genres.map((genre) => genre?.name).filter(Boolean)
        : [];

    return {
        tmdbId: movie?.id ?? null,
        source: 'TMDB',
        title: movie?.title || movie?.name || 'Untitled',
        slug: buildMovieSlug(movie?.title || movie?.name, movie?.release_date),
        description: movie?.overview || null,
        releaseDate: releaseDate && !Number.isNaN(releaseDate.getTime()) ? releaseDate : null,
        runtime: typeof movie?.runtime === 'number' ? movie.runtime : null,
        posterUrl: buildImageUrl(movie?.poster_path, 'w500'),
        backdropUrl: buildImageUrl(movie?.backdrop_path, 'w780'),
        language: movie?.original_language || null,
        genres,
        status: movie?.status || null,
        tmdbRating: typeof movie?.vote_average === 'number' ? movie.vote_average : null,
        tmdbVoteCount: typeof movie?.vote_count === 'number' ? movie.vote_count : null,
        lastSyncedAt: new Date()
    };
};

export const mapTmdbListMovieToPrisma = (movie) => ({
    ...mapTmdbMovieToPrisma(movie),
    genres: []
});

export const mapTmdbPersonToPrisma = (person) => ({
    tmdbPersonId: person?.id ?? null,
    name: person?.name || 'Unknown',
    profileImage: buildImageUrl(person?.profile_path, 'w185'),
    biography: person?.biography || null,
    birthday: person?.birthday ? new Date(person.birthday) : null
});
