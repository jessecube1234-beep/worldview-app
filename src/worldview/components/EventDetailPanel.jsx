export function EventDetailPanel() {
  return (
    <aside className="event-detail-panel" id="event-detail-panel" style={{ display: 'none' }}>
      <div className="event-detail-header">
        <div className="event-detail-title">EVENT DETAIL</div>
        <button className="event-detail-close" id="event-detail-close">X</button>
      </div>
      <div className="event-detail-body">
        <div className="event-detail-meta" id="event-detail-meta"></div>
        <div className="event-detail-summary" id="event-detail-summary"></div>
        <div className="event-detail-grid">
          <div className="event-detail-row"><span>Type</span><strong id="event-detail-type">-</strong></div>
          <div className="event-detail-row"><span>Actors</span><strong id="event-detail-actors">-</strong></div>
          <div className="event-detail-row"><span>Severity</span><strong id="event-detail-severity">-</strong></div>
          <div className="event-detail-row"><span>Confidence</span><strong id="event-detail-confidence">-</strong></div>
          <div className="event-detail-row"><span>Seen</span><strong id="event-detail-seen">-</strong></div>
          <div className="event-detail-row"><span>Source</span><strong id="event-detail-source">-</strong></div>
        </div>
        <button className="event-detail-pin" id="event-detail-pin" type="button">Pin Event</button>
        <button className="event-detail-cctv" id="event-detail-cctv" type="button">Open Nearby CCTV</button>
        <a className="event-detail-link" id="event-detail-link" href="#" target="_blank" rel="noopener">Open Source Article</a>
      </div>
    </aside>
  );
}
