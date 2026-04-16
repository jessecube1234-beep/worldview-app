import { ACTOR_HINTS, EVENT_TYPE_RULES, HIGH_WORDS, LOCATION_MAP, MED_WORDS } from './constants.js';
import { parseGdeltSeenDate } from './text.js';

function scoreTitle(title) {
  const t = title.toLowerCase();
  if (HIGH_WORDS.some((w) => t.includes(w))) return 3;
  if (MED_WORDS.some((w) => t.includes(w))) return 2;
  return 1;
}

function extractLocation(title) {
  const t = title.toLowerCase();
  for (const loc of LOCATION_MAP) {
    if (loc.names.some((n) => t.includes(n))) return loc;
  }
  return null;
}

function classifyEventType(title = '') {
  const t = title.toLowerCase();
  for (const rule of EVENT_TYPE_RULES) {
    if (rule.words.some((word) => t.includes(word))) return rule.type;
  }
  return 'Military/Geopolitical Tension';
}

function inferActors(title = '', location = '') {
  const t = title.toLowerCase();
  const actors = new Set();
  for (const [word, label] of ACTOR_HINTS) {
    if (t.includes(word)) actors.add(label);
  }
  if (!actors.size && location) actors.add(location);
  return [...actors].slice(0, 3);
}

function scoreConfidence({
  title,
  severity,
  url,
  domain,
  seendate,
  sourceQuality = 0.55,
  sourceCount = 1,
  fallback = false,
}) {
  if (fallback) return { score: 34, label: 'LOW' };
  let score = 28 + (severity || 1) * 12;
  if (url) score += 8;
  if (domain) score += 7;
  score += Math.round(Math.max(0, Math.min(1, sourceQuality)) * 18);
  score += Math.min(16, (Math.max(1, sourceCount) - 1) * 5);
  const seenAt = parseGdeltSeenDate(seendate);
  if (seenAt) {
    const ageHours = Math.max(0, (Date.now() - seenAt.getTime()) / 3_600_000);
    if (ageHours <= 6) score += 8;
    else if (ageHours <= 24) score += 5;
    else if (ageHours <= 72) score += 2;
  }
  if ((title || '').length >= 70) score += 3;
  score = Math.max(25, Math.min(92, Math.round(score)));
  return {
    score,
    label: score >= 75 ? 'HIGH' : score >= 55 ? 'MEDIUM' : 'LOW',
  };
}

function buildEventSummary({ title, location, eventType, actors, severity }) {
  const sevLabel = severity === 3 ? 'critical' : severity === 2 ? 'high' : 'moderate';
  const actorText = actors && actors.length ? actors.join(', ') : location;
  const lead = `${eventType} with ${sevLabel} impact indicators around ${location}.`;
  return `${lead} Actors mentioned: ${actorText}. Headline: ${title}`;
}

function normalizeGeoEvent(event, opts = {}) {
  const fallback = Boolean(opts.fallback);
  const eventType = event.eventType || classifyEventType(event.title || '');
  const actors = Array.isArray(event.actors) && event.actors.length
    ? event.actors
    : inferActors(event.title || '', event.location || '');
  const confidence = event.confidence || scoreConfidence({ ...event, fallback });
  const sourceLinks = Array.isArray(event.sourceLinks)
    ? event.sourceLinks
    : event.url
      ? [{ url: event.url, domain: event.domain || null }]
      : [];

  return {
    ...event,
    ingestedAt: event.ingestedAt || new Date().toISOString(),
    eventType,
    actors,
    confidence,
    sourceLinks,
    summary: event.summary || buildEventSummary({
      title: event.title || 'Untitled event',
      location: event.location || 'Unknown location',
      eventType,
      actors,
      severity: event.severity || 1,
    }),
    sourceCount: event.sourceCount || sourceLinks.length,
    sourceTier: event.sourceTier || (fallback ? 'fallback' : 'open-source'),
  };
}

export {
  scoreTitle,
  extractLocation,
  classifyEventType,
  inferActors,
  scoreConfidence,
  buildEventSummary,
  normalizeGeoEvent,
};
