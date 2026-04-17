export function CctvOverlay() {
  return (
    <div className="cctv-overlay" id="cctv-overlay" style={{ display: 'none' }}>
      <div className="cctv-modal">
        <div className="cctv-header">
          <div className="cctv-title" id="cctv-title">CITY - CCTV</div>
          <button className="cctv-close" id="cctv-close">X</button>
        </div>
        <div className="cctv-meta" id="cctv-meta"></div>
        <div className="cctv-grid" id="cctv-grid">
          <div className="cctv-loading" id="cctv-loading">Loading cameras...</div>
        </div>
        <div className="cctv-footer">
          <span id="cctv-status">-</span>
          <a className="cctv-external" id="cctv-external" href="#" target="_blank" rel="noopener">
            Open More -&gt;
          </a>
        </div>
      </div>
    </div>
  );
}
