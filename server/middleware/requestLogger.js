function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  const startMs = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - startMs;
    console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsed}ms)`);
  });
  next();
}

module.exports = { requestLogger };
