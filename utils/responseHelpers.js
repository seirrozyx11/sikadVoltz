export const errorResponse = (res, statusCode, message, details = null) => {
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(details && { details })
  });
};
