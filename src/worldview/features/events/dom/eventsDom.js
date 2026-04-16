export function getEventsDomRefs() {
  return {
    eventsListEl: document.getElementById('events-list'),
    eventsUpdateEl: document.getElementById('events-update'),
    eventsFreshnessEl: document.getElementById('events-freshness'),
    eventsStatusFilterEl: document.getElementById('events-status-filter'),
    eventsSeverityFilterEl: document.getElementById('events-severity-filter'),
    eventsTypeFilterEl: document.getElementById('events-type-filter'),
    eventsTimelineButtons: [...document.querySelectorAll('.events-timeline')],
    eventsAlertsEnabledEl: document.getElementById('events-alerts-enabled'),
    eventsAlertSeverityEl: document.getElementById('events-alert-severity'),
    eventDetailPanel: document.getElementById('event-detail-panel'),
    eventDetailClose: document.getElementById('event-detail-close'),
    eventDetailMeta: document.getElementById('event-detail-meta'),
    eventDetailSummary: document.getElementById('event-detail-summary'),
    eventDetailType: document.getElementById('event-detail-type'),
    eventDetailActors: document.getElementById('event-detail-actors'),
    eventDetailSeverity: document.getElementById('event-detail-severity'),
    eventDetailConfidence: document.getElementById('event-detail-confidence'),
    eventDetailSeen: document.getElementById('event-detail-seen'),
    eventDetailSource: document.getElementById('event-detail-source'),
    eventDetailLink: document.getElementById('event-detail-link'),
    eventDetailCctvBtn: document.getElementById('event-detail-cctv'),
    eventDetailPinBtn: document.getElementById('event-detail-pin'),
    alertToastWrap: document.getElementById('alert-toast-wrap'),
  };
}

export function setEventsFreshness(eventsFreshnessEl, payload) {
  if (!eventsFreshnessEl) return;
  const isCached = Boolean(payload?.cached);
  eventsFreshnessEl.classList.remove('live', 'cached');
  eventsFreshnessEl.classList.add(isCached ? 'cached' : 'live');
  eventsFreshnessEl.textContent = isCached ? 'Cached feed' : 'Live feed';
}

export function populateEventTypeOptions(eventsTypeFilterEl, types, normalizeTypeValue, currentValue) {
  if (!eventsTypeFilterEl) return { nextType: 'all', hasCurrent: false };
  eventsTypeFilterEl.innerHTML = '<option value="all">All types</option>';
  for (const t of types || []) {
    const opt = document.createElement('option');
    opt.value = normalizeTypeValue(t);
    opt.textContent = t;
    eventsTypeFilterEl.appendChild(opt);
  }
  const hasCurrent = [...eventsTypeFilterEl.options].some((o) => o.value === currentValue);
  eventsTypeFilterEl.value = hasCurrent ? currentValue : 'all';
  return { nextType: eventsTypeFilterEl.value, hasCurrent };
}
