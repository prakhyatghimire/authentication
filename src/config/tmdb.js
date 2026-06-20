import axios from 'axios';

export const tmdb = axios.create({
    baseURL: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
    timeout: 10000,
    params: {
        api_key: process.env.TMDB_API_KEY
    }
});
