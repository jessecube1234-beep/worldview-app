const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return acc;
      const key = trimmed.slice(0, idx).trim();
      const raw = trimmed.slice(idx + 1).trim();
      const value = raw.replace(/^["'](.+)["']$/, '$1');
      acc[key] = value;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function loadEnvFallback(baseDir) {
  const envFile = path.join(baseDir, '.env');
  return parseEnvFile(envFile);
}

function envValue(key, fallback = {}) {
  return process.env[key] || fallback[key] || '';
}

function validateEnvironment(fallback = {}) {
  const demoMode = String(envValue('DEMO_MODE', fallback)).toLowerCase() === 'true';
  if (!demoMode) return;

  const required = ['WINDY_WEBCAMS_KEY'];
  const missing = required.filter((key) => !envValue(key, fallback));
  if (!missing.length) return;

  throw new Error(
    `Missing required environment variable(s) for DEMO_MODE=true: ${missing.join(', ')}`
  );
}

module.exports = {
  parseEnvFile,
  loadEnvFallback,
  envValue,
  validateEnvironment,
};
