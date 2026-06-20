export const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    if (statusCode === 500) {
        console.error(err);
    }

    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal server error'
    });
};
