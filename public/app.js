/* WorldView app */

// Cesium token
const cesiumToken = String(window.WORLDVIEW_CONFIG?.cesiumIonToken || '').trim();
const hasCesiumToken = Boolean(cesiumToken);
if (hasCesiumToken) {
  Cesium.Ion.defaultAccessToken = cesiumToken;
} else {
  console.warn('CESIUM_ION_TOKEN not set. Running without Cesium World Terrain.');
}

// Init Viewer
const viewer = new Cesium.Viewer('cesiumContainer', {
  terrain: hasCesiumToken ? Cesium.Terrain.fromWorldTerrain() : undefined,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  requestRenderMode: true,
  maximumRenderTimeChange: 0.5,
});

viewer.scene.globe.enableLighting = true;
if (viewer.scene.atmosphere) viewer.scene.atmosphere.brightnessShift = -0.3;
viewer.scene.skyAtmosphere.brightnessShift = -0.1;

viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(-98, 38, 12000000),
  duration: 2,
});

// Primitive collections
const flightCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const satCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());

// State
const state = {
  flightsVisible: true,
  issVisible: true,
  satellitesVisible: true,
  bordersVisible: true,
  citiesVisible: true,
  gpsJammingVisible: true,
  issEntity: null,
  viewMode: 'default',
  bordersSource: null,
  usStatesSource: null,
  countryLabelEntities: [],
  cityEntities: [],
  gpsJammingEntities: [],
  cameraEntities: [],
  eventEntities: [],
  countryLabelCameraListenerAttached: false,
};
const {
  planeSVG,
  eventTextImage,
  gpsTextImage,
} = window.WorldViewSpriteUtils || {};

// DOM refs
const flightCountEl = document.getElementById('flight-count');
const satCountEl = document.getElementById('sat-count');
const issAltEl = document.getElementById('iss-alt');
const issSpeedEl = document.getElementById('iss-speed');
const utcClockEl = document.getElementById('utc-clock');
const statusMsg = document.getElementById('status-msg');
const lastUpdateEl = document.getElementById('last-update');
const tooltip = document.getElementById('info-tooltip');
const tooltipTitle = document.getElementById('tooltip-title');
const tooltipBody = document.getElementById('tooltip-body');

// UTC clock
function updateClock() {
  const now = new Date();
  utcClockEl.textContent =
    String(now.getUTCHours()).padStart(2, '0') + ':' +
    String(now.getUTCMinutes()).padStart(2, '0') + ':' +
    String(now.getUTCSeconds()).padStart(2, '0');
}
setInterval(updateClock, 1000);
updateClock();

// Helpers
function setStatus(msg) { statusMsg.textContent = msg; }
function setLastUpdate() { lastUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()}`; }

const flightsFeature = (window.initWorldViewFlights
  ? window.initWorldViewFlights({
      viewer,
      flightCollection,
      flightCountEl,
      planeSVG,
      setStatus,
      setLastUpdate,
    })
  : {
      fetchFlights: async () => {},
      setFlightsVisible: () => {},
    });
// Satellite Tracking
const spaceFeature = (window.initWorldViewSpace
  ? window.initWorldViewSpace({
      viewer,
      state,
      satCollection,
      satCountEl,
      issAltEl,
      issSpeedEl,
      setStatus,
    })
  : {
      fetchSatellites: async () => {},
      updateSatellitePositions: () => {},
      fetchISS: async () => {},
      setIssVisible: () => {},
      setSatellitesVisible: () => {},
    });
// Country Borders



const geoFeature = (window.initWorldViewGeo
  ? window.initWorldViewGeo({
      viewer,
      state,
      countryTextImage: window.WorldViewSpriteUtils?.countryTextImage,
      cityTextImage: window.WorldViewSpriteUtils?.cityTextImage,
    })
  : {
      loadCountryBorders: async () => {},
      loadUSStateBorders: async () => {},
      loadCities: () => {},
      setBordersVisible: () => {},
      setCitiesVisible: () => {},
    });

function clearGpsJammingEntities() {
  state.gpsJammingEntities.forEach(ent => viewer.entities.remove(ent));
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

// Camera globe overlay
const cctvFeature = (window.initWorldViewCCTV
  ? window.initWorldViewCCTV({
      viewer,
      state,
    })
  : {
      openCCTV: () => {},
      showSingleCamera: () => {},
      openEventCCTV: async () => {},
      closeCCTV: () => {},
      plotCamerasOnGlobe: () => {},
    });
const eventsFeature = (window.initWorldViewEvents
  ? window.initWorldViewEvents({
      viewer,
      state,
      eventTextImage,
      openEventCCTV: cctvFeature.openEventCCTV,
    })
  : {
      renderEventsLoading: () => {},
      fetchGeopolitical: async () => {},
      openEventDetail: () => {},
      closeEventDetail: () => {},
    });

// Hover Tooltip
const interactionsFeature = (window.initWorldViewInteractions
  ? window.initWorldViewInteractions({
      viewer,
      tooltip,
      tooltipTitle,
      tooltipBody,
      openCCTV: cctvFeature.openCCTV,
      showSingleCamera: cctvFeature.showSingleCamera,
      openEventDetail: eventsFeature.openEventDetail,
    })
  : { handler: null });
// Layer Toggles
document.getElementById('toggle-flights').addEventListener('change', e => {
  state.flightsVisible = e.target.checked;
  flightsFeature.setFlightsVisible(state.flightsVisible);
});

document.getElementById('toggle-iss').addEventListener('change', e => {
  state.issVisible = e.target.checked;
  if (state.issEntity) spaceFeature.setIssVisible(state.issVisible);
});

document.getElementById('toggle-satellites').addEventListener('change', e => {
  state.satellitesVisible = e.target.checked;
  spaceFeature.setSatellitesVisible(state.satellitesVisible);
});

document.getElementById('toggle-borders').addEventListener('change', e => {
  geoFeature.setBordersVisible(e.target.checked);
});

document.getElementById('toggle-cities').addEventListener('change', e => {
  geoFeature.setCitiesVisible(e.target.checked);
});

document.getElementById('toggle-gps-jamming').addEventListener('change', e => {
  state.gpsJammingVisible = e.target.checked;
  state.gpsJammingEntities.forEach(ent => { ent.show = state.gpsJammingVisible; });
});

// Focus Regions
const REGIONS = {
  world:   { lon:   0,   lat:  20,  alt: 18_000_000, label: 'Global view' },
  mideast: { lon:  42,   lat:  27,  alt:  3_500_000, label: 'Middle East' },
  europe:  { lon:  15,   lat:  50,  alt:  4_000_000, label: 'Europe' },
  eastasia:{ lon: 118,   lat:  30,  alt:  5_000_000, label: 'East Asia' },
  northam: { lon: -95,   lat:  45,  alt:  8_000_000, label: 'North America' },
  africa:  { lon:  20,   lat:   5,  alt:  7_000_000, label: 'Africa' },
};

document.querySelectorAll('[data-region]').forEach(btn => {
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

// View Mode
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyViewMode(btn.dataset.mode);
  });
});

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

// Refresh Button
document.getElementById('refresh-btn').addEventListener('click', loadAllData);

// Load All Data
async function loadAllData() {
  await Promise.all([flightsFeature.fetchFlights(), spaceFeature.fetchISS(), spaceFeature.fetchSatellites(), fetchGpsJamming()]);
}

// Boot
setStatus('Connecting to data sources...');
geoFeature.loadCountryBorders();
geoFeature.loadUSStateBorders();
geoFeature.loadCities();
loadAllData();
eventsFeature.renderEventsLoading();
eventsFeature.fetchGeopolitical({ alerts: false });

// Auto-refresh cadence is reduced when tab is in background to lower API/load costs.
const POLL_MS_ACTIVE = {
  iss: 10_000,
  satPos: 30_000,
  flights: 60_000,
  satellites: 3_600_000,
  gps: 60_000,
  events: 900_000,
};
const POLL_MS_HIDDEN = {
  iss: 30_000,
  satPos: 60_000,
  flights: 300_000,
  satellites: 3_600_000,
  gps: 300_000,
  events: 1_800_000,
};

const pollTimers = [];

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
  pollTimers.push(setInterval(fetchGpsJamming, cadence.gps));
  pollTimers.push(setInterval(() => eventsFeature.fetchGeopolitical({ alerts: true }), cadence.events));
}

document.addEventListener('visibilitychange', () => {
  startPollTimers();
  if (!document.hidden) {
    spaceFeature.fetchISS();
    flightsFeature.fetchFlights();
    fetchGpsJamming();
    eventsFeature.fetchGeopolitical({ alerts: false });
  }
});

startPollTimers();












