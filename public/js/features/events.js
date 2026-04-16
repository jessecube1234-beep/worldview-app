(function initWorldViewEventsModule(global) {
  function initWorldViewEvents(deps) {
    const {
      viewer,
      state,
      eventTextImage,
      openEventCCTV,
    } = deps;

    const eventsListEl = document.getElementById('events-list');
    const eventsUpdateEl = document.getElementById('events-update');
    const eventsFreshnessEl = document.getElementById('events-freshness');
    const eventsStatusFilterEl = document.getElementById('events-status-filter');
    const eventsSeverityFilterEl = document.getElementById('events-severity-filter');
    const eventsTypeFilterEl = document.getElementById('events-type-filter');
    const eventsTimelineButtons = [...document.querySelectorAll('.events-timeline')];
    const eventsAlertsEnabledEl = document.getElementById('events-alerts-enabled');
    const eventsAlertSeverityEl = document.getElementById('events-alert-severity');
    const eventDetailPanel = document.getElementById('event-detail-panel');
    const eventDetailClose = document.getElementById('event-detail-close');
    const eventDetailMeta = document.getElementById('event-detail-meta');
    const eventDetailSummary = document.getElementById('event-detail-summary');
    const eventDetailType = document.getElementById('event-detail-type');
    const eventDetailActors = document.getElementById('event-detail-actors');
    const eventDetailSeverity = document.getElementById('event-detail-severity');
    const eventDetailConfidence = document.getElementById('event-detail-confidence');
    const eventDetailSeen = document.getElementById('event-detail-seen');
    const eventDetailSource = document.getElementById('event-detail-source');
    const eventDetailLink = document.getElementById('event-detail-link');
    const eventDetailCctvBtn = document.getElementById('event-detail-cctv');
    const eventDetailPinBtn = document.getElementById('event-detail-pin');
    const alertToastWrap = document.getElementById('alert-toast-wrap');

    let eventSelectedKey = '';
    let currentEventDetail = null;
    let pinnedEventKey = localStorage.getItem('worldview.events.pinned') || '';
    const alertedEventTimes = new Map();
    const eventView = {
      timeline: '24',
      status: 'all',
      severity: '1',
      type: 'all',
    };
    const eventAlerts = {
      enabled: localStorage.getItem('worldview.alerts.enabled') === '1',
      severity: localStorage.getItem('worldview.alerts.severity') || '2',
    };
    let geoRequestSeq = 0;

    const evtSVGCache = {};
    function eventSVG(severity) {
      if (evtSVGCache[severity]) return evtSVGCache[severity];
      const color = severity === 3 ? '#ff4444' : severity === 2 ? '#ff8c00' : '#ffe066';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="none" stroke="${color}" stroke-width="1" opacity="0.35"/><circle cx="15" cy="15" r="8" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.65"/><circle cx="15" cy="15" r="3.5" fill="${color}" opacity="0.95"/></svg>`;
      evtSVGCache[severity] = 'data:image/svg+xml;base64,' + btoa(svg);
      return evtSVGCache[severity];
    }

    function clearEventEntities() {
      state.eventEntities.forEach(({ entity, labelEntity }) => {
        viewer.entities.remove(entity);
        if (labelEntity) viewer.entities.remove(labelEntity);
      });
      state.eventEntities = [];
    }

    function eventKey(ev) {
      return `${ev.location || ''}|${ev.title || ''}|${Number(ev.lat).toFixed(3)}|${Number(ev.lon).toFixed(3)}`;
    }

    function formatEventTime(seendate) {
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

    function confidenceClass(confidence) {
      const label = String(confidence?.label || '').toLowerCase();
      if (label.includes('high')) return 'high';
      if (label.includes('medium')) return 'medium';
      return 'low';
    }

    function severityLabel(severity) {
      return severity === 3 ? 'Critical' : severity === 2 ? 'High' : 'Moderate';
    }

    function formatEventTimestamp(ts) {
      if (!ts) return 'Unknown';
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return 'Unknown';
      return d.toLocaleString();
    }

    function normalizeTypeValue(v) {
      return String(v || '').toLowerCase();
    }

    function populateEventTypeOptions(types = []) {
      if (!eventsTypeFilterEl) return;
      const current = eventsTypeFilterEl.value || 'all';
      eventsTypeFilterEl.innerHTML = '<option value="all">All types</option>';
      for (const t of types) {
        const opt = document.createElement('option');
        opt.value = normalizeTypeValue(t);
        opt.textContent = t;
        eventsTypeFilterEl.appendChild(opt);
      }
      if ([...eventsTypeFilterEl.options].some((o) => o.value === current)) {
        eventsTypeFilterEl.value = current;
      } else {
        eventsTypeFilterEl.value = 'all';
        eventView.type = 'all';
      }
    }

    function setEventsFreshness(payload) {
      if (!eventsFreshnessEl) return;
      const isCached = Boolean(payload?.cached);
      eventsFreshnessEl.classList.remove('live', 'cached');
      eventsFreshnessEl.classList.add(isCached ? 'cached' : 'live');
      eventsFreshnessEl.textContent = isCached ? 'Cached feed' : 'Live feed';
    }

    function renderEventsLoading(count = 4) {
      if (!eventsListEl) return;
      const rows = [];
      for (let i = 0; i < count; i++) {
        rows.push('<div class="events-skeleton"><div class="events-skeleton-bar"></div><div class="events-skeleton-bar short"></div></div>');
      }
      eventsListEl.innerHTML = rows.join('');
    }

    function renderEventsEmpty(message, hint = '') {
      if (!eventsListEl) return;
      const hintHtml = hint ? `<span class="events-empty-hint">${hint}</span>` : '';
      eventsListEl.innerHTML = `<div class="events-empty">${message}${hintHtml}</div>`;
    }

    function syncPinnedEventStorage() {
      if (pinnedEventKey) localStorage.setItem('worldview.events.pinned', pinnedEventKey);
      else localStorage.removeItem('worldview.events.pinned');
    }

    function updateEventPinButton(ev) {
      if (!eventDetailPinBtn) return;
      const key = ev ? eventKey(ev) : '';
      const isPinned = Boolean(key && key === pinnedEventKey);
      eventDetailPinBtn.classList.toggle('active', isPinned);
      eventDetailPinBtn.textContent = isPinned ? 'Unpin Event' : 'Pin Event';
    }

    function showAlertToast(message, severity = 2) {
      if (!alertToastWrap) return;
      const toast = document.createElement('div');
      toast.className = `alert-toast sev-${severity}`;
      toast.textContent = message;
      alertToastWrap.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 7000);
    }

    function maybeDesktopNotify(title, body) {
      if (!eventAlerts.enabled) return;
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      try {
        new Notification(title, { body });
      } catch (_) {}
    }

    function processEventAlerts(events) {
      if (!eventAlerts.enabled) return;
      const minSeverity = parseInt(eventAlerts.severity || '2', 10) || 2;
      const nowMs = Date.now();
      const staleCutoff = nowMs - 7 * 24 * 3_600_000;

      for (const [key, ts] of alertedEventTimes.entries()) {
        if (ts < staleCutoff) alertedEventTimes.delete(key);
      }

      for (const ev of events) {
        if ((ev.severity || 1) < minSeverity) continue;
        const stateText = String(ev.state || '').toLowerCase();
        if (stateText !== 'new' && stateText !== 'updated') continue;
        const key = eventKey(ev);
        const lastSeen = alertedEventTimes.get(key) || 0;
        if (nowMs - lastSeen < 30 * 60 * 1000) continue;
        alertedEventTimes.set(key, nowMs);
        const msg = `${(ev.location || 'Unknown').toUpperCase()} | ${stateText.toUpperCase()} | ${ev.title}`;
        showAlertToast(msg, ev.severity || 2);
        maybeDesktopNotify(`WorldView Alert (${stateText.toUpperCase()})`, `${ev.location}: ${ev.title}`);
      }
    }

    function closeEventDetail() {
      if (eventDetailPanel) eventDetailPanel.style.display = 'none';
      eventSelectedKey = '';
      currentEventDetail = null;
      updateEventPinButton(null);
      document.querySelectorAll('.event-card.active').forEach((el) => el.classList.remove('active'));
    }

    function openEventDetail(ev, cardEl = null) {
      if (!eventDetailPanel) return;
      eventSelectedKey = eventKey(ev);
      currentEventDetail = ev;
      document.querySelectorAll('.event-card.active').forEach((el) => el.classList.remove('active'));
      if (cardEl) cardEl.classList.add('active');

      eventDetailPanel.style.display = 'block';
      updateEventPinButton(ev);
      const stateLabel = String(ev.state || 'active').toUpperCase();
      eventDetailMeta.textContent = `${(ev.location || 'Unknown').toUpperCase()} | ${ev.eventType || 'Geopolitical Event'} | ${stateLabel}`;
      eventDetailSummary.textContent = ev.summary || ev.title || 'No summary available.';
      eventDetailType.textContent = ev.eventType || 'Unclassified';
      eventDetailActors.textContent = Array.isArray(ev.actors) && ev.actors.length ? ev.actors.join(', ') : 'Unspecified';
      eventDetailSeverity.textContent = severityLabel(ev.severity);
      eventDetailConfidence.textContent = ev.confidence?.score != null
        ? `${ev.confidence.score}/100 (${ev.confidence.label || 'N/A'})`
        : 'N/A';
      eventDetailSeen.textContent = `${formatEventTime(ev.seendate) || 'Unknown'} (${formatEventTimestamp(ev.lastSeen)})`;
      eventDetailSource.textContent = `${ev.sourceCount || 0} source${ev.sourceCount === 1 ? '' : 's'} | ${ev.domain || (ev.sourceTier === 'fallback' ? 'Fallback model' : 'Open source')}`;

      const link = (Array.isArray(ev.sourceLinks) && ev.sourceLinks[0]?.url) || ev.url;
      if (link) {
        eventDetailLink.style.display = 'inline-block';
        eventDetailLink.href = link;
      } else {
        eventDetailLink.style.display = 'none';
        eventDetailLink.href = '#';
      }
    }

    if (eventDetailClose) eventDetailClose.addEventListener('click', closeEventDetail);
    if (eventDetailCctvBtn) {
      eventDetailCctvBtn.addEventListener('click', () => {
        if (!currentEventDetail) return;
        openEventCCTV(currentEventDetail);
      });
    }
    if (eventDetailPinBtn) {
      eventDetailPinBtn.addEventListener('click', () => {
        if (!currentEventDetail) return;
        const key = eventKey(currentEventDetail);
        pinnedEventKey = pinnedEventKey === key ? '' : key;
        syncPinnedEventStorage();
        updateEventPinButton(currentEventDetail);
        document.querySelectorAll('.event-card').forEach((card) => {
          const match = card.getAttribute('data-event-key') === pinnedEventKey;
          card.classList.toggle('pinned', match);
        });
      });
    }

    async function fetchGeopolitical(opts = {}) {
      const shouldAlert = Boolean(opts.alerts);
      const reqSeq = ++geoRequestSeq;
      try {
        const params = new URLSearchParams({
          timeline: eventView.timeline,
          status: eventView.status,
          severity: eventView.severity,
          type: eventView.type,
        });
        const res = await fetch(`/api/geopolitical?${params.toString()}`);
        const payload = await res.json();
        if (reqSeq !== geoRequestSeq) return;
        setEventsFreshness(payload);
        const events = Array.isArray(payload?.events) ? payload.events : Array.isArray(payload) ? payload : [];
        const availableTypes = Array.isArray(payload?.availableTypes) ? payload.availableTypes : [];
        populateEventTypeOptions(availableTypes);
        if (!Array.isArray(events) || events.length === 0) {
          clearEventEntities();
          const timelineLabel = eventView.timeline === '24' ? '24H' : eventView.timeline === '168' ? '7D' : eventView.timeline === '720' ? '30D' : 'ONGOING';
          renderEventsEmpty(
            `No events found for ${timelineLabel}.`,
            timelineLabel === '24H' ? 'Try 7D or Ongoing for broader context.' : ''
          );
          eventsUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
          if (!pinnedEventKey) closeEventDetail();
          return;
        }

        clearEventEntities();
        eventsListEl.innerHTML = '';

        let detailRestored = false;
        for (const ev of events) {
          const key = eventKey(ev);
          const entity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 0),
            billboard: {
              image: eventSVG(ev.severity),
              scale: 1.0,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              disableDepthTestDistance: 0,
            },
            description: JSON.stringify({ type: 'event', ...ev }),
          });
          const labelEntity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 55000),
            billboard: {
              image: eventTextImage(String(ev.location || 'Event')),
              scale: 0.5,
              verticalOrigin: Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(0, 10),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 12_000_000.0),
              scaleByDistance: new Cesium.NearFarScalar(1_200_000, 1.0, 10_000_000, 0.7),
              translucencyByDistance: new Cesium.NearFarScalar(1_000_000, 1.0, 10_000_000, 0.35),
            },
            description: JSON.stringify({ type: 'event', ...ev }),
          });
          state.eventEntities.push({ entity, labelEntity, severity: ev.severity });

          const card = document.createElement('div');
          card.className = 'event-card';
          const timeStr = formatEventTime(ev.seendate);
          const confClass = confidenceClass(ev.confidence);
          const confText = ev.confidence?.score != null ? `${ev.confidence.label || 'LOW'} ${ev.confidence.score}` : 'LOW 0';
          const stateLabel = String(ev.state || 'active').toUpperCase();
          const isPinned = Boolean(pinnedEventKey && key === pinnedEventKey);
          card.innerHTML = `
        <div class="event-header">
          <div class="event-dot sev-${ev.severity}"></div>
          <div class="event-location">${ev.location.toUpperCase()}</div>
          ${isPinned ? '<div class="event-pin-badge">PINNED</div>' : ''}
          <div class="event-confidence ${confClass}">${confText}</div>
        </div>
        <div class="event-title">${ev.title}</div>
        <div class="event-source">${[stateLabel, timeStr, ev.domain].filter(Boolean).join(' | ')}</div>`;
          card.setAttribute('data-event-key', key);
          if (isPinned) card.classList.add('pinned');
          card.addEventListener('click', () => {
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 2_500_000),
              duration: 2,
            });
            openEventDetail(ev, card);
          });
          if (eventSelectedKey && eventSelectedKey === key) card.classList.add('active');
          eventsListEl.appendChild(card);
          if (!detailRestored && eventSelectedKey && eventSelectedKey === key) {
            openEventDetail(ev, card);
            detailRestored = true;
          }
          if (!detailRestored && pinnedEventKey && pinnedEventKey === key) {
            openEventDetail(ev, card);
            detailRestored = true;
          }
        }

        if ((eventSelectedKey || pinnedEventKey) && !detailRestored) closeEventDetail();
        if (shouldAlert) processEventAlerts(events);
        eventsUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()} | ${events.length} shown`;
        viewer.scene.requestRender();
      } catch (err) {
        console.error('Geopolitical events error:', err.message);
        setEventsFreshness({ cached: true });
        renderEventsEmpty('Events unavailable right now.', 'Data source timeout or upstream error.');
      }
    }

    function applyEventFilters() {
      renderEventsLoading();
      if (!pinnedEventKey) closeEventDetail();
      fetchGeopolitical({ alerts: false });
    }

    eventsTimelineButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        eventsTimelineButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        eventView.timeline = btn.dataset.timeline || '24';
        applyEventFilters();
      });
    });

    if (eventsStatusFilterEl) {
      eventsStatusFilterEl.addEventListener('change', () => {
        eventView.status = eventsStatusFilterEl.value || 'all';
        applyEventFilters();
      });
    }

    if (eventsSeverityFilterEl) {
      eventsSeverityFilterEl.addEventListener('change', () => {
        eventView.severity = eventsSeverityFilterEl.value || '1';
        applyEventFilters();
      });
    }

    if (eventsTypeFilterEl) {
      eventsTypeFilterEl.addEventListener('change', () => {
        eventView.type = eventsTypeFilterEl.value || 'all';
        applyEventFilters();
      });
    }

    if (eventsAlertsEnabledEl) {
      eventsAlertsEnabledEl.checked = eventAlerts.enabled;
      eventsAlertsEnabledEl.addEventListener('change', async () => {
        eventAlerts.enabled = eventsAlertsEnabledEl.checked;
        localStorage.setItem('worldview.alerts.enabled', eventAlerts.enabled ? '1' : '0');
        if (!eventAlerts.enabled) return;
        if ('Notification' in window && Notification.permission === 'default') {
          try {
            await Notification.requestPermission();
          } catch (_) {}
        }
      });
    }

    if (eventsAlertSeverityEl) {
      eventsAlertSeverityEl.value = eventAlerts.severity;
      eventsAlertSeverityEl.addEventListener('change', () => {
        eventAlerts.severity = eventsAlertSeverityEl.value || '2';
        localStorage.setItem('worldview.alerts.severity', eventAlerts.severity);
      });
    }

    setInterval(() => {
      if (!state.eventEntities.length) return;
      const t = Date.now() / 1000;
      for (const { entity, severity } of state.eventEntities) {
        const speed = severity === 3 ? 2.4 : severity === 2 ? 1.7 : 1.1;
        entity.billboard.scale = 0.75 + 0.55 * Math.abs(Math.sin(t * speed * Math.PI));
      }
      viewer.scene.requestRender();
    }, 80);

    return {
      renderEventsLoading,
      fetchGeopolitical,
      openEventDetail,
      closeEventDetail,
    };
  }

  global.initWorldViewEvents = initWorldViewEvents;
})(window);
