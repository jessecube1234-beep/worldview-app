import { POLL_MS_ACTIVE, POLL_MS_HIDDEN, REGIONS } from '../config/dashboardConfig.js';
import { getCesium } from '../shared/runtimeGlobals.js';

export function initWorldViewDashboard(deps) {
    const Cesium = getCesium();
    const {
      viewer,
      state,
      setStatus,
      flightsFeature,
      spaceFeature,
      gpsFeature,
      eventsFeature,
      geoFeature,
    } = deps;

    const pollTimers = [];

    function applyViewMode(mode) {
      state.viewMode = mode;
      const scene = viewer.scene;
      switch (mode) {
        case 'night':
          scene.globe.enableLighting = true;
          if (scene.atmosphere) scene.atmosphere.brightnessShift = -0.8;
          scene.skyAtmosphere.brightnessShift = -0.5;
          setStatus('Night mode - globe lit by sun angle.');
          break;
        case 'terrain':
          scene.globe.enableLighting = true;
          if (scene.atmosphere) scene.atmosphere.brightnessShift = 0.1;
          scene.skyAtmosphere.brightnessShift = 0.1;
          viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(-109, 36.5, 800000), duration: 2 });
          setStatus('Terrain mode - zoomed to Colorado Plateau.');
          break;
        default:
          scene.globe.enableLighting = true;
          if (scene.atmosphere) scene.atmosphere.brightnessShift = -0.3;
          scene.skyAtmosphere.brightnessShift = -0.1;
          setStatus('Standard mode.');
      }
    }

    async function loadAllData() {
      await Promise.all([
        flightsFeature.fetchFlights(),
        spaceFeature.fetchISS(),
        spaceFeature.fetchSatellites(),
        gpsFeature.fetchGpsJamming(),
      ]);
    }

    function clearPollTimers() {
      while (pollTimers.length) clearInterval(pollTimers.pop());
    }

    function startPollTimers() {
      clearPollTimers();
      const cadence = document.hidden ? POLL_MS_HIDDEN : POLL_MS_ACTIVE;
      pollTimers.push(setInterval(() => spaceFeature.fetchISS(), cadence.iss));
      pollTimers.push(setInterval(() => spaceFeature.updateSatellitePositions(), cadence.satPos));
      pollTimers.push(setInterval(() => flightsFeature.fetchFlights(), cadence.flights));
      pollTimers.push(setInterval(() => spaceFeature.fetchSatellites(), cadence.satellites));
      pollTimers.push(setInterval(() => gpsFeature.fetchGpsJamming(), cadence.gps));
      pollTimers.push(setInterval(() => eventsFeature.fetchGeopolitical({ alerts: true }), cadence.events));
    }

    function bindRegionButtons() {
      document.querySelectorAll('[data-region]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const r = REGIONS[btn.dataset.region];
          if (!r) return;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(r.lon, r.lat, r.alt),
            duration: 2,
          });
          setStatus(`Focused: ${r.label} - showing tracked aircraft in view.`);
        });
      });
    }

    function bindModeButtons() {
      document.querySelectorAll('.mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          applyViewMode(btn.dataset.mode);
        });
      });
    }

    function bindRefreshButton() {
      const refreshBtn = document.getElementById('refresh-btn');
      if (!refreshBtn) return;
      refreshBtn.addEventListener('click', loadAllData);
    }

    function boot() {
      setStatus('Connecting to data sources...');
      geoFeature.loadCountryBorders();
      geoFeature.loadUSStateBorders();
      geoFeature.loadCities();
      loadAllData();
      eventsFeature.renderEventsLoading();
      eventsFeature.fetchGeopolitical({ alerts: false });
      startPollTimers();
    }

    function handleVisibilityChange() {
      startPollTimers();
      if (!document.hidden) {
        spaceFeature.fetchISS();
        flightsFeature.fetchFlights();
        gpsFeature.fetchGpsJamming();
        eventsFeature.fetchGeopolitical({ alerts: false });
      }
    }

    function bindVisibilityRefresh() {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    function destroy() {
      clearPollTimers();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }

    return {
      bindRegionButtons,
      bindModeButtons,
      bindRefreshButton,
      bindVisibilityRefresh,
      boot,
      destroy,
    };
  }



