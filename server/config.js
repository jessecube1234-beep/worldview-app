const PORT = Number(process.env.PORT) || 4000;
const HEADERS = { 'User-Agent': 'WorldView/1.0 (github.com/worldview-app)' };
const TIMEOUT = 12000;

const WINDY_BASE_URLS = [
  'https://api.windy.com/webcams/api/v3/webcams',
  'https://api.windy.com/api/webcams/v3/webcams',
];

const WINDY_CACHE_TTL = 10 * 60 * 1000;
const GPS_JAM_CACHE_TTL = 5 * 60 * 1000;

export {
  PORT,
  HEADERS,
  TIMEOUT,
  WINDY_BASE_URLS,
  WINDY_CACHE_TTL,
  GPS_JAM_CACHE_TTL,
};
