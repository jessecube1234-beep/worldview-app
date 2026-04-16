(function initWorldViewSpaceModule(global) {
  function initWorldViewSpace(deps) {
    const {
      viewer,
      state,
      satCollection,
      satCountEl,
      issAltEl,
      issSpeedEl,
      setStatus,
    } = deps;

    let tleData = [];

    async function fetchSatellites() {
      try {
        const res = await fetch('/api/satellites');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        tleData = data;
        updateSatellitePositions();
        if (satCountEl) satCountEl.textContent = tleData.length.toLocaleString();
      } catch (err) {
        setStatus(`Satellite error: ${err.message}`);
        console.error('Satellite fetch error:', err.message);
      }
    }

    function updateSatellitePositions() {
      satCollection.removeAll();
      const now = new Date();
      const gmst = satellite.gstime(now);
      for (const sat of tleData) {
        try {
          const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
          const posVel = satellite.propagate(satrec, now);
          if (!posVel || !posVel.position) continue;
          const geo = satellite.eciToGeodetic(posVel.position, gmst);
          const lat = satellite.degreesLat(geo.latitude);
          const lon = satellite.degreesLong(geo.longitude);
          const altM = geo.height * 1000;
          satCollection.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, altM),
            color: new Cesium.Color(0.53, 0.87, 1.0, 0.85),
            pixelSize: 4,
            id: { type: 'satellite', name: sat.name, lat: lat.toFixed(2), lon: lon.toFixed(2), alt: Math.round(geo.height) + ' km' },
          });
        } catch (_) {}
      }
    }

    const issSvg = (() => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect x="0" y="11" width="8" height="6" fill="#ffdd57" opacity="0.85"/><rect x="20" y="11" width="8" height="6" fill="#ffdd57" opacity="0.85"/><rect x="8" y="10" width="12" height="8" rx="2" fill="#aee8ff"/><circle cx="14" cy="14" r="3" fill="#ffffff"/></svg>`;
      return 'data:image/svg+xml;base64,' + btoa(svg);
    })();

    async function fetchISS() {
      try {
        const res = await fetch('/api/iss');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const { latitude, longitude, altitude, velocity } = data;
        if (issAltEl) issAltEl.textContent = `${Math.round(altitude)} km`;
        if (issSpeedEl) issSpeedEl.textContent = `${Math.round(velocity)} km/h`;
        if (state.issEntity) viewer.entities.remove(state.issEntity);
        state.issEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude * 1000),
          billboard: { image: issSvg, scale: 1, verticalOrigin: Cesium.VerticalOrigin.CENTER },
          label: {
            text: 'ISS',
            font: 'bold 11px Courier New',
            fillColor: Cesium.Color.fromCssColorString('#ffdd57'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -18),
          },
          description: JSON.stringify({ type: 'iss', lat: latitude.toFixed(4), lon: longitude.toFixed(4), alt: Math.round(altitude) + ' km', vel: Math.round(velocity) + ' km/h' }),
          show: state.issVisible,
        });
      } catch (err) {
        console.error('ISS error:', err.message);
      }
    }

    function setIssVisible(visible) {
      if (state.issEntity) state.issEntity.show = Boolean(visible);
      viewer.scene.requestRender();
    }

    function setSatellitesVisible(visible) {
      satCollection.show = Boolean(visible);
      viewer.scene.requestRender();
    }

    return {
      fetchSatellites,
      updateSatellitePositions,
      fetchISS,
      setIssVisible,
      setSatellitesVisible,
    };
  }

  global.initWorldViewSpace = initWorldViewSpace;
})(window);
