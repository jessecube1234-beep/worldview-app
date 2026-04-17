export function TooltipOverlay() {
  return (
    <div className="info-tooltip" id="info-tooltip" style={{ display: 'none' }}>
      <div className="tooltip-title" id="tooltip-title"></div>
      <div className="tooltip-body" id="tooltip-body"></div>
    </div>
  );
}
