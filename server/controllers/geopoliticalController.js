function createGeopoliticalHandler(deps) {
  const fetchWithTimeout = deps.fetchWithTimeout;
  const HEADERS = deps.HEADERS;

  //  Geopolitical Events  GDELT news API 
  let geoCache     = null;
  let geoCacheFetchedAt = 0;
  let geoCacheSource = 'fallback';
  let geoRefreshingPromise = null;
  const GEO_CACHE_REFRESH_MS = 2 * 60 * 1000;
  const GEO_WAIT_FOR_REFRESH_MS = 1200;
  const GEO_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const GEO_RESOLVED_AFTER_MS = 2 * 60 * 60 * 1000;
  const geoHistory = new Map();
  
  // Location lookup: scan article titles for these names  map to lat/lon
  const LOCATION_MAP = [
    { names: ['ukraine','ukrainian','kyiv','kharkiv','zaporizhzhia','odesa','kherson','donbas','mariupol'], lat: 49.0, lon: 31.0, label: 'Ukraine' },
    { names: ['gaza','hamas','rafah','west bank','palestine','palestinian'], lat: 31.5, lon: 34.5, label: 'Gaza/Palestine' },
    { names: ['israel','israeli','netanyahu','idf','tel aviv'], lat: 31.8, lon: 35.0, label: 'Israel' },
    { names: ['russia','russian','moscow','kremlin','putin'], lat: 55.75, lon: 37.6, label: 'Russia' },
    { names: ['iran','iranian','tehran','irgc','revolutionary guard'], lat: 32.0, lon: 53.0, label: 'Iran' },
    { names: ['north korea','pyongyang','dprk','kim jong'], lat: 39.0, lon: 125.8, label: 'North Korea' },
    { names: ['taiwan strait'], lat: 24.0, lon: 119.5, label: 'Taiwan Strait' },
    { names: ['taiwan','taiwanese','taipei'], lat: 23.7, lon: 121.0, label: 'Taiwan' },
    { names: ['china','chinese','beijing','pla','xi jinping'], lat: 39.9, lon: 116.4, label: 'China' },
    { names: ['red sea','bab el-mandeb','suez'], lat: 14.5, lon: 41.0, label: 'Red Sea' },
    { names: ['yemen','yemeni','houthi','sanaa','aden'], lat: 15.5, lon: 48.0, label: 'Yemen' },
    { names: ['sudan','sudanese','khartoum','rsf','rapid support forces'], lat: 15.5, lon: 32.5, label: 'Sudan' },
    { names: ['syria','syrian','damascus','aleppo'], lat: 34.8, lon: 38.9, label: 'Syria' },
    { names: ['myanmar','burma','burmese','naypyidaw'], lat: 19.0, lon: 96.5, label: 'Myanmar' },
    { names: ['somalia','somali','mogadishu','al-shabaab','al shabaab'], lat: 5.5, lon: 46.0, label: 'Somalia' },
    { names: ['ethiopia','ethiopian','tigray','addis ababa'], lat: 9.0, lon: 40.0, label: 'Ethiopia' },
    { names: ['mali','malian','bamako'], lat: 17.0, lon: -4.0, label: 'Mali' },
    { names: ['niger','nigerien','niamey'], lat: 17.0, lon: 8.0, label: 'Niger' },
    { names: ['burkina faso','ouagadougou'], lat: 12.5, lon: -1.5, label: 'Burkina Faso' },
    { names: ['congo','drc','kinshasa','democratic republic of congo'], lat: -4.3, lon: 15.3, label: 'DR Congo' },
    { names: ['libya','libyan','tripoli'], lat: 27.0, lon: 17.0, label: 'Libya' },
    { names: ['lebanon','lebanese','beirut','hezbollah'], lat: 33.9, lon: 35.5, label: 'Lebanon' },
    { names: ['iraq','iraqi','baghdad','mosul','erbil'], lat: 33.3, lon: 44.4, label: 'Iraq' },
    { names: ['afghanistan','afghan','kabul','taliban'], lat: 33.0, lon: 65.0, label: 'Afghanistan' },
    { names: ['pakistan','pakistani','islamabad'], lat: 30.0, lon: 70.0, label: 'Pakistan' },
    { names: ['south china sea','spratly','paracel'], lat: 12.0, lon: 114.0, label: 'South China Sea' },
    { names: ['haiti','haitian','port-au-prince'], lat: 19.0, lon: -72.5, label: 'Haiti' },
    { names: ['venezuela','venezuelan','caracas','maduro'], lat: 7.5, lon: -66.5, label: 'Venezuela' },
    { names: ['serbia','serbian','belgrade','kosovo'], lat: 44.0, lon: 21.0, label: 'Serbia/Kosovo' },
    { names: ['nagorno-karabakh','azerbaijan','armenia','yerevan','baku'], lat: 40.0, lon: 47.0, label: 'Caucasus' },
    { names: ['turkey','turkish','ankara','erdogan'], lat: 39.0, lon: 35.0, label: 'Turkey' },
    { names: ['philippines','philippine','manila','marcos'], lat: 13.0, lon: 122.0, label: 'Philippines' },
    { names: ['kashmir','india-pakistan'], lat: 34.0, lon: 74.0, label: 'Kashmir' },
    { names: ['india','indian','new delhi','modi'], lat: 20.0, lon: 77.0, label: 'India' },
    { names: ['saudi','riyadh'], lat: 24.7, lon: 46.7, label: 'Saudi Arabia' },
    { names: ['nato'], lat: 50.9, lon: 4.3, label: 'NATO' },
    { names: ['pentagon','us military','u.s. military','american forces'], lat: 38.9, lon: -77.0, label: 'United States' },
  ];
  
  const HIGH_WORDS = ['killed','kills','dead','deaths','death toll','attack','attacked','bombing','bombed','airstrike','airstrikes','missile','missiles','invasion','invades','combat','offensive','casualties','explosion','strike','siege','massacre','murdered'];
  const MED_WORDS  = ['military','conflict','tension','nuclear','threat','threatens','sanctions','weapons','escalat','warning','hostil','ceasefire','war','troops','forces','fighting','captured','detain','unrest','crisis','shelling','artillery','drone'];
  
  function scoreTitle(title) {
    const t = title.toLowerCase();
    if (HIGH_WORDS.some(w => t.includes(w))) return 3;
    if (MED_WORDS.some(w => t.includes(w)))  return 2;
    return 1;
  }
  
  function extractLocation(title) {
    const t = title.toLowerCase();
    for (const loc of LOCATION_MAP) {
      if (loc.names.some(n => t.includes(n))) return loc;
    }
    return null;
  }
  
  const EVENT_TYPE_RULES = [
    { type: 'Airstrike/Bombing', words: ['airstrike', 'air strike', 'bombing', 'bombed'] },
    { type: 'Missile/Drone Strike', words: ['missile', 'drone'] },
    { type: 'Ground Combat', words: ['offensive', 'troops', 'forces', 'captured', 'siege', 'fighting', 'combat'] },
    { type: 'Naval/Shipping Security', words: ['red sea', 'shipping', 'maritime', 'strait', 'navy'] },
    { type: 'Civil Unrest/Protest', words: ['protest', 'riot', 'unrest'] },
    { type: 'Diplomatic/Sanctions', words: ['sanction', 'ceasefire', 'talks', 'summit', 'diplomat', 'negotiation'] },
    { type: 'Terror/Insurgency', words: ['isis', 'terror', 'militant', 'houthi', 'hamas', 'hezbollah', 'taliban'] },
  ];
  
  const ACTOR_HINTS = [
    ['russia', 'Russia'],
    ['ukraine', 'Ukraine'],
    ['israel', 'Israel'],
    ['palestine', 'Palestinian groups'],
    ['hamas', 'Hamas'],
    ['iran', 'Iran'],
    ['houthi', 'Houthis'],
    ['china', 'China'],
    ['taiwan', 'Taiwan'],
    ['north korea', 'North Korea'],
    ['south korea', 'South Korea'],
    ['india', 'India'],
    ['pakistan', 'Pakistan'],
    ['nato', 'NATO'],
    ['u.s.', 'United States'],
    ['us military', 'United States'],
  ];
  
  function classifyEventType(title = '') {
    const t = title.toLowerCase();
    for (const rule of EVENT_TYPE_RULES) {
      if (rule.words.some(w => t.includes(w))) return rule.type;
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
  
  function parseGdeltSeenDate(seendate) {
    if (!seendate) return null;
    const s = String(seendate);
    if (/^\d{8}T\d{6}Z$/.test(s)) {
      const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
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
  
  function normalizeGeoEvent(ev, opts = {}) {
    const fallback = Boolean(opts.fallback);
    const eventType = ev.eventType || classifyEventType(ev.title || '');
    const actors = Array.isArray(ev.actors) && ev.actors.length
      ? ev.actors
      : inferActors(ev.title || '', ev.location || '');
    const confidence = ev.confidence || scoreConfidence({ ...ev, fallback });
    const sourceLinks = Array.isArray(ev.sourceLinks)
      ? ev.sourceLinks
      : ev.url
        ? [{ url: ev.url, domain: ev.domain || null }]
        : [];
    return {
      ...ev,
      ingestedAt: ev.ingestedAt || new Date().toISOString(),
      eventType,
      actors,
      confidence,
      sourceLinks,
      summary: ev.summary || buildEventSummary({
        title: ev.title || 'Untitled event',
        location: ev.location || 'Unknown location',
        eventType,
        actors,
        severity: ev.severity || 1,
      }),
      sourceCount: ev.sourceCount || sourceLinks.length,
      sourceTier: ev.sourceTier || (fallback ? 'fallback' : 'open-source'),
    };
  }
  
  const GEO_SOURCES = {
    gdelt: { id: 'gdelt', name: 'GDELT', quality: 0.58 },
    bbc: { id: 'bbc', name: 'BBC RSS', quality: 0.85 },
    googlenews: { id: 'googlenews', name: 'Google News RSS', quality: 0.65 },
  };
  
  function decodeXmlEntities(text = '') {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  
  function stripHtml(text = '') {
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  function normalizeTitleForDedupe(title = '') {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  function tokenSet(title = '') {
    const stop = new Set(['the', 'a', 'an', 'in', 'on', 'for', 'to', 'of', 'and', 'with', 'at', 'from', 'is', 'are']);
    return new Set(
      normalizeTitleForDedupe(title)
        .split(' ')
        .filter(w => w.length > 2 && !stop.has(w))
    );
  }
  
  function titleSimilarity(a = '', b = '') {
    const ta = tokenSet(a);
    const tb = tokenSet(b);
    if (!ta.size || !tb.size) return 0;
    let overlap = 0;
    for (const tok of ta) if (tb.has(tok)) overlap++;
    return overlap / Math.max(ta.size, tb.size);
  }
  
  function extractTag(block, tag) {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (!m) return '';
    return decodeXmlEntities(stripHtml(m[1]));
  }
  
  async function fetchRssArticles(url, sourceMeta, limit = 60) {
    const r = await fetchWithTimeout(url, { headers: HEADERS, timeout: 9000 });
    if (!r.ok) throw new Error(`${sourceMeta.name} ${r.status}`);
    const xml = await r.text();
    const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
    const out = [];
    for (const match of items.slice(0, limit)) {
      const block = match[0];
      const title = extractTag(block, 'title');
      if (!title) continue;
      const link = extractTag(block, 'link');
      const pubDate = extractTag(block, 'pubDate');
      let domain = null;
      try { domain = link ? new URL(link).hostname.replace(/^www\./, '') : null; } catch { domain = null; }
      out.push({
        title,
        url: link || null,
        domain,
        seendate: pubDate || null,
        sourceId: sourceMeta.id,
        sourceName: sourceMeta.name,
        sourceQuality: sourceMeta.quality,
      });
    }
    return out;
  }
  
  async function fetchGdeltArticles() {
    const q = encodeURIComponent('war attack military killed airstrike missile troops invasion conflict');
    const windows = ['24h', '168h', '720h'];
    const results = await Promise.allSettled(
      windows.map(async (timespan) => {
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=120&format=json&timespan=${timespan}&sourcelang=English`;
        const r = await fetchWithTimeout(url, { headers: HEADERS, timeout: 11000 });
        if (!r.ok) throw new Error(`GDELT ${timespan} ${r.status}`);
        const data = await r.json();
        return Array.isArray(data.articles) ? data.articles : [];
      })
    );
  
    const merged = [];
    for (const r of results) {
      if (r.status === 'fulfilled') merged.push(...r.value);
      else console.warn('GDELT window fetch failed:', r.reason?.message || r.reason);
    }
    if (!merged.length) throw new Error('GDELT unavailable for all windows');
  
    const seen = new Set();
    const articles = [];
    for (const art of merged) {
      const key = `${art.url || ''}|${normalizeTitleForDedupe(art.title || '')}|${art.seendate || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push(art);
    }
  
    return articles.map(art => ({
      title: art.title || '',
      url: art.url || null,
      domain: art.domain || null,
      seendate: art.seendate || null,
      sourceId: GEO_SOURCES.gdelt.id,
      sourceName: GEO_SOURCES.gdelt.name,
      sourceQuality: GEO_SOURCES.gdelt.quality,
    })).filter(a => a.title);
  }
  
  async function fetchAllGeoArticles() {
    const results = await Promise.allSettled([
      fetchGdeltArticles(),
      fetchRssArticles('https://feeds.bbci.co.uk/news/world/rss.xml', GEO_SOURCES.bbc),
      fetchRssArticles('https://news.google.com/rss/search?q=war+attack+missile+ceasefire+conflict&hl=en-US&gl=US&ceid=US:en', GEO_SOURCES.googlenews),
    ]);
    const merged = [];
    for (const result of results) {
      if (result.status === 'fulfilled') merged.push(...result.value);
      else console.warn('Geo source fetch failed:', result.reason?.message || result.reason);
    }
    return merged;
  }
  
  function clusterGeoEvents(candidates) {
    const clusters = [];
    for (const cand of candidates) {
      const match = clusters.find(cluster =>
        cluster.location === cand.location && titleSimilarity(cluster.title, cand.title) >= 0.55
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
      const existingSource = match.sources.find(s => s.url && cand.url && s.url === cand.url);
      if (!existingSource) {
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
  
  function historyEventKey(ev) {
    const titleKey = normalizeTitleForDedupe(ev.title || '').split(' ').slice(0, 8).join(' ');
    return `${ev.location || 'unknown'}|${ev.eventType || 'unknown'}|${titleKey}`;
  }
  
  function resolveHistoryKey(ev) {
    const exactKey = historyEventKey(ev);
    if (geoHistory.has(exactKey)) return exactKey;
  
    let bestKey = null;
    let bestScore = 0;
    const evType = String(ev.eventType || '').toLowerCase();
    const evLoc = String(ev.location || '').toLowerCase();
  
    for (const [key, rec] of geoHistory.entries()) {
      if (String(rec.location || '').toLowerCase() !== evLoc) continue;
      if (String(rec.eventType || '').toLowerCase() !== evType) continue;
  
      const sim = titleSimilarity(rec.title || '', ev.title || '');
      if (sim > bestScore) {
        bestScore = sim;
        bestKey = key;
      }
    }
  
    return bestScore >= 0.58 ? bestKey : exactKey;
  }
  
  function effectiveEventSeenMs(rec) {
    const sourceSeenMs = parseGdeltSeenDate(rec?.seendate)?.getTime() || 0;
    const firstSeenMs = new Date(rec?.firstSeen || 0).getTime() || 0;
    const ingestSeenMs = new Date(rec?.ingestedAt || 0).getTime() || 0;
    // Timeline tabs should track event occurrence/discovery time, not refresh time.
    return sourceSeenMs || firstSeenMs || ingestSeenMs || 0;
  }
  
  function updateGeoHistory(currentEvents, nowMs) {
    const activeKeys = new Set();
  
    for (const ev of currentEvents) {
      const key = resolveHistoryKey(ev);
      activeKeys.add(key);
      const prev = geoHistory.get(key);
      const nowIso = new Date(nowMs).toISOString();
      const severityChanged = prev ? prev.severity !== ev.severity : false;
      const titleChanged = prev ? prev.title !== ev.title : false;
      const confidenceChanged = prev ? (prev.confidence?.score || 0) !== (ev.confidence?.score || 0) : false;
      const sourceCountChanged = prev ? (prev.sourceCount || 0) !== (ev.sourceCount || 0) : false;
      const changed = severityChanged || titleChanged || confidenceChanged || sourceCountChanged;
  
      if (!prev) {
        geoHistory.set(key, {
          ...ev,
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
        ...ev,
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
      if (nowMs - lastSeenMs >= GEO_RESOLVED_AFTER_MS && record.state !== 'resolved') {
        geoHistory.set(key, {
          ...record,
          state: 'resolved',
          lastStateChange: new Date(nowMs).toISOString(),
        });
      }
    }
  
    for (const [key, record] of geoHistory.entries()) {
      const lastSeenMs = new Date(record.lastSeen || 0).getTime();
      if (!lastSeenMs || nowMs - lastSeenMs > GEO_HISTORY_TTL_MS) {
        geoHistory.delete(key);
      }
    }
  }
  
  function filterGeoHistory(params, nowMs) {
    const timeline = String(params.timeline || '168').toLowerCase();
    const status = String(params.status || 'all').toLowerCase();
    const type = String(params.type || 'all').toLowerCase();
    const severityMin = Math.max(1, Math.min(3, parseInt(params.severity || '1', 10) || 1));
    const isOngoing = timeline === 'ongoing';
  
    const windowHours = isOngoing
      ? null
      : (timeline.endsWith('h') ? parseInt(timeline, 10) : parseInt(timeline, 10) || 168);
    const cutoffMs = isOngoing ? null : (nowMs - Math.max(1, windowHours) * 3_600_000);
  
    const rows = [...geoHistory.values()].filter(rec => {
      if (isOngoing) {
        const recState = String(rec.state || '').toLowerCase();
        if (recState === 'resolved') return false;
      } else {
        // Strict recency for 24h/7d/30d tabs with robust fallback.
        // We use whichever timestamp is freshest so ongoing feed records do not disappear
        // simply because an upstream source omits/uses stale publication timestamps.
        const effectiveSeenMs = effectiveEventSeenMs(rec);
        if (!effectiveSeenMs || effectiveSeenMs < cutoffMs) return false;
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
      return new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime();
    });
  
    // Collapse near-duplicate records caused by headline wording drift across refreshes.
    const deduped = [];
    for (const rec of rows) {
      const dup = deduped.find(existing =>
        String(existing.location || '').toLowerCase() === String(rec.location || '').toLowerCase() &&
        String(existing.eventType || '').toLowerCase() === String(rec.eventType || '').toLowerCase() &&
        titleSimilarity(existing.title || '', rec.title || '') >= 0.58
      );
      if (!dup) {
        deduped.push(rec);
        continue;
      }
      const recSeen = effectiveEventSeenMs(rec);
      const dupSeen = effectiveEventSeenMs(dup);
      const recConf = rec.confidence?.score || 0;
      const dupConf = dup.confidence?.score || 0;
      if (recSeen > dupSeen || (recSeen === dupSeen && recConf > dupConf)) {
        Object.assign(dup, rec);
      }
    }
  
    const types = [...new Set(deduped.map(r => r.eventType).filter(Boolean))].sort();
    return { rows: deduped.slice(0, 50), types, windowHours };
  }
  
  const FALLBACK_EVENTS = [
    { title: 'Ongoing Russia-Ukraine conflict', location: 'Ukraine', lat: 49.0, lon: 31.0, severity: 3, url: null },
    { title: 'Gaza conflict and humanitarian situation', location: 'Gaza/Palestine', lat: 31.5, lon: 34.5, severity: 3, url: null },
    { title: 'Houthi attacks on Red Sea shipping', location: 'Yemen', lat: 15.5, lon: 48.0, severity: 3, url: null },
    { title: 'Taiwan Strait military tensions', location: 'Taiwan Strait', lat: 24.0, lon: 119.5, severity: 2, url: null },
    { title: 'North Korea ballistic missile program', location: 'North Korea', lat: 39.0, lon: 125.8, severity: 2, url: null },
    { title: 'Sudan civil war - RSF conflict', location: 'Sudan', lat: 15.5, lon: 32.5, severity: 3, url: null },
    { title: 'Iran nuclear program tensions', location: 'Iran', lat: 32.0, lon: 53.0, severity: 2, url: null },
    { title: 'South China Sea territorial disputes', location: 'South China Sea', lat: 12.0, lon: 114.0, severity: 2, url: null },
    { title: 'Myanmar civil war - military junta', location: 'Myanmar', lat: 19.0, lon: 96.5, severity: 3, url: null },
    { title: 'Sahel instability - Mali/Burkina Faso', location: 'Mali', lat: 17.0, lon: -4.0, severity: 2, url: null },
  ].map(ev => normalizeGeoEvent(ev, { fallback: true }));

  async function refreshGeoCache() {
    const now = Date.now();
    const articles = await fetchAllGeoArticles();
    const candidates = [];
    for (const art of articles) {
      if (!art.title) continue;
      const loc = extractLocation(art.title);
      if (!loc) continue;
      candidates.push({
        title: art.title,
        location: loc.label,
        lat: loc.lat,
        lon: loc.lon,
        severity: scoreTitle(art.title),
        url: art.url || null,
        domain: art.domain || null,
        seendate: art.seendate || null,
        sourceId: art.sourceId,
        sourceName: art.sourceName,
        sourceQuality: art.sourceQuality,
      });
    }

    const clusters = clusterGeoEvents(candidates);
    const events = clusters.map(cluster => {
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
          .filter(s => s.url)
          .slice(0, 3)
          .map(s => ({ url: s.url, domain: s.domain || s.name })),
        sourceCount,
        sourceQuality: avgSourceQuality,
        summary: `Corroborated by ${sourceCount} source${sourceCount === 1 ? '' : 's'}. ${cluster.title}`,
      });
    });

    events.sort((a, b) => (b.confidence?.score || 0) - (a.confidence?.score || 0));
    const top10 = events.slice(0, 20);

    if (top10.length < 5) {
      for (const fb of FALLBACK_EVENTS) {
        if (top10.length >= 10) break;
        if (!top10.some(e => e.location === fb.location)) top10.push(fb);
      }
    }

    geoCache = top10;
    geoCacheFetchedAt = now;
    geoCacheSource = 'live';
    updateGeoHistory(top10, now);
    console.log(`Geopolitical cache refreshed: ${events.length} clustered from ${candidates.length} raw articles`);
  }
  
  return async function geopolitical(_req, res) {
    const now = Date.now();
    const hasGeoCache = Array.isArray(geoCache) && geoCache.length > 0;
    const cacheAgeMs = hasGeoCache ? (now - geoCacheFetchedAt) : Number.POSITIVE_INFINITY;
    const cacheStale = cacheAgeMs >= GEO_CACHE_REFRESH_MS;

    if ((!hasGeoCache || cacheStale) && !geoRefreshingPromise) {
      geoRefreshingPromise = refreshGeoCache()
        .catch((err) => {
          console.error('Geopolitical refresh error:', err.message);
          if (!hasGeoCache) {
            geoCache = FALLBACK_EVENTS;
            geoCacheSource = 'fallback';
            geoCacheFetchedAt = Date.now();
            updateGeoHistory(FALLBACK_EVENTS, Date.now());
          }
        })
        .finally(() => {
          geoRefreshingPromise = null;
        });
    }

    if (hasGeoCache) {
      const filtered = filterGeoHistory(_req.query, now);
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
      const filtered = filterGeoHistory(_req.query, Date.now());
      return res.json({
        events: filtered.rows,
        availableTypes: filtered.types,
        timelineHours: filtered.windowHours,
        cached: geoCacheSource !== 'live',
      });
    }

    updateGeoHistory(FALLBACK_EVENTS, now);
    const filtered = filterGeoHistory(_req.query, now);
    const wantsOngoing = String(_req.query?.timeline || '').toLowerCase() === 'ongoing';
    res.json({
      events: filtered.rows.length ? filtered.rows : (wantsOngoing ? FALLBACK_EVENTS : []),
      availableTypes: filtered.types,
      timelineHours: filtered.windowHours,
      cached: true,
    });
  };
  
}

export { createGeopoliticalHandler };


