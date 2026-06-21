import axios from 'axios';

const recommendationClient = axios.create({
    baseURL: process.env.RECOMMENDATION_ENGINE_URL,
    timeout: 5000
});

export const getRecommendations = async (userId) => {
    if (!process.env.RECOMMENDATION_ENGINE_URL) {
        return [];
    }

    try {
        const response = await recommendationClient.get(`/recommend/${userId}`);
        return Array.isArray(response.data) ? response.data : response.data?.movieIds || [];
    } catch (error) {
        return [];
    }
};
