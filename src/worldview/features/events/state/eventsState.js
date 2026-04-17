export function createEventsState() {
  return {
    eventSelectedKey: '',
    currentEventDetail: null,
    pinnedEventKey: localStorage.getItem('worldview.events.pinned') || '',
    alertedEventTimes: new Map(),
    eventView: {
      timeline: '24',
      status: 'all',
      severity: '1',
      type: 'all',
    },
    eventAlerts: {
      enabled: localStorage.getItem('worldview.alerts.enabled') === '1',
      severity: localStorage.getItem('worldview.alerts.severity') || '2',
    },
    geoRequestSeq: 0,
  };
}

export function syncPinnedEventStorage(pinnedEventKey) {
  if (pinnedEventKey) localStorage.setItem('worldview.events.pinned', pinnedEventKey);
  else localStorage.removeItem('worldview.events.pinned');
}

export function syncAlertSettings(eventAlerts) {
  localStorage.setItem('worldview.alerts.enabled', eventAlerts.enabled ? '1' : '0');
  localStorage.setItem('worldview.alerts.severity', eventAlerts.severity);
}
