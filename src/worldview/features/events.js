import * as eventUtils from '../shared/eventsUtils.js';
import { getCesium } from '../shared/runtimeGlobals.js';
import { fetchGeopoliticalPayload } from './events/api/geopoliticalApi.js';
import { getEventsDomRefs, populateEventTypeOptions, setEventsFreshness } from './events/dom/eventsDom.js';
import { createEventsState, syncAlertSettings, syncPinnedEventStorage } from './events/state/eventsState.js';

export function initWorldViewEvents(deps) {
  const Cesium = getCesium();
  const {
    viewer,
    state,
    eventTextImage,
    openEventCCTV,
  } = deps;

  const dom = getEventsDomRefs();
  const featureState = createEventsState();

  const eventSVG = eventUtils.createEventSvgFactory();
  const eventKey = eventUtils.eventKey;
  const formatEventTime = eventUtils.formatEventTime;
  const confidenceClass = eventUtils.confidenceClass;
  const severityLabel = eventUtils.severityLabel;
  const formatEventTimestamp = eventUtils.formatEventTimestamp;
  const normalizeTypeValue = eventUtils.normalizeTypeValue;
  const renderLoading = eventUtils.renderEventsLoading;
  const renderEmpty = eventUtils.renderEventsEmpty;
  const showToast = eventUtils.showAlertToast;
  const desktopNotify = eventUtils.maybeDesktopNotify;

  function clearEventEntities() {
    state.eventEntities.forEach(({ entity, labelEntity }) => {
      viewer.entities.remove(entity);
      if (labelEntity) viewer.entities.remove(labelEntity);
    });
    state.eventEntities = [];
  }

  function renderEventsLoading(count = 4) {
    renderLoading(dom.eventsListEl, count);
  }

  function renderEventsEmpty(message, hint = '') {
    renderEmpty(dom.eventsListEl, message, hint);
  }

  function updateEventPinButton(ev) {
    if (!dom.eventDetailPinBtn) return;
    const key = ev ? eventKey(ev) : '';
    const isPinned = Boolean(key && key === featureState.pinnedEventKey);
    dom.eventDetailPinBtn.classList.toggle('active', isPinned);
    dom.eventDetailPinBtn.textContent = isPinned ? 'Unpin Event' : 'Pin Event';
  }

  function processEventAlerts(events) {
    if (!featureState.eventAlerts.enabled) return;
    const minSeverity = parseInt(featureState.eventAlerts.severity || '2', 10) || 2;
    const nowMs = Date.now();
    const staleCutoff = nowMs - 7 * 24 * 3_600_000;

    for (const [key, ts] of featureState.alertedEventTimes.entries()) {
      if (ts < staleCutoff) featureState.alertedEventTimes.delete(key);
    }

    for (const ev of events) {
      if ((ev.severity || 1) < minSeverity) continue;
      const stateText = String(ev.state || '').toLowerCase();
      if (stateText !== 'new' && stateText !== 'updated') continue;
      const key = eventKey(ev);
      const lastSeen = featureState.alertedEventTimes.get(key) || 0;
      if (nowMs - lastSeen < 30 * 60 * 1000) continue;
      featureState.alertedEventTimes.set(key, nowMs);
      const msg = `${(ev.location || 'Unknown').toUpperCase()} | ${stateText.toUpperCase()} | ${ev.title}`;
      showToast(dom.alertToastWrap, msg, ev.severity || 2);
      desktopNotify(featureState.eventAlerts.enabled, `WorldView Alert (${stateText.toUpperCase()})`, `${ev.location}: ${ev.title}`);
    }
  }

  function closeEventDetail() {
    if (dom.eventDetailPanel) dom.eventDetailPanel.style.display = 'none';
    featureState.eventSelectedKey = '';
    featureState.currentEventDetail = null;
    updateEventPinButton(null);
    document.querySelectorAll('.event-card.active').forEach((el) => el.classList.remove('active'));
  }

  function openEventDetail(ev, cardEl = null) {
    if (!dom.eventDetailPanel) return;
    featureState.eventSelectedKey = eventKey(ev);
    featureState.currentEventDetail = ev;
    document.querySelectorAll('.event-card.active').forEach((el) => el.classList.remove('active'));
    if (cardEl) cardEl.classList.add('active');

    dom.eventDetailPanel.style.display = 'block';
    updateEventPinButton(ev);
    const stateLabel = String(ev.state || 'active').toUpperCase();
    dom.eventDetailMeta.textContent = `${(ev.location || 'Unknown').toUpperCase()} | ${ev.eventType || 'Geopolitical Event'} | ${stateLabel}`;
    dom.eventDetailSummary.textContent = ev.summary || ev.title || 'No summary available.';
    dom.eventDetailType.textContent = ev.eventType || 'Unclassified';
    dom.eventDetailActors.textContent = Array.isArray(ev.actors) && ev.actors.length ? ev.actors.join(', ') : 'Unspecified';
    dom.eventDetailSeverity.textContent = severityLabel(ev.severity);
    dom.eventDetailConfidence.textContent = ev.confidence?.score != null
      ? `${ev.confidence.score}/100 (${ev.confidence.label || 'N/A'})`
      : 'N/A';
    dom.eventDetailSeen.textContent = `${formatEventTime(ev.seendate) || 'Unknown'} (${formatEventTimestamp(ev.lastSeen)})`;
    dom.eventDetailSource.textContent = `${ev.sourceCount || 0} source${ev.sourceCount === 1 ? '' : 's'} | ${ev.domain || (ev.sourceTier === 'fallback' ? 'Fallback model' : 'Open source')}`;

    const link = (Array.isArray(ev.sourceLinks) && ev.sourceLinks[0]?.url) || ev.url;
    if (link) {
      dom.eventDetailLink.style.display = 'inline-block';
      dom.eventDetailLink.href = link;
    } else {
      dom.eventDetailLink.style.display = 'none';
      dom.eventDetailLink.href = '#';
    }
  }

  if (dom.eventDetailClose) dom.eventDetailClose.addEventListener('click', closeEventDetail);
  if (dom.eventDetailCctvBtn) {
    dom.eventDetailCctvBtn.addEventListener('click', () => {
      if (!featureState.currentEventDetail) return;
      openEventCCTV(featureState.currentEventDetail);
    });
  }
  if (dom.eventDetailPinBtn) {
    dom.eventDetailPinBtn.addEventListener('click', () => {
      if (!featureState.currentEventDetail) return;
      const key = eventKey(featureState.currentEventDetail);
      featureState.pinnedEventKey = featureState.pinnedEventKey === key ? '' : key;
      syncPinnedEventStorage(featureState.pinnedEventKey);
      updateEventPinButton(featureState.currentEventDetail);
      document.querySelectorAll('.event-card').forEach((card) => {
        const match = card.getAttribute('data-event-key') === featureState.pinnedEventKey;
        card.classList.toggle('pinned', match);
      });
    });
  }

  async function fetchGeopolitical(opts = {}) {
    const shouldAlert = Boolean(opts.alerts);
    const reqSeq = ++featureState.geoRequestSeq;
    try {
      const payload = await fetchGeopoliticalPayload(featureState.eventView);
      if (reqSeq !== featureState.geoRequestSeq) return;
      setEventsFreshness(dom.eventsFreshnessEl, payload);
      const events = Array.isArray(payload?.events) ? payload.events : Array.isArray(payload) ? payload : [];
      const availableTypes = Array.isArray(payload?.availableTypes) ? payload.availableTypes : [];
      const typeResult = populateEventTypeOptions(dom.eventsTypeFilterEl, availableTypes, normalizeTypeValue, featureState.eventView.type);
      featureState.eventView.type = typeResult.nextType;

      if (!Array.isArray(events) || events.length === 0) {
        clearEventEntities();
        const timelineLabel = featureState.eventView.timeline === '24' ? '24H' : featureState.eventView.timeline === '168' ? '7D' : featureState.eventView.timeline === '720' ? '30D' : 'ONGOING';
        renderEventsEmpty(
          `No events found for ${timelineLabel}.`,
          timelineLabel === '24H' ? 'Try 7D or Ongoing for broader context.' : ''
        );
        dom.eventsUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        if (!featureState.pinnedEventKey) closeEventDetail();
        return;
      }

      clearEventEntities();
      dom.eventsListEl.innerHTML = '';

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
        const isPinned = Boolean(featureState.pinnedEventKey && key === featureState.pinnedEventKey);
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
        if (featureState.eventSelectedKey && featureState.eventSelectedKey === key) card.classList.add('active');
        dom.eventsListEl.appendChild(card);
        if (!detailRestored && featureState.eventSelectedKey && featureState.eventSelectedKey === key) {
          openEventDetail(ev, card);
          detailRestored = true;
        }
        if (!detailRestored && featureState.pinnedEventKey && featureState.pinnedEventKey === key) {
          openEventDetail(ev, card);
          detailRestored = true;
        }
      }

      if ((featureState.eventSelectedKey || featureState.pinnedEventKey) && !detailRestored) closeEventDetail();
      if (shouldAlert) processEventAlerts(events);
      dom.eventsUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()} | ${events.length} shown`;
      viewer.scene.requestRender();
    } catch (err) {
      console.error('Geopolitical events error:', err.message);
      setEventsFreshness(dom.eventsFreshnessEl, { cached: true });
      renderEventsEmpty('Events unavailable right now.', 'Data source timeout or upstream error.');
    }
  }

  function applyEventFilters() {
    renderEventsLoading();
    if (!featureState.pinnedEventKey) closeEventDetail();
    fetchGeopolitical({ alerts: false });
  }

  dom.eventsTimelineButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      dom.eventsTimelineButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      featureState.eventView.timeline = btn.dataset.timeline || '24';
      applyEventFilters();
    });
  });

  if (dom.eventsStatusFilterEl) {
    dom.eventsStatusFilterEl.addEventListener('change', () => {
      featureState.eventView.status = dom.eventsStatusFilterEl.value || 'all';
      applyEventFilters();
    });
  }

  if (dom.eventsSeverityFilterEl) {
    dom.eventsSeverityFilterEl.addEventListener('change', () => {
      featureState.eventView.severity = dom.eventsSeverityFilterEl.value || '1';
      applyEventFilters();
    });
  }

  if (dom.eventsTypeFilterEl) {
    dom.eventsTypeFilterEl.addEventListener('change', () => {
      featureState.eventView.type = dom.eventsTypeFilterEl.value || 'all';
      applyEventFilters();
    });
  }

  if (dom.eventsAlertsEnabledEl) {
    dom.eventsAlertsEnabledEl.checked = featureState.eventAlerts.enabled;
    dom.eventsAlertsEnabledEl.addEventListener('change', async () => {
      featureState.eventAlerts.enabled = dom.eventsAlertsEnabledEl.checked;
      syncAlertSettings(featureState.eventAlerts);
      if (!featureState.eventAlerts.enabled) return;
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (_) {}
      }
    });
  }

  if (dom.eventsAlertSeverityEl) {
    dom.eventsAlertSeverityEl.value = featureState.eventAlerts.severity;
    dom.eventsAlertSeverityEl.addEventListener('change', () => {
      featureState.eventAlerts.severity = dom.eventsAlertSeverityEl.value || '2';
      syncAlertSettings(featureState.eventAlerts);
    });
  }

  const pulseTimer = setInterval(() => {
    if (!state.eventEntities.length) return;
    const t = Date.now() / 1000;
    for (const { entity, severity } of state.eventEntities) {
      const speed = severity === 3 ? 2.4 : severity === 2 ? 1.7 : 1.1;
      entity.billboard.scale = 0.75 + 0.55 * Math.abs(Math.sin(t * speed * Math.PI));
    }
    viewer.scene.requestRender();
  }, 80);

  function destroy() {
    clearInterval(pulseTimer);
  }

  return {
    renderEventsLoading,
    fetchGeopolitical,
    openEventDetail,
    closeEventDetail,
    destroy,
  };
}
