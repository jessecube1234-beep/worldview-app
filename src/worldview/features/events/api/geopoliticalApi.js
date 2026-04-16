export function fetchGeopoliticalPayload(eventView) {
  const params = new URLSearchParams({
    timeline: eventView.timeline,
    status: eventView.status,
    severity: eventView.severity,
    type: eventView.type,
  });

  return fetch(`/api/geopolitical?${params.toString()}`).then((res) => res.json());
}
