import { getCesium } from '../shared/runtimeGlobals.js';

export function initWorldViewFlights(deps) {
    const Cesium = getCesium();
    const {
      viewer,
      flightCollection,
      flightCountEl,
      planeSVG,
      setStatus,
      setLastUpdate,
    } = deps;

    async function fetchFlights() {
      setStatus('Fetching tracked aircraft...');
      try {
        const res = await fetch('/api/flights');
        const data = await res.json();

        const planes = data.ac || [];
        if (!planes.length) {
          setStatus('No aircraft data available from current feeds.');
          if (flightCountEl) flightCountEl.textContent = '0';
          return;
        }

        const snapshot = `${planes.length}|${planes.slice(0, 24).map((p) => `${p.hex || ''}:${p.lat || ''}:${p.lon || ''}`).join(',')}`;
        if (fetchFlights._lastSnapshot === snapshot) {
          const feedLabel = data.stale ? 'cached feed' : 'live feed';
          const currentCount = Number((flightCountEl?.textContent || '').replace(/,/g, '')) || planes.length;
          setStatus(`Tracking ${currentCount} aircraft globally (${feedLabel}).`);
          setLastUpdate();
          return;
        }
        fetchFlights._lastSnapshot = snapshot;

        flightCollection.removeAll();

        let count = 0;
        for (const ac of planes) {
          const { hex, flight, lat, lon, alt_baro, gs, track, r, t } = ac;
          if (lat == null || lon == null) continue;
          const altM = (typeof alt_baro === 'number' ? alt_baro : 0) * 0.3048;
          const speed = gs != null ? Math.round(gs) : '?';
          const label = (flight || hex || '').trim();
          flightCollection.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, altM),
            image: planeSVG(track || 0),
            scale: 0.6,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            id: {
              type: 'flight',
              callsign: label,
              icao: hex,
              reg: r || '',
              aircraft: t || '',
              alt: altM,
              speed,
              hdg: track,
            },
          });
          count++;
        }
        if (flightCountEl) flightCountEl.textContent = count.toLocaleString();
        const feedLabel = data.stale ? 'cached feed' : 'live feed';
        setStatus(`Tracking ${count} aircraft globally (military + restricted + sampled civil, ${feedLabel}).`);
        setLastUpdate();
      } catch (err) {
        setStatus(`Flight error: ${err.message}`);
        console.error(err);
      }
    }

    function setFlightsVisible(visible) {
      flightCollection.show = Boolean(visible);
      viewer.scene.requestRender();
    }

    return {
      fetchFlights,
      setFlightsVisible,
    };
  }



