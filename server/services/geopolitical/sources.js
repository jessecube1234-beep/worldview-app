import { GEO_SOURCES } from './constants.js';
import { extractTag, normalizeTitleForDedupe } from './text.js';

function createGeoSourcesClient({ fetchWithTimeout, HEADERS, logger }) {
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
      try {
        domain = link ? new URL(link).hostname.replace(/^www\./, '') : null;
      } catch {
        domain = null;
      }

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
    for (const result of results) {
      if (result.status === 'fulfilled') merged.push(...result.value);
      else logger.warn('GDELT window fetch failed:', result.reason?.message || result.reason);
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

    return articles
      .map((art) => ({
        title: art.title || '',
        url: art.url || null,
        domain: art.domain || null,
        seendate: art.seendate || null,
        sourceId: GEO_SOURCES.gdelt.id,
        sourceName: GEO_SOURCES.gdelt.name,
        sourceQuality: GEO_SOURCES.gdelt.quality,
      }))
      .filter((a) => a.title);
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
      else logger.warn('Geo source fetch failed:', result.reason?.message || result.reason);
    }
    return merged;
  }

  return {
    fetchAllGeoArticles,
  };
}

export { createGeoSourcesClient };
