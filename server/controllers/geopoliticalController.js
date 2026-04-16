import { createLogger } from '../utils/logger.js';
import { FALLBACK_EVENTS_RAW } from '../services/geopolitical/constants.js';
import { extractLocation, normalizeGeoEvent, scoreTitle } from '../services/geopolitical/model.js';
import { createGeoSourcesClient } from '../services/geopolitical/sources.js';
import { clusterGeoEvents, createGeoHistoryStore } from '../services/geopolitical/history.js';

const logger = createLogger('geopolitical');

function createGeopoliticalHandler(deps) {
  const { fetchWithTimeout, HEADERS } = deps;
  const sourceClient = createGeoSourcesClient({ fetchWithTimeout, HEADERS, logger });

  let geoCache = null;
  let geoCacheFetchedAt = 0;
  let geoCacheSource = 'fallback';
  let geoRefreshingPromise = null;

  const GEO_CACHE_REFRESH_MS = 2 * 60 * 1000;
  const GEO_WAIT_FOR_REFRESH_MS = 1200;
  const GEO_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const GEO_RESOLVED_AFTER_MS = 2 * 60 * 60 * 1000;

  const history = createGeoHistoryStore({
    resolvedAfterMs: GEO_RESOLVED_AFTER_MS,
    historyTtlMs: GEO_HISTORY_TTL_MS,
  });

  const fallbackEvents = FALLBACK_EVENTS_RAW.map((event) =>
    normalizeGeoEvent(event, { fallback: true })
  );

  async function refreshGeoCache() {
    const now = Date.now();
    const articles = await sourceClient.fetchAllGeoArticles();
    const candidates = [];
    for (const article of articles) {
      if (!article.title) continue;
      const loc = extractLocation(article.title);
      if (!loc) continue;
      candidates.push({
        title: article.title,
        location: loc.label,
        lat: loc.lat,
        lon: loc.lon,
        severity: scoreTitle(article.title),
        url: article.url || null,
        domain: article.domain || null,
        seendate: article.seendate || null,
        sourceId: article.sourceId,
        sourceName: article.sourceName,
        sourceQuality: article.sourceQuality,
      });
    }

    const clusters = clusterGeoEvents(candidates);
    const events = clusters.map((cluster) => {
      const sourceCount = cluster.sources.length;
      const avgSourceQuality = cluster.sources.length
        ? cluster.sources.reduce((sum, s) => sum + (s.quality || 0.5), 0) / cluster.sources.length
        : 0.5;
      const primary = cluster.sources[0] || {};
      return normalizeGeoEvent({
        title: cluster.title,
        location: cluster.location,
        lat: cluster.lat,
        lon: cluster.lon,
        severity: cluster.severity,
        url: primary.url || null,
        domain: primary.domain || null,
        seendate: cluster.seendate || primary.seendate || null,
        sourceLinks: cluster.sources
          .filter((s) => s.url)
          .slice(0, 3)
          .map((s) => ({ url: s.url, domain: s.domain || s.name })),
        sourceCount,
        sourceQuality: avgSourceQuality,
        summary: `Corroborated by ${sourceCount} source${sourceCount === 1 ? '' : 's'}. ${cluster.title}`,
      });
    });

    events.sort((a, b) => (b.confidence?.score || 0) - (a.confidence?.score || 0));
    const top20 = events.slice(0, 20);

    if (top20.length < 5) {
      for (const fallback of fallbackEvents) {
        if (top20.length >= 10) break;
        if (!top20.some((e) => e.location === fallback.location)) top20.push(fallback);
      }
    }

    geoCache = top20;
    geoCacheFetchedAt = now;
    geoCacheSource = 'live';
    history.update(top20, now);
    logger.info(`Cache refreshed: ${events.length} clustered from ${candidates.length} raw articles`);
  }

  return async function geopolitical(req, res) {
    const now = Date.now();
    const hasGeoCache = Array.isArray(geoCache) && geoCache.length > 0;
    const cacheAgeMs = hasGeoCache ? (now - geoCacheFetchedAt) : Number.POSITIVE_INFINITY;
    const cacheStale = cacheAgeMs >= GEO_CACHE_REFRESH_MS;

    if ((!hasGeoCache || cacheStale) && !geoRefreshingPromise) {
      geoRefreshingPromise = refreshGeoCache()
        .catch((err) => {
          logger.error('Refresh error:', err.message);
          if (!hasGeoCache) {
            geoCache = fallbackEvents;
            geoCacheSource = 'fallback';
            geoCacheFetchedAt = Date.now();
            history.update(fallbackEvents, Date.now());
          }
        })
        .finally(() => {
          geoRefreshingPromise = null;
        });
    }

    if (hasGeoCache) {
      const filtered = history.filter(req.query, now);
      return res.json({
        events: filtered.rows,
        availableTypes: filtered.types,
        timelineHours: filtered.windowHours,
        cached: geoCacheSource !== 'live',
      });
    }

    if (geoRefreshingPromise) {
      try {
        await Promise.race([
          geoRefreshingPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('refresh timeout')), GEO_WAIT_FOR_REFRESH_MS)),
        ]);
      } catch (_) {}
    }

    if (Array.isArray(geoCache) && geoCache.length) {
      const filtered = history.filter(req.query, Date.now());
      return res.json({
        events: filtered.rows,
        availableTypes: filtered.types,
        timelineHours: filtered.windowHours,
        cached: geoCacheSource !== 'live',
      });
    }

    history.update(fallbackEvents, now);
    const filtered = history.filter(req.query, now);
    const wantsOngoing = String(req.query?.timeline || '').toLowerCase() === 'ongoing';
    return res.json({
      events: filtered.rows.length ? filtered.rows : (wantsOngoing ? fallbackEvents : []),
      availableTypes: filtered.types,
      timelineHours: filtered.windowHours,
      cached: true,
    });
  };
}

export { createGeopoliticalHandler };
