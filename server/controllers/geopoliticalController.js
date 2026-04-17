import { createLogger } from '../utils/logger.js';
import { FALLBACK_EVENTS_RAW } from '../services/geopolitical/constants.js';
import { extractLocation, normalizeGeoEvent, scoreTitle } from '../services/geopolitical/model.js';
import { createGeoSourcesClient } from '../services/geopolitical/sources.js';
import { clusterGeoEvents, createGeoHistoryStore } from '../services/geopolitical/history.js';
import { parseGdeltSeenDate } from '../services/geopolitical/text.js';

const logger = createLogger('geopolitical');

function createGeopoliticalHandler(deps) {
  const { fetchWithTimeout, HEADERS, envFallback, envValue } = deps;
  const sourceClient = createGeoSourcesClient({ fetchWithTimeout, HEADERS, logger });

  let geoCache = null;
  let geoCacheFetchedAt = 0;
  let geoCacheSource = 'fallback';
  let geoRefreshingPromise = null;

  const GEO_CACHE_REFRESH_MS = 2 * 60 * 1000;
  const GEO_WAIT_FOR_REFRESH_MS = 1200;
  const GEO_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const GEO_RESOLVED_AFTER_MS = 2 * 60 * 60 * 1000;
  const allowDemoPadding = String(envValue?.('GEO_ALLOW_DEMO_PADDING', envFallback) || '').toLowerCase() === 'true';

  const history = createGeoHistoryStore({
    resolvedAfterMs: GEO_RESOLVED_AFTER_MS,
    historyTtlMs: GEO_HISTORY_TTL_MS,
  });

  const fallbackEvents = FALLBACK_EVENTS_RAW.map((event) =>
    normalizeGeoEvent(event, { fallback: true })
  );

  function eventAgeHours(event, nowMs) {
    const seenMs = parseGdeltSeenDate(event?.seendate)?.getTime() || 0;
    if (!seenMs) return Number.POSITIVE_INFINITY;
    return Math.max(0, (nowMs - seenMs) / 3_600_000);
  }

  function selectBalancedTimelineEvents(events, nowMs, limit = 60) {
    const sorted = [...events].sort((a, b) => {
      const confDelta = (b.confidence?.score || 0) - (a.confidence?.score || 0);
      if (confDelta !== 0) return confDelta;
      const aSeen = parseGdeltSeenDate(a?.seendate)?.getTime() || 0;
      const bSeen = parseGdeltSeenDate(b?.seendate)?.getTime() || 0;
      return bSeen - aSeen;
    });

    const bucket24 = sorted.filter((e) => eventAgeHours(e, nowMs) <= 24);
    const bucket7d = sorted.filter((e) => {
      const age = eventAgeHours(e, nowMs);
      return age > 24 && age <= 168;
    });
    const bucket30d = sorted.filter((e) => {
      const age = eventAgeHours(e, nowMs);
      return age > 168 && age <= 720;
    });
    const remainder = sorted.filter((e) => eventAgeHours(e, nowMs) > 720 || !Number.isFinite(eventAgeHours(e, nowMs)));

    const selected = [];
    const seen = new Set();
    const pushMany = (arr, n) => {
      for (const item of arr) {
        if (selected.length >= limit || n <= 0) break;
        const key = `${item.location || ''}|${item.title || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        selected.push(item);
        n--;
      }
    };

    // Keep coverage across timeframes so 7D is not starved by confidence-only ranking.
    pushMany(bucket24, 8);
    pushMany(bucket7d, 8);
    pushMany(bucket30d, 4);
    if (selected.length < limit) pushMany(sorted, limit - selected.length);
    if (selected.length < limit) pushMany(remainder, limit - selected.length);

    return selected.slice(0, limit);
  }

  async function refreshGeoCache() {
    const now = Date.now();
    const articles = await sourceClient.fetchAllGeoArticles();
    const candidates = [];
    for (const article of articles) {
      if (!article.title) continue;
      const loc = extractLocation(`${article.title} ${article.snippet || ''}`);
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
      const sourceNames = [...new Set(cluster.sources.map((s) => s.name).filter(Boolean))];
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
          .map((s) => ({ url: s.url, domain: s.domain || s.name, seendate: s.seendate || null })),
        sourceNames,
        sourcePrimary: sourceNames[0] || null,
        sourceCount,
        sourceQuality: avgSourceQuality,
        summary: `Corroborated by ${sourceCount} source${sourceCount === 1 ? '' : 's'}. ${cluster.title}`,
      });
    });

    const topEvents = selectBalancedTimelineEvents(events, now, 60);

    if (allowDemoPadding && topEvents.length > 0 && topEvents.length < 5) {
      for (const fallback of fallbackEvents) {
        if (topEvents.length >= 10) break;
        if (!topEvents.some((e) => e.location === fallback.location)) topEvents.push(fallback);
      }
    }

    geoCache = topEvents;
    geoCacheFetchedAt = now;
    geoCacheSource = 'live';
    history.update(topEvents, now);
    logger.info(`Cache refreshed: ${events.length} clustered from ${candidates.length} raw articles`);
  }

  return async function geopolitical(req, res) {
    const now = Date.now();
    const hasGeoCache = Array.isArray(geoCache);
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

    if (Array.isArray(geoCache)) {
      const filtered = history.filter(req.query, Date.now());
      return res.json({
        events: filtered.rows,
        availableTypes: filtered.types,
        timelineHours: filtered.windowHours,
        cached: geoCacheSource !== 'live',
      });
    }

    // No successful live cache yet (startup + upstream errors): hard fallback only here.
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
