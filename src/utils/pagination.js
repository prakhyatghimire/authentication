export const getPagination = ({ data, page, limit, total }) => ({
    data,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit)
});
