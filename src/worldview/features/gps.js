import { getCesium } from '../shared/runtimeGlobals.js';

export function initWorldViewGps(deps) {
    const Cesium = getCesium();
    const { viewer, state, gpsTextImage } = deps;

    function clearGpsJammingEntities() {
      state.gpsJammingEntities.forEach((ent) => viewer.entities.remove(ent));
      state.gpsJammingEntities = [];
    }

    function gpsJamColor(severity) {
      if (severity >= 3) return Cesium.Color.fromCssColorString('#ff3b30');
      if (severity >= 2) return Cesium.Color.fromCssColorString('#ff9500');
      return Cesium.Color.fromCssColorString('#ffe066');
    }

    async function fetchGpsJamming() {
      try {
        const res = await fetch('/api/gps-jamming');
        if (!res.ok) throw new Error(`GPS jamming ${res.status}`);
        const payload = await res.json();
        const points = Array.isArray(payload?.points) ? payload.points : [];

        clearGpsJammingEntities();
        for (const p of points) {
          const lat = Number(p.lat);
          const lon = Number(p.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const severity = Math.max(1, Math.min(3, Number(p.severity || 1) || 1));
          const ent = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 15000),
            point: {
              color: gpsJamColor(severity).withAlpha(0.92),
              pixelSize: severity === 3 ? 12 : severity === 2 ? 10 : 8,
              outlineColor: Cesium.Color.BLACK.withAlpha(0.75),
              outlineWidth: 1,
              disableDepthTestDistance: 0,
            },
            description: JSON.stringify({
              type: 'gps-jam',
              region: p.region || 'GPS Blocking',
              severity,
              note: p.note || 'GNSS/GPS interference',
              source: payload?.source || '',
              updatedAt: p.updatedAt || payload?.asOf || null,
            }),
            show: state.gpsJammingVisible,
          });
          const labelEnt = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 45000),
            billboard: {
              image: gpsTextImage(String(p.region || 'GPS Blocking')),
              scale: 0.52,
              verticalOrigin: Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(0, 10),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 12_000_000.0),
              scaleByDistance: new Cesium.NearFarScalar(1_200_000, 1.0, 10_000_000, 0.7),
              translucencyByDistance: new Cesium.NearFarScalar(1_000_000, 1.0, 10_000_000, 0.35),
            },
            description: JSON.stringify({
              type: 'gps-jam',
              region: p.region || 'GPS Blocking',
              severity,
              note: p.note || 'GNSS/GPS interference',
              source: payload?.source || '',
              updatedAt: p.updatedAt || payload?.asOf || null,
            }),
            show: state.gpsJammingVisible,
          });
          state.gpsJammingEntities.push(ent);
          state.gpsJammingEntities.push(labelEnt);
        }
        viewer.scene.requestRender();
      } catch (err) {
        console.error('GPS jamming error:', err.message);
      }
    }

    function setGpsJammingVisible(visible) {
      state.gpsJammingVisible = Boolean(visible);
      state.gpsJammingEntities.forEach((ent) => { ent.show = state.gpsJammingVisible; });
      viewer.scene.requestRender();
    }

    return {
      fetchGpsJamming,
      setGpsJammingVisible,
    };
  }



