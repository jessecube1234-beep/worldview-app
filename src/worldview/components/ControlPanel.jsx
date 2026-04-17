export function ControlPanel() {
  return (
    <aside className="control-panel">
      <div className="panel-section">
        <div className="panel-title">LAYERS</div>
        <label className="toggle-row">
          <input type="checkbox" id="toggle-flights" defaultChecked />
          <span className="toggle-track"><span className="toggle-thumb"></span></span>
          <span>Military Aircraft</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" id="toggle-iss" defaultChecked />
          <span className="toggle-track"><span className="toggle-thumb"></span></span>
          <span>ISS Position</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" id="toggle-satellites" defaultChecked />
          <span className="toggle-track"><span className="toggle-thumb"></span></span>
          <span>Satellites</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" id="toggle-borders" defaultChecked />
          <span className="toggle-track"><span className="toggle-thumb"></span></span>
          <span>Country Borders</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" id="toggle-cities" defaultChecked />
          <span className="toggle-track"><span className="toggle-thumb"></span></span>
          <span>Cities / CCTV</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" id="toggle-gps-jamming" defaultChecked />
          <span className="toggle-track"><span className="toggle-thumb"></span></span>
          <span>GPS Blocking</span>
        </label>
      </div>

      <div className="panel-section">
        <div className="panel-title">FOCUS REGION</div>
        <button className="mode-btn" data-region="world">GLOBAL</button>
        <button className="mode-btn" data-region="mideast">MIDDLE EAST</button>
        <button className="mode-btn" data-region="europe">EUROPE</button>
        <button className="mode-btn" data-region="eastasia">EAST ASIA</button>
        <button className="mode-btn" data-region="northam">N. AMERICA</button>
        <button className="mode-btn" data-region="africa">AFRICA</button>
      </div>

      <div className="panel-section">
        <div className="panel-title">VIEW MODE</div>
        <button className="mode-btn active" data-mode="default">STANDARD</button>
        <button className="mode-btn" data-mode="night">NIGHT</button>
        <button className="mode-btn" data-mode="terrain">TERRAIN</button>
      </div>

      <div className="panel-section">
        <div className="panel-title">REFRESH</div>
        <button className="refresh-btn" id="refresh-btn">REFRESH DATA</button>
        <div className="last-update" id="last-update">Never</div>
      </div>
    </aside>
  );
}
