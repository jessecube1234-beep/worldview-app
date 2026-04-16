(function initWorldViewInteractionsModule(global) {
  function initWorldViewInteractions(deps) {
    const {
      viewer,
      tooltip,
      tooltipTitle,
      tooltipBody,
      openCCTV,
      showSingleCamera,
      openEventDetail,
    } = deps;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.endPosition);
      if (!Cesium.defined(picked) || picked.id == null) {
        tooltip.style.display = 'none';
        return;
      }

      let d;
      try {
        d = picked.id.description
          ? JSON.parse(picked.id.description.getValue())
          : picked.id;
      } catch (_) {
        tooltip.style.display = 'none';
        return;
      }

      tooltip.style.display = 'block';
      tooltip.style.left = `${movement.endPosition.x + 16}px`;
      tooltip.style.top = `${movement.endPosition.y + 16}px`;

      if (d.type === 'flight') {
        tooltipTitle.textContent = `FLIGHT ${d.callsign || d.icao}`;
        tooltipBody.textContent = `ICAO:     ${d.icao}\nReg:      ${d.reg || '?'}\nType:     ${d.aircraft || '?'}\nAlt:      ${Math.round(d.alt)} m\nSpeed:    ${d.speed} kts\nHeading:  ${d.hdg || '?'} deg`;
      } else if (d.type === 'iss') {
        tooltipTitle.textContent = 'ISS';
        tooltipBody.textContent = `Lat:  ${d.lat}\nLon:  ${d.lon}\nAlt:  ${d.alt}\nVel:  ${d.vel}`;
      } else if (d.type === 'satellite') {
        tooltipTitle.textContent = `SAT ${d.name}`;
        tooltipBody.textContent = `Lat:  ${d.lat} deg\nLon:  ${d.lon} deg\nAlt:  ${d.alt}`;
      } else if (d.type === 'city') {
        tooltipTitle.textContent = `CITY ${d.name}`;
        tooltipBody.textContent = `${d.country} | ${d.lat.toFixed(2)} deg, ${d.lon.toFixed(2)} deg\nClick to view CCTV`;
      } else if (d.type === 'camera') {
        tooltipTitle.textContent = `CAMERA ${d.name}`;
        tooltipBody.textContent = 'Live camera | click to view';
      } else if (d.type === 'gps-jam') {
        const sevLabel = d.severity === 3 ? 'HIGH' : d.severity === 2 ? 'MEDIUM' : 'LOW';
        tooltipTitle.textContent = `GPS BLOCKING ${d.region}`;
        tooltipBody.textContent = `Severity: ${sevLabel}\n${d.note || 'GNSS/GPS interference'}${d.updatedAt ? `\nUpdated: ${new Date(d.updatedAt).toLocaleString()}` : ''}`;
      } else if (d.type === 'event') {
        const sevLabel = d.severity === 3 ? 'CRITICAL' : d.severity === 2 ? 'HIGH' : 'MODERATE';
        tooltipTitle.textContent = `EVENT ${d.location}`;
        tooltipBody.textContent = `[${sevLabel}] ${d.eventType || 'Event'}\nState: ${(d.state || 'active').toUpperCase()}\n${d.title}${d.confidence?.score != null ? `\nConfidence: ${d.confidence.score}/100` : ''}`;
      } else if (d.type === 'country') {
        tooltipTitle.textContent = `COUNTRY ${d.name}`;
        tooltipBody.textContent = 'Country label';
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (!Cesium.defined(picked) || picked.id == null) return;

      let d;
      try {
        d = picked.id.description
          ? JSON.parse(picked.id.description.getValue())
          : picked.id;
      } catch (_) {
        return;
      }

      tooltip.style.display = 'none';
      if (d.type === 'city') {
        openCCTV(d);
      } else if (d.type === 'camera') {
        showSingleCamera(d);
      } else if (d.type === 'event') {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(d.lon, d.lat, 2_500_000),
          duration: 2,
        });
        openEventDetail(d);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return { handler };
  }

  global.initWorldViewInteractions = initWorldViewInteractions;
})(window);
