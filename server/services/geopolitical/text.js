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
      .filter((word) => word.length > 2 && !stop.has(word))
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

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  return decodeXmlEntities(stripHtml(m[1]));
}

export {
  decodeXmlEntities,
  stripHtml,
  normalizeTitleForDedupe,
  tokenSet,
  titleSimilarity,
  parseGdeltSeenDate,
  extractTag,
};
