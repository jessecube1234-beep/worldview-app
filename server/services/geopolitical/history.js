import { parseGdeltSeenDate, titleSimilarity, normalizeTitleForDedupe } from './text.js';

function clusterGeoEvents(candidates) {
  const clusters = [];
  for (const cand of candidates) {
    const match = clusters.find(
      (cluster) => cluster.location === cand.location && titleSimilarity(cluster.title, cand.title) >= 0.55
    );
    if (!match) {
      clusters.push({
        ...cand,
        sources: [{
          id: cand.sourceId,
          name: cand.sourceName,
          quality: cand.sourceQuality,
          url: cand.url,
          domain: cand.domain,
          seendate: cand.seendate,
        }],
      });
      continue;
    }

    if (cand.severity > match.severity) match.severity = cand.severity;
    if ((cand.title || '').length > (match.title || '').length) match.title = cand.title;
    const existing = match.sources.find((s) => s.url && cand.url && s.url === cand.url);
    if (!existing) {
      match.sources.push({
        id: cand.sourceId,
        name: cand.sourceName,
        quality: cand.sourceQuality,
        url: cand.url,
        domain: cand.domain,
        seendate: cand.seendate,
      });
    }
    const currentDate = parseGdeltSeenDate(match.seendate);
    const candidateDate = parseGdeltSeenDate(cand.seendate);
    if (!currentDate || (candidateDate && candidateDate > currentDate)) {
      match.seendate = cand.seendate;
    }
  }
  return clusters;
}

function createGeoHistoryStore({ resolvedAfterMs, historyTtlMs }) {
  const geoHistory = new Map();

  function historyEventKey(event) {
    const titleKey = normalizeTitleForDedupe(event.title || '').split(' ').slice(0, 8).join(' ');
    return `${event.location || 'unknown'}|${event.eventType || 'unknown'}|${titleKey}`;
  }

  function resolveHistoryKey(event) {
    const exactKey = historyEventKey(event);
    if (geoHistory.has(exactKey)) return exactKey;

    let bestKey = null;
    let bestScore = 0;
    const evType = String(event.eventType || '').toLowerCase();
    const evLoc = String(event.location || '').toLowerCase();

    for (const [key, rec] of geoHistory.entries()) {
      if (String(rec.location || '').toLowerCase() !== evLoc) continue;
      if (String(rec.eventType || '').toLowerCase() !== evType) continue;
      const sim = titleSimilarity(rec.title || '', event.title || '');
      if (sim > bestScore) {
        bestScore = sim;
        bestKey = key;
      }
    }

    return bestScore >= 0.58 ? bestKey : exactKey;
  }

  function publishedEventSeenMs(rec) {
    return parseGdeltSeenDate(rec?.seendate)?.getTime() || 0;
  }

  function update(currentEvents, nowMs) {
    const activeKeys = new Set();
    for (const event of currentEvents) {
      const key = resolveHistoryKey(event);
      activeKeys.add(key);
      const prev = geoHistory.get(key);
      const nowIso = new Date(nowMs).toISOString();
      const severityChanged = prev ? prev.severity !== event.severity : false;
      const titleChanged = prev ? prev.title !== event.title : false;
      const confidenceChanged = prev ? (prev.confidence?.score || 0) !== (event.confidence?.score || 0) : false;
      const sourceCountChanged = prev ? (prev.sourceCount || 0) !== (event.sourceCount || 0) : false;
      const changed = severityChanged || titleChanged || confidenceChanged || sourceCountChanged;

      if (!prev) {
        geoHistory.set(key, {
          ...event,
          ingestedAt: nowIso,
          historyKey: key,
          state: 'new',
          firstSeen: nowIso,
          lastSeen: nowIso,
          lastStateChange: nowIso,
        });
        continue;
      }

      let nextState = 'active';
      let lastStateChange = prev.lastStateChange || prev.lastSeen || nowIso;
      const firstSeenMs = new Date(prev.firstSeen || nowIso).getTime();
      if (changed) {
        nextState = 'updated';
        lastStateChange = nowIso;
      } else if (nowMs - firstSeenMs < 6 * 60 * 60 * 1000) {
        nextState = 'new';
      } else if (prev.state === 'resolved') {
        nextState = 'updated';
        lastStateChange = nowIso;
      }

      geoHistory.set(key, {
        ...prev,
        ...event,
        historyKey: key,
        state: nextState,
        firstSeen: prev.firstSeen || nowIso,
        lastSeen: nowIso,
        lastStateChange,
      });
    }

    for (const [key, record] of geoHistory.entries()) {
      if (activeKeys.has(key)) continue;
      const lastSeenMs = new Date(record.lastSeen || 0).getTime();
      if (!lastSeenMs) continue;
      if (nowMs - lastSeenMs >= resolvedAfterMs && record.state !== 'resolved') {
        geoHistory.set(key, {
          ...record,
          state: 'resolved',
          lastStateChange: new Date(nowMs).toISOString(),
        });
      }
    }

    for (const [key, record] of geoHistory.entries()) {
      const lastSeenMs = new Date(record.lastSeen || 0).getTime();
      if (!lastSeenMs || nowMs - lastSeenMs > historyTtlMs) {
        geoHistory.delete(key);
      }
    }
  }

  function filter(params, nowMs) {
    const timeline = String(params.timeline || '168').toLowerCase();
    const status = String(params.status || 'all').toLowerCase();
    const type = String(params.type || 'all').toLowerCase();
    const severityMin = Math.max(1, Math.min(3, parseInt(params.severity || '1', 10) || 1));
    const isOngoing = timeline === 'ongoing';

    const windowHours = isOngoing
      ? null
      : (timeline.endsWith('h') ? parseInt(timeline, 10) : parseInt(timeline, 10) || 168);
    const cutoffMs = isOngoing ? null : (nowMs - Math.max(1, windowHours) * 3_600_000);

    const rows = [...geoHistory.values()].filter((rec) => {
      if (isOngoing) {
        if (String(rec.state || '').toLowerCase() === 'resolved') return false;
      } else {
        const publishedSeenMs = publishedEventSeenMs(rec);
        if (!publishedSeenMs || publishedSeenMs < cutoffMs) return false;
      }
      if ((rec.severity || 1) < severityMin) return false;
      if (type !== 'all' && String(rec.eventType || '').toLowerCase() !== type) return false;
      if (status !== 'all' && String(rec.state || '').toLowerCase() !== status) return false;
      return true;
    });

    rows.sort((a, b) => {
      const rank = { new: 4, updated: 3, active: 2, resolved: 1 };
      const stateDelta = (rank[b.state] || 0) - (rank[a.state] || 0);
      if (stateDelta !== 0) return stateDelta;
      const confDelta = (b.confidence?.score || 0) - (a.confidence?.score || 0);
      if (confDelta !== 0) return confDelta;
      const publishedDelta = publishedEventSeenMs(b) - publishedEventSeenMs(a);
      if (publishedDelta !== 0) return publishedDelta;
      return new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime();
    });

    const deduped = [];
    for (const rec of rows) {
      const dup = deduped.find((existing) =>
        String(existing.location || '').toLowerCase() === String(rec.location || '').toLowerCase() &&
        String(existing.eventType || '').toLowerCase() === String(rec.eventType || '').toLowerCase() &&
        titleSimilarity(existing.title || '', rec.title || '') >= 0.58
      );
      if (!dup) {
        deduped.push(rec);
        continue;
      }
      const recSeen = publishedEventSeenMs(rec);
      const dupSeen = publishedEventSeenMs(dup);
      const recConf = rec.confidence?.score || 0;
      const dupConf = dup.confidence?.score || 0;
      if (recSeen > dupSeen || (recSeen === dupSeen && recConf > dupConf)) {
        Object.assign(dup, rec);
      }
    }

    const types = [...new Set(deduped.map((r) => r.eventType).filter(Boolean))].sort();
    return { rows: deduped.slice(0, 50), types, windowHours };
  }

  return { update, filter };
}

export { clusterGeoEvents, createGeoHistoryStore };
