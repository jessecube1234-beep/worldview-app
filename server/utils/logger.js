function levelRank(level) {
  const ranks = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 99,
  };
  return ranks[level] ?? ranks.info;
}

function configuredLevel() {
  const raw = String(process.env.LOG_LEVEL || '').toLowerCase().trim();
  if (raw) return raw;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function write(method, scope, args) {
  const prefix = scope ? `[${scope}]` : '[app]';
  console[method](prefix, ...args);
}

function createLogger(scope) {
  const current = configuredLevel();
  const currentRank = levelRank(current);

  return {
    debug: (...args) => {
      if (currentRank <= levelRank('debug')) write('debug', scope, args);
    },
    info: (...args) => {
      if (currentRank <= levelRank('info')) write('log', scope, args);
    },
    warn: (...args) => {
      if (currentRank <= levelRank('warn')) write('warn', scope, args);
    },
    error: (...args) => {
      if (currentRank <= levelRank('error')) write('error', scope, args);
    },
  };
}

export { createLogger };
