import { createLogger } from '../utils/logger.js';

const logger = createLogger('api');

function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  const startMs = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - startMs;
    logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsed}ms)`);
  });
  next();
}

export { requestLogger };
