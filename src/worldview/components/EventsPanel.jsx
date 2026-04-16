export function EventsPanel() {
  return (
    <aside className="events-panel" id="events-panel">
      <div className="panel-title">GEOPOLITICAL INTEL</div>
      <div className="events-controls">
        <div className="events-control-row events-control-row-4">
          <button className="events-timeline active" data-timeline="24">24H</button>
          <button className="events-timeline" data-timeline="168">7D</button>
          <button className="events-timeline" data-timeline="720">30D</button>
          <button className="events-timeline" data-timeline="ongoing">ONGOING</button>
        </div>
        <div className="events-control-row events-control-row-2">
          <select id="events-status-filter" defaultValue="all">
            <option value="all">All states</option>
            <option value="new">New</option>
            <option value="updated">Updated</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
          </select>
          <select id="events-severity-filter" defaultValue="1">
            <option value="1">Severity 1+</option>
            <option value="2">Severity 2+</option>
            <option value="3">Severity 3</option>
          </select>
        </div>
        <div className="events-control-row events-control-row-1">
          <select id="events-type-filter" defaultValue="all">
            <option value="all">All types</option>
          </select>
        </div>
        <div className="events-control-row events-control-row-2">
          <label className="events-alert-toggle">
            <input type="checkbox" id="events-alerts-enabled" />
            <span>Alerts</span>
          </label>
          <select id="events-alert-severity" defaultValue="2">
            <option value="2">Alert Sev 2+</option>
            <option value="3">Alert Sev 3</option>
          </select>
        </div>
      </div>
      <div className="events-freshness" id="events-freshness">Refreshing...</div>
      <div id="events-list"><div className="cctv-loading">Loading events...</div></div>
      <div className="last-update" id="events-update"></div>
    </aside>
  );
}
