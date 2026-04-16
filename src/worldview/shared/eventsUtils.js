export function createEventSvgFactory() {
    const cache = {};
    return function eventSVG(severity) {
      if (cache[severity]) return cache[severity];
      const color = severity === 3 ? '#ff4444' : severity === 2 ? '#ff8c00' : '#ffe066';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="none" stroke="${color}" stroke-width="1" opacity="0.35"/><circle cx="15" cy="15" r="8" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.65"/><circle cx="15" cy="15" r="3.5" fill="${color}" opacity="0.95"/></svg>`;
      cache[severity] = `data:image/svg+xml;base64,${btoa(svg)}`;
      return cache[severity];
    };
  }
export function eventKey(ev) {
    return `${ev.location || ''}|${ev.title || ''}|${Number(ev.lat).toFixed(3)}|${Number(ev.lon).toFixed(3)}`;
  }
export function formatEventTime(seendate) {
    if (!seendate) return '';
    try {
      const s = String(seendate);
      const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:00Z`);
      if (Number.isNaN(d.getTime())) return '';
      const deltaMs = Date.now() - d.getTime();
      if (!Number.isFinite(deltaMs)) return '';
      if (deltaMs < 0) return 'just now';
      const h = Math.floor(deltaMs / 3_600_000);
      const m = Math.floor((deltaMs % 3_600_000) / 60_000);
      return h > 0 ? `${h}h ago` : `${m}m ago`;
    } catch {
      return '';
    }
  }
export function confidenceClass(confidence) {
    const label = String(confidence?.label || '').toLowerCase();
    if (label.includes('high')) return 'high';
    if (label.includes('medium')) return 'medium';
    return 'low';
  }
export function severityLabel(severity) {
    return severity === 3 ? 'Critical' : severity === 2 ? 'High' : 'Moderate';
  }
export function formatEventTimestamp(ts) {
    if (!ts) return 'Unknown';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleString();
  }
export function normalizeTypeValue(v) {
    return String(v || '').toLowerCase();
  }
export function renderEventsLoading(eventsListEl, count = 4) {
    if (!eventsListEl) return;
    const rows = [];
    for (let i = 0; i < count; i++) {
      rows.push('<div class="events-skeleton"><div class="events-skeleton-bar"></div><div class="events-skeleton-bar short"></div></div>');
    }
    eventsListEl.innerHTML = rows.join('');
  }
export function renderEventsEmpty(eventsListEl, message, hint = '') {
    if (!eventsListEl) return;
    const hintHtml = hint ? `<span class="events-empty-hint">${hint}</span>` : '';
    eventsListEl.innerHTML = `<div class="events-empty">${message}${hintHtml}</div>`;
  }
export function showAlertToast(alertToastWrap, message, severity = 2, ttl = 7000) {
    if (!alertToastWrap) return;
    const toast = document.createElement('div');
    toast.className = `alert-toast sev-${severity}`;
    toast.textContent = message;
    alertToastWrap.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, ttl);
  }
export function maybeDesktopNotify(enabled, title, body) {
    if (!enabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body });
    } catch (_) {}
  }


