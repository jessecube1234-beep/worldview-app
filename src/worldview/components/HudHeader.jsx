export function HudHeader() {
  return (
    <header className="hud-header">
      <div className="logo">
        <span className="logo-bracket">[</span>
        WORLD<span className="logo-accent">VIEW</span>
        <span className="logo-bracket">]</span>
      </div>
      <div className="hud-stats">
        <div className="stat-block">
          <span className="stat-label">MIL AC</span>
          <span className="stat-value" id="flight-count">--</span>
        </div>
        <div className="stat-block">
          <span className="stat-label">SATS</span>
          <span className="stat-value" id="sat-count">--</span>
        </div>
        <div className="stat-block">
          <span className="stat-label">ISS ALT</span>
          <span className="stat-value" id="iss-alt">--</span>
        </div>
        <div className="stat-block">
          <span className="stat-label">ISS SPEED</span>
          <span className="stat-value" id="iss-speed">--</span>
        </div>
        <div className="stat-block">
          <span className="stat-label">UTC</span>
          <span className="stat-value" id="utc-clock">--</span>
        </div>
      </div>
    </header>
  );
}
