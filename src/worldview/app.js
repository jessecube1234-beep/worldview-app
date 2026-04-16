import {
  planeSVG,
  countryTextImage,
  cityTextImage,
  eventTextImage,
  gpsTextImage,
} from './shared/spriteUtils.js';
import { initWorldViewFlights } from './features/flights.js';
import { initWorldViewSpace } from './features/space.js';
import { initWorldViewGeo } from './features/geo.js';
import { initWorldViewGps } from './features/gps.js';
import { initWorldViewCCTV } from './features/cctv.js';
import { initWorldViewEvents } from './features/events.js';
import { initWorldViewInteractions } from './features/interactions.js';
import { initWorldViewDashboard } from './features/dashboard.js';
import { getCesium } from './shared/runtimeGlobals.js';

export function initWorldViewApp() {
  const Cesium = getCesium();

  const cesiumToken = String(window.WORLDVIEW_CONFIG?.cesiumIonToken || '').trim();
  const hasCesiumToken = Boolean(cesiumToken);
  if (hasCesiumToken) {
    Cesium.Ion.defaultAccessToken = cesiumToken;
  } else {
    console.warn('CESIUM_ION_TOKEN not set. Running without Cesium World Terrain.');
  }

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

  const flightCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
  const satCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());

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

  function updateClock() {
    const now = new Date();
    if (!utcClockEl) return;
    utcClockEl.textContent =
      String(now.getUTCHours()).padStart(2, '0') + ':' +
      String(now.getUTCMinutes()).padStart(2, '0') + ':' +
      String(now.getUTCSeconds()).padStart(2, '0');
  }
  const clockTimer = setInterval(updateClock, 1000);
  updateClock();

  function setStatus(msg) {
    if (statusMsg) statusMsg.textContent = msg;
  }

  function setLastUpdate() {
    if (lastUpdateEl) lastUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  const flightsFeature = initWorldViewFlights({
    viewer,
    flightCollection,
    flightCountEl,
    planeSVG,
    setStatus,
    setLastUpdate,
  });

  const spaceFeature = initWorldViewSpace({
    viewer,
    state,
    satCollection,
    satCountEl,
    issAltEl,
    issSpeedEl,
    setStatus,
  });

  const geoFeature = initWorldViewGeo({
    viewer,
    state,
    countryTextImage,
    cityTextImage,
  });

  const gpsFeature = initWorldViewGps({
    viewer,
    state,
    gpsTextImage,
  });

  const cctvFeature = initWorldViewCCTV({
    viewer,
    state,
  });

  const eventsFeature = initWorldViewEvents({
    viewer,
    state,
    eventTextImage,
    openEventCCTV: cctvFeature.openEventCCTV,
  });

  const interactionsFeature = initWorldViewInteractions({
    viewer,
    tooltip,
    tooltipTitle,
    tooltipBody,
    openCCTV: cctvFeature.openCCTV,
    showSingleCamera: cctvFeature.showSingleCamera,
    openEventDetail: eventsFeature.openEventDetail,
  });

  const dashboardFeature = initWorldViewDashboard({
    viewer,
    state,
    setStatus,
    flightsFeature,
    spaceFeature,
    gpsFeature,
    eventsFeature,
    geoFeature,
  });

  const cleanupFns = [];

  function bindToggle(id, onChange) {
    const element = document.getElementById(id);
    if (!element) return;
    const handler = (e) => onChange(e.target.checked);
    element.addEventListener('change', handler);
    cleanupFns.push(() => element.removeEventListener('change', handler));
  }

  bindToggle('toggle-flights', (checked) => {
    state.flightsVisible = checked;
    flightsFeature.setFlightsVisible(checked);
  });

  bindToggle('toggle-iss', (checked) => {
    state.issVisible = checked;
    if (state.issEntity) spaceFeature.setIssVisible(checked);
  });

  bindToggle('toggle-satellites', (checked) => {
    state.satellitesVisible = checked;
    spaceFeature.setSatellitesVisible(checked);
  });

  bindToggle('toggle-borders', (checked) => {
    geoFeature.setBordersVisible(checked);
  });

  bindToggle('toggle-cities', (checked) => {
    geoFeature.setCitiesVisible(checked);
  });

  bindToggle('toggle-gps-jamming', (checked) => {
    gpsFeature.setGpsJammingVisible(checked);
  });

  dashboardFeature.bindRegionButtons();
  dashboardFeature.bindModeButtons();
  dashboardFeature.bindRefreshButton();
  dashboardFeature.bindVisibilityRefresh();
  dashboardFeature.boot();

  return function destroyWorldViewApp() {
    clearInterval(clockTimer);
    cleanupFns.forEach((fn) => fn());
    if (typeof eventsFeature.destroy === 'function') eventsFeature.destroy();
    if (typeof dashboardFeature.destroy === 'function') dashboardFeature.destroy();
    if (typeof cctvFeature.destroy === 'function') cctvFeature.destroy();
    if (interactionsFeature?.handler) {
      interactionsFeature.handler.destroy();
    }
    viewer.destroy();
  };
}
