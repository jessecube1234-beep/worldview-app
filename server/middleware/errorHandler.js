import { createLogger } from '../utils/logger.js';

const logger = createLogger('error');

function notFoundApi(req, res, next) {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API route not found' });
    return;
  }
  next();
}

function errorHandler(err, _req, res, _next) {
  const status = Number(err?.status || err?.statusCode || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const message = safeStatus >= 500 ? 'Internal server error' : (err?.message || 'Request error');

  logger.error(err?.stack || err?.message || err);
  res.status(safeStatus).json({ error: message });
}

export { notFoundApi, errorHandler };
