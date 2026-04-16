/* ──────────────────────────────────────────────────────────────────────────
   WorldView — app.js
   3D globe · Military aircraft · ISS · Satellites · Country borders · Cities/CCTV
   Stack: Cesium.js · satellite.js · ADS-B Exchange · CelesTrak · WhereTheISS · TfL
────────────────────────────────────────────────────────────────────────── */

// ── Cesium token ─────────────────────────────────────────────────────────────
const cesiumToken = String(window.WORLDVIEW_CONFIG?.cesiumIonToken || '').trim();
const hasCesiumToken = Boolean(cesiumToken);
if (hasCesiumToken) {
  Cesium.Ion.defaultAccessToken = cesiumToken;
} else {
  console.warn('CESIUM_ION_TOKEN not set. Running without Cesium World Terrain.');
}

// ── Init Viewer ─────────────────────────────────────────────────────────────
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

// ── Primitive collections ─────────────────────────────────────────────────────
const flightCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const satCollection    = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  flightsVisible:   true,
  issVisible:       true,
  satellitesVisible:true,
  bordersVisible:   true,
  citiesVisible:    true,
  gpsJammingVisible:true,
  issEntity:        null,
  viewMode:         'default',
  bordersSource:    null,
  usStatesSource:   null,
  countryLabelEntities: [],
  cityEntities:     [],
  gpsJammingEntities: [],
  cameraEntities:   [],
  eventEntities:    [],
  countryLabelCameraListenerAttached: false,
};
let countryLabelUpdatePending = false;
let countryLabelLastUpdateMs = 0;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const flightCountEl  = document.getElementById('flight-count');
const satCountEl     = document.getElementById('sat-count');
const issAltEl       = document.getElementById('iss-alt');
const issSpeedEl     = document.getElementById('iss-speed');
const utcClockEl     = document.getElementById('utc-clock');
const statusMsg      = document.getElementById('status-msg');
const lastUpdateEl   = document.getElementById('last-update');
const tooltip        = document.getElementById('info-tooltip');
const tooltipTitle   = document.getElementById('tooltip-title');
const tooltipBody    = document.getElementById('tooltip-body');

// ── UTC Clock ────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  utcClockEl.textContent =
    String(now.getUTCHours()).padStart(2,'0') + ':' +
    String(now.getUTCMinutes()).padStart(2,'0') + ':' +
    String(now.getUTCSeconds()).padStart(2,'0');
}
setInterval(updateClock, 1000);
updateClock();

// ── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg) { statusMsg.textContent = msg; }
function setLastUpdate() { lastUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()}`; }

// ── Plane SVG — cached by heading rounded to nearest 15° ─────────────────────
const _svgCache = {};
function planeSVG(heading) {
  const h = Math.round(heading / 15) * 15 % 360;
  if (!_svgCache[h]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><g transform="rotate(${h},10,10)"><polygon points="10,1 13,19 10,16 7,19" fill="#ff6b35" opacity="0.95"/></g></svg>`;
    _svgCache[h] = 'data:image/svg+xml;base64,' + btoa(svg);
  }
  return _svgCache[h];
}

// ── Military Aircraft ─────────────────────────────────────────────────────────
const flightsController = window.WorldViewFlights.createFlightsController({
  fetchImpl: fetch,
  setStatus,
  setLastUpdate,
  flightCollection,
  flightCountEl,
  planeSVG,
  Cesium,
});

async function fetchFlights() {
  return flightsController.fetchFlights();
}

// �� Satellite Tracking ���������������������������������������������������������������� ────────────────────────────────────────────────────────
let tleData = [];

async function fetchSatellites() {
  try {
    const res  = await fetch('/api/satellites');
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
  const now  = new Date();
  const gmst = satellite.gstime(now);
  for (const sat of tleData) {
    try {
      const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
      const posVel = satellite.propagate(satrec, now);
      if (!posVel || !posVel.position) continue;
      const geo  = satellite.eciToGeodetic(posVel.position, gmst);
      const lat  = satellite.degreesLat(geo.latitude);
      const lon  = satellite.degreesLong(geo.longitude);
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

// ── ISS Tracking ─────────────────────────────────────────────────────────────
const _issSVG = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect x="0" y="11" width="8" height="6" fill="#ffdd57" opacity="0.85"/><rect x="20" y="11" width="8" height="6" fill="#ffdd57" opacity="0.85"/><rect x="8" y="10" width="12" height="8" rx="2" fill="#aee8ff"/><circle cx="14" cy="14" r="3" fill="#ffffff"/></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
})();

async function fetchISS() {
  try {
    const res  = await fetch('/api/iss');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const { latitude, longitude, altitude, velocity } = data;
    issAltEl.textContent   = `${Math.round(altitude)} km`;
    issSpeedEl.textContent = `${Math.round(velocity)} km/h`;
    if (state.issEntity) viewer.entities.remove(state.issEntity);
    state.issEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude * 1000),
      billboard: { image: _issSVG, scale: 1, verticalOrigin: Cesium.VerticalOrigin.CENTER },
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

// ── Country Borders ───────────────────────────────────────────────────────────

function normalizeLonDelta(deg) {
  let d = deg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function lonInRectangle(lonDeg, rect) {
  const lon = Cesium.Math.toRadians(lonDeg);
  if (rect.west <= rect.east) return lon >= rect.west && lon <= rect.east;
  return lon >= rect.west || lon <= rect.east;
}

const _textImageCache = new Map();
function textBillboardImage(text, opts = {}) {
  const label = String(text || '');
  const font = opts.font || '600 20px "Segoe UI", "Inter", Arial, sans-serif';
  const color = opts.color || '#2fbf71';
  const padX = Number.isFinite(opts.padX) ? opts.padX : 8;
  const height = Number.isFinite(opts.height) ? opts.height : 30;
  const key = `${label}|${font}|${color}|${padX}|${height}`;
  if (_textImageCache.has(key)) return _textImageCache.get(key);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(label).width + padX * 2);
  canvas.width = width;
  canvas.height = height;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.clearRect(0, 0, width, height);
  ctx.fillText(label, padX, Math.floor(height / 2));

  const image = canvas.toDataURL('image/png');
  _textImageCache.set(key, image);
  return image;
}

function countryTextImage(name) {
  return textBillboardImage(name, {
    font: '600 20px "Segoe UI", "Inter", Arial, sans-serif',
    color: '#2fbf71',
    padX: 8,
    height: 30,
  });
}

function cityTextImage(name) {
  return textBillboardImage(name, {
    font: '600 18px "Segoe UI", "Inter", Arial, sans-serif',
    color: '#6bd3ff',
    padX: 7,
    height: 28,
  });
}

function eventTextImage(name) {
  return textBillboardImage(name, {
    font: '600 18px "Segoe UI", "Inter", Arial, sans-serif',
    color: '#ffd166',
    padX: 7,
    height: 28,
  });
}

function gpsTextImage(name) {
  return textBillboardImage(name, {
    font: '600 18px "Segoe UI", "Inter", Arial, sans-serif',
    color: '#ff6b6b',
    padX: 7,
    height: 28,
  });
}

const COUNTRY_LABEL_OFFSETS = {
  'United States': { lon: -3.2, lat: -0.7 },
  'United States of America': { lon: -3.2, lat: -0.7 },
  'Canada': { lon: -3.0, lat: -1.0 },
  'Russian Federation': { lon: -9.0, lat: -0.8 },
  'Russia': { lon: -9.0, lat: -0.8 },
  'People\'s Republic of China': { lon: -1.2, lat: 0.4 },
  'China': { lon: -1.2, lat: 0.4 },
  'Australia': { lon: 0.2, lat: 0.8 },
  'Brazil': { lon: -0.8, lat: 0.3 },
  'India': { lon: -0.5, lat: 0.4 },
  'Greenland': { lon: -2.0, lat: -0.2 },
};

function getCountryLabelOffset(name) {
  return COUNTRY_LABEL_OFFSETS[name] || { lon: 0, lat: 0 };
}

function countryLabelRuleByHeight(heightMeters) {
  if (heightMeters > 22_000_000) return { max: 10, minSepDeg: 18 };
  if (heightMeters > 16_000_000) return { max: 18, minSepDeg: 12 };
  if (heightMeters > 12_000_000) return { max: 40, minSepDeg: 8 };
  if (heightMeters > 8_000_000) return { max: 90, minSepDeg: 5.5 };
  if (heightMeters > 5_000_000) return { max: 160, minSepDeg: 3.5 };
  return { max: 999, minSepDeg: 0 };
}

function scheduleCountryLabelVisibilityUpdate(force = false) {
  const now = Date.now();
  if (force || now - countryLabelLastUpdateMs >= 90) {
    countryLabelLastUpdateMs = now;
    updateCountryLabelVisibility();
    return;
  }
  if (countryLabelUpdatePending) return;
  countryLabelUpdatePending = true;
  setTimeout(() => {
    countryLabelUpdatePending = false;
    countryLabelLastUpdateMs = Date.now();
    updateCountryLabelVisibility();
  }, 95);
}

function updateCountryLabelVisibility() {
  if (!state.countryLabelEntities.length) return;

  if (!state.bordersVisible) {
    state.countryLabelEntities.forEach((ent) => { ent.show = false; });
    viewer.scene.requestRender();
    return;
  }

  const height = viewer.camera.positionCartographic?.height || 0;
  const rule = countryLabelRuleByHeight(height);
  const viewRect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);

  if (!viewRect) {
    state.countryLabelEntities.forEach((ent) => { ent.show = false; });
    viewer.scene.requestRender();
    return;
  }

  const labels = [...state.countryLabelEntities]
    .sort((a, b) => (b._wvPriority || 0) - (a._wvPriority || 0));
  const accepted = [];
  const camPos = Cesium.Cartesian3.normalize(
    viewer.camera.positionWC.clone(),
    new Cesium.Cartesian3()
  );

  for (const ent of labels) {
    const lon = Number(ent._wvLon);
    const lat = Number(ent._wvLat);
    ent.show = false;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const unit = ent._wvUnit || Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      new Cesium.Cartesian3()
    );
    const facing = Cesium.Cartesian3.dot(camPos, unit);
    if (facing < 0.02) continue;
    if (lat < Cesium.Math.toDegrees(viewRect.south) || lat > Cesium.Math.toDegrees(viewRect.north)) continue;
    if (!lonInRectangle(lon, viewRect)) continue;
    if (accepted.length >= rule.max) continue;

    let tooClose = false;
    for (const keep of accepted) {
      const midLatRad = Cesium.Math.toRadians((lat + keep.lat) * 0.5);
      const lonDelta = Math.abs(normalizeLonDelta(lon - keep.lon)) * Math.cos(midLatRad);
      const latDelta = Math.abs(lat - keep.lat);
      const sepDeg = Math.hypot(lonDelta, latDelta);
      if (sepDeg < rule.minSepDeg) {
        tooClose = true;
        break;
      }
    }

    if (tooClose) continue;
    accepted.push({ lon, lat });
    ent.show = true;
  }

  viewer.scene.requestRender();
}

async function loadCountryBorders() {
  try {
    const res = await fetch('/api/countries');
    if (!res.ok) throw new Error(`Countries ${res.status}`);
    const countriesGeoJson = await res.json();

    const dataSource = await Cesium.GeoJsonDataSource.load(countriesGeoJson, {
      stroke:      Cesium.Color.fromCssColorString('#00ff9d').withAlpha(0.35),
      fill:        Cesium.Color.TRANSPARENT,
      strokeWidth: 1,
    });

    // Disable polygon fill entirely — transparent fill still generates geometry
    // and causes "attribute list" mismatch errors in Cesium's renderer
    for (const entity of dataSource.entities.values) {
      if (entity.polygon) {
        entity.polygon.fill    = false;
        entity.polygon.outline = true;
        entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#00ff9d').withAlpha(0.35);
        entity.polygon.outlineWidth = 1;
      }
    }

    dataSource.name = 'countries';
    dataSource.show = state.bordersVisible;
    await viewer.dataSources.add(dataSource);
    state.bordersSource = dataSource;

    // Reset and rebuild country center labels from parsed Cesium country entities.
    state.countryLabelEntities.forEach(e => viewer.entities.remove(e));
    state.countryLabelEntities = [];

    const nowJulian = Cesium.JulianDate.now();
    const bestByCountry = new Map();
    for (const countryEnt of dataSource.entities.values) {
      if (!countryEnt?.polygon) continue;

      const rawName = countryEnt.name || '';
      const name = String(rawName).trim();
      if (!name) continue;

      const hierarchy = Cesium.Property.getValueOrUndefined(countryEnt.polygon.hierarchy, nowJulian);
      const positions = hierarchy?.positions || [];
      if (!positions.length) continue;

      const rect = Cesium.Rectangle.fromCartesianArray(positions);
      if (!rect) continue;
      const center = Cesium.Rectangle.center(rect);
      if (!center) continue;
      const baseLon = Cesium.Math.toDegrees(center.longitude);
      const baseLat = Cesium.Math.toDegrees(center.latitude);
      const offset = getCountryLabelOffset(name);
      const lon = normalizeLonDelta(baseLon + offset.lon);
      const lat = Math.max(-85, Math.min(85, baseLat + offset.lat));
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const prev = bestByCountry.get(name);
      const priorityRadius = Cesium.BoundingSphere.fromPoints(positions).radius;
      if (!prev || priorityRadius > prev.radius) {
        bestByCountry.set(name, { lon, lat, radius: priorityRadius });
      }
    }

    for (const [name, pt] of bestByCountry.entries()) {
      const labelEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 120000),
        description: JSON.stringify({ type: 'country', name: String(name) }),
        billboard: {
          image: countryTextImage(name),
          scale: 0.6,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 20_000_000.0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.NONE,
        },
        show: state.bordersVisible,
      });
      labelEntity._wvLon = pt.lon;
      labelEntity._wvLat = pt.lat;
      labelEntity._wvPriority = pt.radius;
      labelEntity._wvUnit = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 0),
        new Cesium.Cartesian3()
      );
      state.countryLabelEntities.push(labelEntity);
    }

    console.log(`Country borders loaded. Labels: ${state.countryLabelEntities.length}`);
    if (!state.countryLabelCameraListenerAttached) {
      viewer.camera.changed.addEventListener(() => scheduleCountryLabelVisibilityUpdate(false));
      viewer.camera.moveEnd.addEventListener(() => scheduleCountryLabelVisibilityUpdate(true));
      state.countryLabelCameraListenerAttached = true;
    }
    scheduleCountryLabelVisibilityUpdate(true);
    viewer.scene.requestRender();

  } catch (err) {
    console.error('Country borders error:', err.message);
  }
}

async function loadUSStateBorders() {
  try {
    const dataSource = await Cesium.GeoJsonDataSource.load('/api/us-states', {
      stroke: Cesium.Color.fromCssColorString('#7fd6ff').withAlpha(0.45),
      fill: Cesium.Color.TRANSPARENT,
      strokeWidth: 1,
    });

    for (const entity of dataSource.entities.values) {
      if (entity.polygon) {
        entity.polygon.fill = false;
        entity.polygon.outline = true;
        entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#7fd6ff').withAlpha(0.45);
        entity.polygon.outlineWidth = 1;
      }
    }

    dataSource.name = 'us-states';
    dataSource.show = state.bordersVisible;
    await viewer.dataSources.add(dataSource);
    state.usStatesSource = dataSource;
    console.log('US state borders loaded.');
  } catch (err) {
    console.error('US state borders error:', err.message);
  }
}

// ── Cities ────────────────────────────────────────────────────────────────────
const US_STATE_CITIES = [
  { name: 'Birmingham',     lat: 33.5186,  lon: -86.8104,  country: 'US', cam: 'us-birmingham' },
  { name: 'Anchorage',      lat: 61.2181,  lon: -149.9003, country: 'US', cam: 'us-anchorage' },
  { name: 'Phoenix',        lat: 33.4484,  lon: -112.0740, country: 'US', cam: 'us-phoenix' },
  { name: 'Little Rock',    lat: 34.7465,  lon: -92.2896,  country: 'US', cam: 'us-littlerock' },
  { name: 'Los Angeles',    lat: 34.0522,  lon: -118.2437, country: 'US', cam: 'la' },
  { name: 'Denver',         lat: 39.7392,  lon: -104.9903, country: 'US', cam: 'us-denver' },
  { name: 'Hartford',       lat: 41.7658,  lon: -72.6734,  country: 'US', cam: 'us-hartford' },
  { name: 'Wilmington',     lat: 39.7447,  lon: -75.5484,  country: 'US', cam: 'us-wilmington' },
  { name: 'Miami',          lat: 25.7617,  lon: -80.1918,  country: 'US', cam: 'miami' },
  { name: 'Atlanta',        lat: 33.7490,  lon: -84.3880,  country: 'US', cam: 'us-atlanta' },
  { name: 'Honolulu',       lat: 21.3069,  lon: -157.8583, country: 'US', cam: 'us-honolulu' },
  { name: 'Boise',          lat: 43.6150,  lon: -116.2023, country: 'US', cam: 'us-boise' },
  { name: 'Chicago',        lat: 41.8781,  lon: -87.6298,  country: 'US', cam: 'chicago' },
  { name: 'Indianapolis',   lat: 39.7684,  lon: -86.1581,  country: 'US', cam: 'us-indianapolis' },
  { name: 'Des Moines',     lat: 41.5868,  lon: -93.6250,  country: 'US', cam: 'us-desmoines' },
  { name: 'Wichita',        lat: 37.6872,  lon: -97.3301,  country: 'US', cam: 'us-wichita' },
  { name: 'Louisville',     lat: 38.2527,  lon: -85.7585,  country: 'US', cam: 'us-louisville' },
  { name: 'New Orleans',    lat: 29.9511,  lon: -90.0715,  country: 'US', cam: 'us-neworleans' },
  { name: 'Portland ME',    lat: 43.6591,  lon: -70.2568,  country: 'US', cam: 'us-portland-me' },
  { name: 'Baltimore',      lat: 39.2904,  lon: -76.6122,  country: 'US', cam: 'us-baltimore' },
  { name: 'Boston',         lat: 42.3601,  lon: -71.0589,  country: 'US', cam: 'us-boston' },
  { name: 'Detroit',        lat: 42.3314,  lon: -83.0458,  country: 'US', cam: 'us-detroit' },
  { name: 'Minneapolis',    lat: 44.9778,  lon: -93.2650,  country: 'US', cam: 'us-minneapolis' },
  { name: 'Jackson',        lat: 32.2988,  lon: -90.1848,  country: 'US', cam: 'us-jackson-ms' },
  { name: 'St. Louis',      lat: 38.6270,  lon: -90.1994,  country: 'US', cam: 'us-stlouis' },
  { name: 'Billings',       lat: 45.7833,  lon: -108.5007, country: 'US', cam: 'us-billings' },
  { name: 'Omaha',          lat: 41.2565,  lon: -95.9345,  country: 'US', cam: 'us-omaha' },
  { name: 'Las Vegas',      lat: 36.1699,  lon: -115.1398, country: 'US', cam: 'us-lasvegas' },
  { name: 'Manchester NH',  lat: 42.9956,  lon: -71.4548,  country: 'US', cam: 'us-manchester-nh' },
  { name: 'Newark',         lat: 40.7357,  lon: -74.1724,  country: 'US', cam: 'us-newark' },
  { name: 'Albuquerque',    lat: 35.0844,  lon: -106.6504, country: 'US', cam: 'us-albuquerque' },
  { name: 'New York',       lat: 40.7128,  lon: -74.0060,  country: 'US', cam: 'nyc' },
  { name: 'Charlotte',      lat: 35.2271,  lon: -80.8431,  country: 'US', cam: 'us-charlotte' },
  { name: 'Fargo',          lat: 46.8772,  lon: -96.7898,  country: 'US', cam: 'us-fargo' },
  { name: 'Columbus',       lat: 39.9612,  lon: -82.9988,  country: 'US', cam: 'us-columbus' },
  { name: 'Oklahoma City',  lat: 35.4676,  lon: -97.5164,  country: 'US', cam: 'us-oklahomacity' },
  { name: 'Portland OR',    lat: 45.5152,  lon: -122.6784, country: 'US', cam: 'us-portland-or' },
  { name: 'Philadelphia',   lat: 39.9526,  lon: -75.1652,  country: 'US', cam: 'us-philadelphia' },
  { name: 'Providence',     lat: 41.8240,  lon: -71.4128,  country: 'US', cam: 'us-providence' },
  { name: 'Charleston SC',  lat: 32.7765,  lon: -79.9311,  country: 'US', cam: 'us-charleston-sc' },
  { name: 'Sioux Falls',    lat: 43.5446,  lon: -96.7311,  country: 'US', cam: 'us-siouxfalls' },
  { name: 'Nashville',      lat: 36.1627,  lon: -86.7816,  country: 'US', cam: 'us-nashville' },
  { name: 'Houston',        lat: 29.7604,  lon: -95.3698,  country: 'US', cam: 'us-houston' },
  { name: 'Salt Lake City', lat: 40.7608,  lon: -111.8910, country: 'US', cam: 'us-saltlakecity' },
  { name: 'Burlington VT',  lat: 44.4759,  lon: -73.2121,  country: 'US', cam: 'us-burlington-vt' },
  { name: 'Richmond',       lat: 37.5407,  lon: -77.4360,  country: 'US', cam: 'us-richmond' },
  { name: 'Seattle',        lat: 47.6062,  lon: -122.3321, country: 'US', cam: 'us-seattle' },
  { name: 'Charleston WV',  lat: 38.3498,  lon: -81.6326,  country: 'US', cam: 'us-charleston-wv' },
  { name: 'Milwaukee',      lat: 43.0389,  lon: -87.9065,  country: 'US', cam: 'us-milwaukee' },
  { name: 'Cheyenne',       lat: 41.1400,  lon: -104.8202, country: 'US', cam: 'us-cheyenne' },
  { name: 'Washington DC',  lat: 38.9072,  lon: -77.0369,  country: 'US', cam: 'dc' },
];

const CITIES = [
  // Americas
  ...US_STATE_CITIES,
  { name: 'Toronto',        lat: 43.6532,  lon: -79.3832,  country: 'CA', cam: 'toronto' },
  { name: 'Vancouver',      lat: 49.2827,  lon: -123.1207, country: 'CA', cam: 'vancouver' },
  { name: 'Mexico City',    lat: 19.4326,  lon: -99.1332,  country: 'MX', cam: 'mexico' },
  { name: 'Sao Paulo',       lat: -23.5505, lon: -46.6333,  country: 'BR', cam: 'saopaulo' },
  { name: 'Buenos Aires',   lat: -34.6037, lon: -58.3816,  country: 'AR', cam: 'buenosaires' },
  { name: 'Bogota',          lat: 4.7110,   lon: -74.0721,  country: 'CO', cam: 'bogota' },
  { name: 'Lima',           lat: -12.0464, lon: -77.0428,  country: 'PE', cam: 'lima' },
  { name: 'Santiago',       lat: -33.4489, lon: -70.6693,  country: 'CL', cam: 'santiago' },
  // Europe
  { name: 'London',         lat: 51.5074,  lon: -0.1278,   country: 'GB', cam: 'london' },
  { name: 'Paris',          lat: 48.8566,  lon: 2.3522,    country: 'FR', cam: 'paris' },
  { name: 'Berlin',         lat: 52.5200,  lon: 13.4050,   country: 'DE', cam: 'berlin' },
  { name: 'Madrid',         lat: 40.4168,  lon: -3.7038,   country: 'ES', cam: 'madrid' },
  { name: 'Rome',           lat: 41.9028,  lon: 12.4964,   country: 'IT', cam: 'rome' },
  { name: 'Amsterdam',      lat: 52.3676,  lon: 4.9041,    country: 'NL', cam: 'amsterdam' },
  { name: 'Brussels',       lat: 50.8503,  lon: 4.3517,    country: 'BE', cam: 'brussels' },
  { name: 'Vienna',         lat: 48.2082,  lon: 16.3738,   country: 'AT', cam: 'vienna' },
  { name: 'Warsaw',         lat: 52.2297,  lon: 21.0122,   country: 'PL', cam: 'warsaw' },
  { name: 'Kyiv',           lat: 50.4501,  lon: 30.5234,   country: 'UA', cam: 'kyiv' },
  { name: 'Moscow',         lat: 55.7558,  lon: 37.6176,   country: 'RU', cam: 'moscow' },
  { name: 'Stockholm',      lat: 59.3293,  lon: 18.0686,   country: 'SE', cam: 'stockholm' },
  { name: 'Lisbon',         lat: 38.7223,  lon: -9.1393,   country: 'PT', cam: 'lisbon' },
  { name: 'Athens',         lat: 37.9838,  lon: 23.7275,   country: 'GR', cam: 'athens' },
  { name: 'Istanbul',       lat: 41.0082,  lon: 28.9784,   country: 'TR', cam: 'istanbul' },
  // Middle East
  { name: 'Dubai',          lat: 25.2048,  lon: 55.2708,   country: 'AE', cam: 'dubai' },
  { name: 'Abu Dhabi',      lat: 24.4539,  lon: 54.3773,   country: 'AE', cam: 'abudhabi' },
  { name: 'Riyadh',         lat: 24.7136,  lon: 46.6753,   country: 'SA', cam: 'riyadh' },
  { name: 'Baghdad',        lat: 33.3152,  lon: 44.3661,   country: 'IQ', cam: 'baghdad' },
  { name: 'Tehran',         lat: 35.6892,  lon: 51.3890,   country: 'IR', cam: 'tehran' },
  { name: 'Doha',           lat: 25.2854,  lon: 51.5310,   country: 'QA', cam: 'doha' },
  { name: 'Kuwait City',    lat: 29.3759,  lon: 47.9774,   country: 'KW', cam: 'kuwait' },
  { name: 'Muscat',         lat: 23.5859,  lon: 58.4059,   country: 'OM', cam: 'muscat' },
  { name: 'Beirut',         lat: 33.8938,  lon: 35.5018,   country: 'LB', cam: 'beirut' },
  { name: 'Amman',          lat: 31.9454,  lon: 35.9284,   country: 'JO', cam: 'amman' },
  { name: 'Tel Aviv',       lat: 32.0853,  lon: 34.7818,   country: 'IL', cam: 'telaviv' },
  // Africa
  { name: 'Cairo',          lat: 30.0444,  lon: 31.2357,   country: 'EG', cam: 'cairo' },
  { name: 'Lagos',          lat: 6.5244,   lon: 3.3792,    country: 'NG', cam: 'lagos' },
  { name: 'Nairobi',        lat: -1.2921,  lon: 36.8219,   country: 'KE', cam: 'nairobi' },
  { name: 'Johannesburg',   lat: -26.2041, lon: 28.0473,   country: 'ZA', cam: 'joburg' },
  { name: 'Addis Ababa',    lat: 9.0320,   lon: 38.7469,   country: 'ET', cam: 'addis' },
  { name: 'Casablanca',     lat: 33.5731,  lon: -7.5898,   country: 'MA', cam: 'casablanca' },
  { name: 'Khartoum',       lat: 15.5007,  lon: 32.5599,   country: 'SD', cam: 'khartoum' },
  { name: 'Kinshasa',       lat: -4.4419,  lon: 15.2663,   country: 'CD', cam: 'kinshasa' },
  // Asia-Pacific
  { name: 'Tokyo',          lat: 35.6762,  lon: 139.6503,  country: 'JP', cam: 'tokyo' },
  { name: 'Beijing',        lat: 39.9042,  lon: 116.4074,  country: 'CN', cam: 'beijing' },
  { name: 'Shanghai',       lat: 31.2304,  lon: 121.4737,  country: 'CN', cam: 'shanghai' },
  { name: 'Seoul',          lat: 37.5665,  lon: 126.9780,  country: 'KR', cam: 'seoul' },
  { name: 'Hong Kong',      lat: 22.3193,  lon: 114.1694,  country: 'HK', cam: 'hongkong' },
  { name: 'Singapore',      lat: 1.3521,   lon: 103.8198,  country: 'SG', cam: 'singapore' },
  { name: 'Bangkok',        lat: 13.7563,  lon: 100.5018,  country: 'TH', cam: 'bangkok' },
  { name: 'Jakarta',        lat: -6.2088,  lon: 106.8456,  country: 'ID', cam: 'jakarta' },
  { name: 'Kuala Lumpur',   lat: 3.1390,   lon: 101.6869,  country: 'MY', cam: 'kl' },
  { name: 'Manila',         lat: 14.5995,  lon: 120.9842,  country: 'PH', cam: 'manila' },
  { name: 'Ho Chi Minh',    lat: 10.8231,  lon: 106.6297,  country: 'VN', cam: 'hcmc' },
  { name: 'Sydney',         lat: -33.8688, lon: 151.2093,  country: 'AU', cam: 'sydney' },
  { name: 'Melbourne',      lat: -37.8136, lon: 144.9631,  country: 'AU', cam: 'melbourne' },
  // South Asia
  { name: 'Delhi',          lat: 28.7041,  lon: 77.1025,   country: 'IN', cam: 'delhi' },
  { name: 'Mumbai',         lat: 19.0760,  lon: 72.8777,   country: 'IN', cam: 'mumbai' },
  { name: 'Karachi',        lat: 24.8607,  lon: 67.0011,   country: 'PK', cam: 'karachi' },
  { name: 'Dhaka',          lat: 23.8103,  lon: 90.4125,   country: 'BD', cam: 'dhaka' },
  { name: 'Colombo',        lat: 6.9271,   lon: 79.8612,   country: 'LK', cam: 'colombo' },
];

// City marker SVG (pulsing dot style via static image)
const _citySVG = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#ffe066" stroke-width="1.5" opacity="0.9"/><circle cx="7" cy="7" r="2.5" fill="#ffe066" opacity="0.95"/></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
})();

function loadCities() {
  state.cityEntities.forEach(e => viewer.entities.remove(e));
  state.cityEntities = [];

  for (const city of CITIES) {
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 0),
      billboard: {
        image: _citySVG,
        scale: 1,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: 0,
      },
      show: state.citiesVisible,
      description: JSON.stringify({ type: 'city', ...city }),
    });
    const labelEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 30000),
      billboard: {
        image: cityTextImage(city.name),
        scale: 0.5,
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, 10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 12_000_000.0),
        scaleByDistance: new Cesium.NearFarScalar(1_500_000, 1.0, 8_000_000, 0.72),
        translucencyByDistance: new Cesium.NearFarScalar(1_200_000, 1.0, 9_000_000, 0.35),
      },
      show: state.citiesVisible,
      description: JSON.stringify({ type: 'city', ...city }),
    });
    state.cityEntities.push(entity);
    state.cityEntities.push(labelEntity);
  }
}

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

// ── Camera globe overlay ──────────────────────────────────────────────────────
const _camSVG = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="14" viewBox="0 0 20 14"><rect x="1" y="2" width="12" height="10" rx="2" fill="#ff6b35" opacity="0.95"/><polygon points="13,4 19,1 19,13 13,10" fill="#ff6b35" opacity="0.85"/><circle cx="7" cy="7" r="2.8" fill="#fff" opacity="0.7"/></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
})();

function clearCameraEntities() {
  state.cameraEntities.forEach(e => viewer.entities.remove(e));
  state.cameraEntities = [];
  viewer.scene.requestRender();
}

function plotCamerasOnGlobe(cameras) {
  clearCameraEntities();
  for (const cam of cameras) {
    if (cam.lat == null || cam.lon == null) continue;
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 30),
      billboard: {
        image: _camSVG,
        scale: 1.1,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: 0,
      },
    description: JSON.stringify({
      type: 'camera', name: cam.name, imageUrl: cam.imageUrl,
      lat: cam.lat, lon: cam.lon,
      streamUrl: cam.streamUrl || '',
    }),
  });
    state.cameraEntities.push(entity);
  }
  viewer.scene.requestRender();
}

// ── CCTV — city webcam sources (every city has staticApi or liveApi) ──────────
const CITY_CAM_INFO = {
  // Live APIs — real-time images + globe positions
  london:      { label: 'London',       liveApi: '/api/cameras/london',              external: 'https://www.earthcam.com/world/england/london/' },
  singapore:   { label: 'Singapore',    liveApi: '/api/cameras/singapore',           external: 'https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html' },
  // Static overlays — globe dots + camera grid for every other city
  nyc:         { label: 'New York',     staticApi: '/api/cameras/static/nyc',        external: 'https://webcams.nyc.gov/' },
  la:          { label: 'Los Angeles',  staticApi: '/api/cameras/static/la',         external: 'https://cwwp2.dot.ca.gov/vm/streamlist.htm' },
  chicago:     { label: 'Chicago',      staticApi: '/api/cameras/static/chicago',    external: 'https://www.earthcam.com/usa/illinois/chicago/' },
  miami:       { label: 'Miami',        staticApi: '/api/cameras/static/miami',      external: 'https://www.earthcam.com/usa/florida/miami/' },
  dc:          { label: 'Washington DC',staticApi: '/api/cameras/static/dc',         external: 'https://www.earthcam.com/usa/dc/washingtondc/' },
  toronto:     { label: 'Toronto',      staticApi: '/api/cameras/static/toronto',    external: 'https://www.earthcam.com/world/canada/toronto/' },
  vancouver:   { label: 'Vancouver',    staticApi: '/api/cameras/static/vancouver',  external: 'https://www.earthcam.com/world/canada/vancouver/' },
  mexico:      { label: 'Mexico City',  staticApi: '/api/cameras/static/mexico',     external: 'https://www.earthcam.com/world/mexico/mexicocity/' },
  saopaulo:    { label: 'Sao Paulo',     staticApi: '/api/cameras/static/saopaulo',   external: 'https://www.earthcam.com/world/brazil/saopaulo/' },
  buenosaires: { label: 'Buenos Aires', staticApi: '/api/cameras/static/buenosaires',external: 'https://www.earthcam.com/world/argentina/buenosaires/' },
  bogota:      { label: 'Bogota',        staticApi: '/api/cameras/static/bogota',     external: 'https://www.earthcam.com/world/colombia/bogota/' },
  lima:        { label: 'Lima',         staticApi: '/api/cameras/static/lima',       external: 'https://www.earthcam.com/world/peru/lima/' },
  santiago:    { label: 'Santiago',     staticApi: '/api/cameras/static/santiago',   external: 'https://www.earthcam.com/world/chile/santiago/' },
  paris:       { label: 'Paris',        staticApi: '/api/cameras/static/paris',      external: 'https://www.earthcam.com/world/france/paris/' },
  berlin:      { label: 'Berlin',       staticApi: '/api/cameras/static/berlin',     external: 'https://www.earthcam.com/world/germany/berlin/' },
  madrid:      { label: 'Madrid',       staticApi: '/api/cameras/static/madrid',     external: 'https://www.earthcam.com/world/spain/madrid/' },
  rome:        { label: 'Rome',         staticApi: '/api/cameras/static/rome',       external: 'https://www.earthcam.com/world/italy/rome/' },
  amsterdam:   { label: 'Amsterdam',    staticApi: '/api/cameras/static/amsterdam',  external: 'https://www.earthcam.com/world/netherlands/amsterdam/' },
  brussels:    { label: 'Brussels',     staticApi: '/api/cameras/static/brussels',   external: 'https://www.earthcam.com/world/belgium/brussels/' },
  vienna:      { label: 'Vienna',       staticApi: '/api/cameras/static/vienna',     external: 'https://www.earthcam.com/world/austria/vienna/' },
  warsaw:      { label: 'Warsaw',       staticApi: '/api/cameras/static/warsaw',     external: 'https://www.earthcam.com/world/poland/warsaw/' },
  kyiv:        { label: 'Kyiv',         staticApi: '/api/cameras/static/kyiv',       external: 'https://www.earthcam.com/world/ukraine/kyiv/' },
  moscow:      { label: 'Moscow',       staticApi: '/api/cameras/static/moscow',     external: 'https://www.earthcam.com/world/russia/moscow/' },
  stockholm:   { label: 'Stockholm',    staticApi: '/api/cameras/static/stockholm',  external: 'https://www.earthcam.com/world/sweden/stockholm/' },
  lisbon:      { label: 'Lisbon',       staticApi: '/api/cameras/static/lisbon',     external: 'https://www.earthcam.com/world/portugal/lisbon/' },
  athens:      { label: 'Athens',       staticApi: '/api/cameras/static/athens',     external: 'https://www.earthcam.com/world/greece/athens/' },
  istanbul:    { label: 'Istanbul',     staticApi: '/api/cameras/static/istanbul',   external: 'https://www.earthcam.com/world/turkey/istanbul/' },
  dubai:       { label: 'Dubai',        staticApi: '/api/cameras/static/dubai',      external: 'https://www.earthcam.com/world/unitedarabemirates/dubai/' },
  abudhabi:    { label: 'Abu Dhabi',    staticApi: '/api/cameras/static/abudhabi',   external: 'https://www.earthcam.com/world/unitedarabemirates/' },
  riyadh:      { label: 'Riyadh',       staticApi: '/api/cameras/static/riyadh',     external: 'https://www.earthcam.com/world/saudiarabia/' },
  baghdad:     { label: 'Baghdad',      staticApi: '/api/cameras/static/baghdad',    external: 'https://www.google.com/search?q=Baghdad+live+cameras' },
  tehran:      { label: 'Tehran',       staticApi: '/api/cameras/static/tehran',     external: 'https://www.earthcam.com/world/iran/tehran/' },
  doha:        { label: 'Doha',         staticApi: '/api/cameras/static/doha',       external: 'https://www.earthcam.com/world/qatar/doha/' },
  kuwait:      { label: 'Kuwait City',  staticApi: '/api/cameras/static/kuwait',     external: 'https://www.google.com/search?q=Kuwait+City+live+cameras' },
  muscat:      { label: 'Muscat',       staticApi: '/api/cameras/static/muscat',     external: 'https://www.google.com/search?q=Muscat+live+cameras' },
  beirut:      { label: 'Beirut',       staticApi: '/api/cameras/static/beirut',     external: 'https://www.earthcam.com/world/lebanon/beirut/' },
  amman:       { label: 'Amman',        staticApi: '/api/cameras/static/amman',      external: 'https://www.google.com/search?q=Amman+live+cameras' },
  telaviv:     { label: 'Tel Aviv',     staticApi: '/api/cameras/static/telaviv',    external: 'https://www.earthcam.com/world/israel/telaviv/' },
  cairo:       { label: 'Cairo',        staticApi: '/api/cameras/static/cairo',      external: 'https://www.earthcam.com/world/egypt/cairo/' },
  lagos:       { label: 'Lagos',        staticApi: '/api/cameras/static/lagos',      external: 'https://www.earthcam.com/world/nigeria/lagos/' },
  nairobi:     { label: 'Nairobi',      staticApi: '/api/cameras/static/nairobi',    external: 'https://www.earthcam.com/world/kenya/nairobi/' },
  joburg:      { label: 'Johannesburg', staticApi: '/api/cameras/static/joburg',     external: 'https://www.earthcam.com/world/southafrica/' },
  addis:       { label: 'Addis Ababa',  staticApi: '/api/cameras/static/addis',      external: 'https://www.google.com/search?q=Addis+Ababa+live+cameras' },
  casablanca:  { label: 'Casablanca',   staticApi: '/api/cameras/static/casablanca', external: 'https://www.earthcam.com/world/morocco/casablanca/' },
  khartoum:    { label: 'Khartoum',     staticApi: '/api/cameras/static/khartoum',   external: 'https://www.google.com/search?q=Khartoum+live+cameras' },
  kinshasa:    { label: 'Kinshasa',     staticApi: '/api/cameras/static/kinshasa',   external: 'https://www.google.com/search?q=Kinshasa+live+cameras' },
  tokyo:       { label: 'Tokyo',        staticApi: '/api/cameras/static/tokyo',      external: 'https://www.earthcam.com/world/japan/tokyo/' },
  beijing:     { label: 'Beijing',      staticApi: '/api/cameras/static/beijing',    external: 'https://www.earthcam.com/world/china/beijing/' },
  shanghai:    { label: 'Shanghai',     staticApi: '/api/cameras/static/shanghai',   external: 'https://www.earthcam.com/world/china/shanghai/' },
  seoul:       { label: 'Seoul',        staticApi: '/api/cameras/static/seoul',      external: 'https://www.earthcam.com/world/korea/seoul/' },
  hongkong:    { label: 'Hong Kong',    staticApi: '/api/cameras/static/hongkong',   external: 'https://www.earthcam.com/world/china/hongkong/' },
  bangkok:     { label: 'Bangkok',      staticApi: '/api/cameras/static/bangkok',    external: 'https://www.earthcam.com/world/thailand/bangkok/' },
  jakarta:     { label: 'Jakarta',      staticApi: '/api/cameras/static/jakarta',    external: 'https://www.earthcam.com/world/indonesia/jakarta/' },
  kl:          { label: 'Kuala Lumpur', staticApi: '/api/cameras/static/kl',         external: 'https://www.earthcam.com/world/malaysia/kualalumpur/' },
  manila:      { label: 'Manila',       staticApi: '/api/cameras/static/manila',     external: 'https://www.earthcam.com/world/philippines/manila/' },
  hcmc:        { label: 'Ho Chi Minh',  staticApi: '/api/cameras/static/hcmc',       external: 'https://www.earthcam.com/world/vietnam/hochiminhcity/' },
  sydney:      { label: 'Sydney',       staticApi: '/api/cameras/static/sydney',     external: 'https://www.livetraffic.com/traffic-cameras.html' },
  melbourne:   { label: 'Melbourne',    staticApi: '/api/cameras/static/melbourne',  external: 'https://www.earthcam.com/world/australia/melbourne/' },
  delhi:       { label: 'Delhi',        staticApi: '/api/cameras/static/delhi',      external: 'https://www.earthcam.com/world/india/newdelhi/' },
  mumbai:      { label: 'Mumbai',       staticApi: '/api/cameras/static/mumbai',     external: 'https://www.earthcam.com/world/india/mumbai/' },
  karachi:     { label: 'Karachi',      staticApi: '/api/cameras/static/karachi',    external: 'https://www.google.com/search?q=Karachi+live+cameras' },
  dhaka:       { label: 'Dhaka',        staticApi: '/api/cameras/static/dhaka',      external: 'https://www.google.com/search?q=Dhaka+live+cameras' },
  colombo:     { label: 'Colombo',      staticApi: '/api/cameras/static/colombo',    external: 'https://www.google.com/search?q=Colombo+live+cameras' },
};

function getCityCamInfo(city) {
  if (CITY_CAM_INFO[city.cam]) return CITY_CAM_INFO[city.cam];
  const query = city.country === 'US'
    ? `${city.name} traffic cameras live`
    : `${city.name} live webcam CCTV street camera`;
  return {
    label: city.name,
    windRadius: city.country === 'US' ? 90 : 60,
    external: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  };
}

async function fetchWindyCameras(lat, lon, radius = 40) {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    radius: Math.round(radius).toString(),
  });
  const res = await fetch(`/api/cameras/windy?${params}`);
  if (!res.ok) {
    let details = '';
    try {
      const body = await res.json();
      if (body?.error) details = body.error;
      if (body?.details) details = `${details}${details ? ' | ' : ''}${body.details}`;
    } catch (_) {
      // keep status-only fallback if JSON parsing fails
    }
    throw new Error(`Windy cameras ${res.status}${details ? `: ${details}` : ''}`);
  }
  return res.json();
}


// ── CCTV Modal ────────────────────────────────────────────────────────────────
const cctvOverlay  = document.getElementById('cctv-overlay');
const cctvTitle    = document.getElementById('cctv-title');
const cctvMeta     = document.getElementById('cctv-meta');
const cctvGrid     = document.getElementById('cctv-grid');
const cctvStatus   = document.getElementById('cctv-status');
const cctvExternal = document.getElementById('cctv-external');
let   cctvRefreshTimer = null;
let   cctvCurrentCams = [];
let   cctvFocusedCamKey = null;

document.getElementById('cctv-close').addEventListener('click', closeCCTV);
cctvOverlay.addEventListener('click', e => { if (e.target === cctvOverlay) closeCCTV(); });

function closeCCTV() {
  cctvOverlay.style.display = 'none';
  clearInterval(cctvRefreshTimer);
  cctvRefreshTimer = null;
  cctvCurrentCams = [];
  cctvFocusedCamKey = null;
  clearCameraEntities();
}

async function openCCTV(city) {
  closeCCTV();
  const info = getCityCamInfo(city);

  cctvOverlay.style.display = 'flex';
  cctvTitle.textContent  = `[ ${city.name.toUpperCase()} | CCTV ]`;
  cctvMeta.textContent   = `${city.lat.toFixed(4)} deg, ${city.lon.toFixed(4)} deg | ${city.country}`;
  cctvGrid.innerHTML     = '<div class="cctv-loading">Loading cameras...</div>';
  cctvStatus.textContent = '';

  cctvCurrentCams = [];
  cctvFocusedCamKey = null;

  cctvExternal.href = info.external ||
    `https://www.google.com/search?q=${encodeURIComponent(city.name + ' live webcam CCTV street camera')}`;
  cctvExternal.style.display = 'inline';
  cctvExternal.textContent = 'Open More ?';

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 15000),
    duration: 1.5,
  });

  if (!info.skipWindy) {
    try {
      cctvStatus.textContent = 'Searching Windy webcams...';
      const windyCams = await fetchWindyCameras(city.lat, city.lon, info.windRadius ?? 40);
      if (Array.isArray(windyCams) && windyCams.length) {
        cctvStatus.textContent = `${windyCams.length} Windy webcams | click a preview`;
        renderCamImages(windyCams);
        plotCamerasOnGlobe(windyCams);
        return;
      }
      cctvStatus.textContent = 'Windy has no nearby cameras | showing fallback sources';
    } catch (err) {
      console.warn('Windy webcams error:', err);
      cctvStatus.textContent = 'Windy webcams unavailable | showing fallback sources';
    }
  }

  if (info.liveApi) {
    try {
      const res  = await fetch(info.liveApi);
      const cams = await res.json();
      if (!Array.isArray(cams) || cams.length === 0) throw new Error('No cameras returned');

      cctvStatus.textContent = `${cams.length} live cameras | click dots on globe | auto-refresh 10s`;
      renderCamImages(cams);
      plotCamerasOnGlobe(cams);
      cctvRefreshTimer = setInterval(() => renderCamImages(cams), 10000);
    } catch (err) {
      cctvGrid.innerHTML = `<div class="cctv-error">Live feed unavailable: ${err.message}</div>`;
      cctvStatus.textContent = 'Live API error';
    }
    return;
  }

  if (info.staticApi) {
    try {
      const res  = await fetch(info.staticApi);
      const cams = await res.json();
      if (Array.isArray(cams) && cams.length > 0) {
        plotCamerasOnGlobe(cams);
        cctvStatus.textContent = `${cams.length} camera positions | click a card or globe dot to fly there`;
        renderStaticCamCards(cams);
        return;
      }
    } catch (_) {}
  }

  cctvGrid.innerHTML = '<div class="cctv-error">Camera data unavailable</div>';
  cctvStatus.textContent = 'No camera data';
}


// Show a single camera feed (from clicking a globe camera dot)
function showSingleCamera(cam) {
  cctvOverlay.style.display = 'flex';
  cctvTitle.textContent  = `[ CAMERA | ${cam.name.toUpperCase()} ]`;
  cctvMeta.textContent   = `${Number(cam.lat).toFixed(4)} deg, ${Number(cam.lon).toFixed(4)} deg`;
  cctvExternal.style.display = 'none';
  clearInterval(cctvRefreshTimer);
  cctvCurrentCams = [];
  cctvFocusedCamKey = null;

  // No live image - show location info card
  if (!cam.imageUrl) {
    cctvStatus.textContent = 'Known camera location - no live feed available';
    cctvGrid.innerHTML = `
      <div class="cctv-nostream">
        <div class="cctv-nostream-icon">CAM</div>
        <div class="cctv-nostream-msg">
          <strong>${cam.name}</strong><br>
          ${Number(cam.lat).toFixed(5)} deg, ${Number(cam.lon).toFixed(5)} deg<br><br>
          Known camera position. Live feed not directly accessible.<br>
          Close this panel and click <strong>Open More -></strong> for external feeds.
        </div>
      </div>`;
    return;
  }

  cctvStatus.textContent = 'Live feed | auto-refresh 5s';
  cctvGrid.innerHTML = '';
  const cell  = document.createElement('div');
  cell.className = 'cam-cell cam-single';
  const img   = document.createElement('img');
  img.className = 'cam-img cam-img-large';
  img.src = cam.imageUrl;
  img.onerror = () => cell.classList.add('cam-error');
  const label = document.createElement('div');
  label.className = 'cam-label';
  label.textContent = cam.name;
  cell.appendChild(img);
  cell.appendChild(label);
  cctvGrid.appendChild(cell);

  cctvRefreshTimer = setInterval(() => {
    // Force reload by cloning src (avoids cached 304)
    img.src = '';
    img.src = cam.imageUrl;
  }, 5000);
}

function cctvCamKey(cam) {
  return `${cam.name || ''}|${Number(cam.lat).toFixed(5)}|${Number(cam.lon).toFixed(5)}|${cam.imageUrl || ''}`;
}

function renderFocusedCam(cam) {
  cctvGrid.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'cam-focus-toolbar';

  const backBtn = document.createElement('button');
  backBtn.className = 'cam-focus-back';
  backBtn.type = 'button';
  backBtn.textContent = 'Back to all feeds';
  backBtn.addEventListener('click', () => {
    cctvFocusedCamKey = null;
    cctvStatus.textContent = `${cctvCurrentCams.length} cameras | click a preview to focus`;
    renderCamImages(cctvCurrentCams);
  });

  toolbar.appendChild(backBtn);
  cctvGrid.appendChild(toolbar);

  const cell = document.createElement('div');
  cell.className = 'cam-cell cam-single';

  const img = document.createElement('img');
  img.className = 'cam-img cam-img-large';
  img.alt = cam.name;
  img.src = cam.imageUrl;
  img.onerror = () => { img.src = ''; cell.classList.add('cam-error'); };

  const label = document.createElement('div');
  label.className = 'cam-label';
  label.textContent = cam.name;

  cell.appendChild(img);
  cell.appendChild(label);
  cctvGrid.appendChild(cell);
  cctvStatus.textContent = `${cam.name} | focused feed`;
}

function renderCamImages(cams) {
  cctvCurrentCams = Array.isArray(cams) ? cams : [];
  if (cctvFocusedCamKey && cctvCurrentCams.length) {
    const focused = cctvCurrentCams.find(cam => cctvCamKey(cam) === cctvFocusedCamKey);
    if (focused) {
      renderFocusedCam(focused);
      return;
    }
    cctvFocusedCamKey = null;
    cctvStatus.textContent = `${cctvCurrentCams.length} cameras | click a preview to focus`;
  }

  cctvGrid.innerHTML = '';
  for (const cam of cctvCurrentCams) {
    const cell = document.createElement('div');
    cell.className = 'cam-cell cam-clickable';
    cell.title = `Open ${cam.name}`;

    const label = document.createElement('div');
    label.className = 'cam-label';
    label.textContent = cam.name;

    const img = document.createElement('img');
    img.className = 'cam-img';
    img.alt = cam.name;
    img.src = cam.imageUrl;
    img.onerror = () => { img.src = ''; cell.classList.add('cam-error'); label.textContent += ' (unavailable)'; };

    cell.addEventListener('click', () => {
      cctvFocusedCamKey = cctvCamKey(cam);
      renderFocusedCam(cam);
    });

    cell.appendChild(img);
    cell.appendChild(label);
    cctvGrid.appendChild(cell);
  }
}

// Render static camera location cards - clearly labelled position markers
function renderStaticCamCards(cams) {
  cctvGrid.innerHTML = '';
  for (const cam of cams) {
    const cell = document.createElement('div');
    cell.className = 'cam-cell cam-static-cell';
    cell.title = `Click to fly to ${cam.name}`;

    const placeholder = document.createElement('div');
    placeholder.className = 'cam-static-placeholder';

    const icon = document.createElement('span');
    icon.className = 'cam-static-icon';
    icon.textContent = 'CAM';

    const nameEl = document.createElement('div');
    nameEl.className = 'cam-static-name';
    nameEl.textContent = cam.name;

    placeholder.appendChild(icon);
    placeholder.appendChild(nameEl);

    const coords = document.createElement('div');
    coords.className = 'cam-static-coords';
    coords.textContent = `${cam.lat.toFixed(4)} deg  ${cam.lon.toFixed(4)} deg`;

    cell.appendChild(placeholder);
    cell.appendChild(coords);

    cell.addEventListener('click', () => {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 1500),
        duration: 1.5,
      });
    });

    cctvGrid.appendChild(cell);
  }
}

// ── Geopolitical Events ───────────────────────────────────────────────────────
const eventsListEl  = document.getElementById('events-list');
const eventsUpdateEl = document.getElementById('events-update');
const eventsFreshnessEl = document.getElementById('events-freshness');
const eventsStatusFilterEl = document.getElementById('events-status-filter');
const eventsSeverityFilterEl = document.getElementById('events-severity-filter');
const eventsTypeFilterEl = document.getElementById('events-type-filter');
const eventsTimelineButtons = [...document.querySelectorAll('.events-timeline')];
const eventsAlertsEnabledEl = document.getElementById('events-alerts-enabled');
const eventsAlertSeverityEl = document.getElementById('events-alert-severity');
const eventDetailPanel = document.getElementById('event-detail-panel');
const eventDetailClose = document.getElementById('event-detail-close');
const eventDetailMeta = document.getElementById('event-detail-meta');
const eventDetailSummary = document.getElementById('event-detail-summary');
const eventDetailType = document.getElementById('event-detail-type');
const eventDetailActors = document.getElementById('event-detail-actors');
const eventDetailSeverity = document.getElementById('event-detail-severity');
const eventDetailConfidence = document.getElementById('event-detail-confidence');
const eventDetailSeen = document.getElementById('event-detail-seen');
const eventDetailSource = document.getElementById('event-detail-source');
const eventDetailLink = document.getElementById('event-detail-link');
const eventDetailCctvBtn = document.getElementById('event-detail-cctv');
const eventDetailPinBtn = document.getElementById('event-detail-pin');
const alertToastWrap = document.getElementById('alert-toast-wrap');
let eventSelectedKey = '';
let currentEventDetail = null;
let pinnedEventKey = localStorage.getItem('worldview.events.pinned') || '';
const alertedEventTimes = new Map();
const eventView = {
  timeline: '24',
  status: 'all',
  severity: '1',
  type: 'all',
};
const eventAlerts = {
  enabled: localStorage.getItem('worldview.alerts.enabled') === '1',
  severity: localStorage.getItem('worldview.alerts.severity') || '2',
};
let geoRequestSeq = 0;

// SVG icons: concentric rings, color by severity
const _evtSVGCache = {};
function eventSVG(severity) {
  if (_evtSVGCache[severity]) return _evtSVGCache[severity];
  const color = severity === 3 ? '#ff4444' : severity === 2 ? '#ff8c00' : '#ffe066';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="none" stroke="${color}" stroke-width="1" opacity="0.35"/><circle cx="15" cy="15" r="8" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.65"/><circle cx="15" cy="15" r="3.5" fill="${color}" opacity="0.95"/></svg>`;
  _evtSVGCache[severity] = 'data:image/svg+xml;base64,' + btoa(svg);
  return _evtSVGCache[severity];
}

function clearEventEntities() {
  state.eventEntities.forEach(({ entity, labelEntity }) => {
    viewer.entities.remove(entity);
    if (labelEntity) viewer.entities.remove(labelEntity);
  });
  state.eventEntities = [];
}

function eventKey(ev) {
  return `${ev.location || ''}|${ev.title || ''}|${Number(ev.lat).toFixed(3)}|${Number(ev.lon).toFixed(3)}`;
}


function formatEventTime(seendate) {
  if (!seendate) return '';
  try {
    // GDELT format: 20240315T123000Z
    const s = String(seendate);
    const d = new Date(
      `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:00Z`
    );
    if (Number.isNaN(d.getTime())) return '';
    const deltaMs = Date.now() - d.getTime();
    if (!Number.isFinite(deltaMs)) return '';
    if (deltaMs < 0) return 'just now';
    const h = Math.floor(deltaMs / 3_600_000);
    const m = Math.floor((deltaMs % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ago` : `${m}m ago`;
  } catch { return ''; }
}

function confidenceClass(confidence) {
  const label = String(confidence?.label || '').toLowerCase();
  if (label.includes('high')) return 'high';
  if (label.includes('medium')) return 'medium';
  return 'low';
}

function severityLabel(severity) {
  return severity === 3 ? 'Critical' : severity === 2 ? 'High' : 'Moderate';
}

function formatEventTimestamp(ts) {
  if (!ts) return 'Unknown';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString();
}

function normalizeTypeValue(v) {
  return String(v || '').toLowerCase();
}

function populateEventTypeOptions(types = []) {
  if (!eventsTypeFilterEl) return;
  const current = eventsTypeFilterEl.value || 'all';
  eventsTypeFilterEl.innerHTML = '<option value="all">All types</option>';
  for (const t of types) {
    const opt = document.createElement('option');
    opt.value = normalizeTypeValue(t);
    opt.textContent = t;
    eventsTypeFilterEl.appendChild(opt);
  }
  if ([...eventsTypeFilterEl.options].some(o => o.value === current)) {
    eventsTypeFilterEl.value = current;
  } else {
    eventsTypeFilterEl.value = 'all';
    eventView.type = 'all';
  }
}

function setEventsFreshness(payload) {
  if (!eventsFreshnessEl) return;
  const isCached = Boolean(payload?.cached);
  eventsFreshnessEl.classList.remove('live', 'cached');
  eventsFreshnessEl.classList.add(isCached ? 'cached' : 'live');
  eventsFreshnessEl.textContent = isCached ? 'Cached feed' : 'Live feed';
}

function renderEventsLoading(count = 4) {
  if (!eventsListEl) return;
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push(
      '<div class="events-skeleton"><div class="events-skeleton-bar"></div><div class="events-skeleton-bar short"></div></div>'
    );
  }
  eventsListEl.innerHTML = rows.join('');
}

function renderEventsEmpty(message, hint = '') {
  if (!eventsListEl) return;
  const hintHtml = hint ? `<span class="events-empty-hint">${hint}</span>` : '';
  eventsListEl.innerHTML = `<div class="events-empty">${message}${hintHtml}</div>`;
}

function syncPinnedEventStorage() {
  if (pinnedEventKey) localStorage.setItem('worldview.events.pinned', pinnedEventKey);
  else localStorage.removeItem('worldview.events.pinned');
}

function updateEventPinButton(ev) {
  if (!eventDetailPinBtn) return;
  const key = ev ? eventKey(ev) : '';
  const isPinned = Boolean(key && key === pinnedEventKey);
  eventDetailPinBtn.classList.toggle('active', isPinned);
  eventDetailPinBtn.textContent = isPinned ? 'Unpin Event' : 'Pin Event';
}

function showAlertToast(message, severity = 2) {
  if (!alertToastWrap) return;
  const toast = document.createElement('div');
  toast.className = `alert-toast sev-${severity}`;
  toast.textContent = message;
  alertToastWrap.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 7000);
}

function maybeDesktopNotify(title, body) {
  if (!eventAlerts.enabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch (_) {}
}

function processEventAlerts(events) {
  if (!eventAlerts.enabled) return;
  const minSeverity = parseInt(eventAlerts.severity || '2', 10) || 2;
  const nowMs = Date.now();
  const staleCutoff = nowMs - 7 * 24 * 3_600_000;

  for (const [key, ts] of alertedEventTimes.entries()) {
    if (ts < staleCutoff) alertedEventTimes.delete(key);
  }

  for (const ev of events) {
    if ((ev.severity || 1) < minSeverity) continue;
    const state = String(ev.state || '').toLowerCase();
    if (state !== 'new' && state !== 'updated') continue;
    const key = eventKey(ev);
    const lastSeen = alertedEventTimes.get(key) || 0;
    if (nowMs - lastSeen < 30 * 60 * 1000) continue;
    alertedEventTimes.set(key, nowMs);
    const msg = `${(ev.location || 'Unknown').toUpperCase()} | ${state.toUpperCase()} | ${ev.title}`;
    showAlertToast(msg, ev.severity || 2);
    maybeDesktopNotify(`WorldView Alert (${state.toUpperCase()})`, `${ev.location}: ${ev.title}`);
  }
}

function closeEventDetail() {
  if (eventDetailPanel) eventDetailPanel.style.display = 'none';
  eventSelectedKey = '';
  currentEventDetail = null;
  updateEventPinButton(null);
  document.querySelectorAll('.event-card.active').forEach(el => el.classList.remove('active'));
}

function openEventDetail(ev, cardEl = null) {
  if (!eventDetailPanel) return;
  eventSelectedKey = eventKey(ev);
  currentEventDetail = ev;
  document.querySelectorAll('.event-card.active').forEach(el => el.classList.remove('active'));
  if (cardEl) cardEl.classList.add('active');

  eventDetailPanel.style.display = 'block';
  updateEventPinButton(ev);
  const stateLabel = String(ev.state || 'active').toUpperCase();
  eventDetailMeta.textContent = `${(ev.location || 'Unknown').toUpperCase()} | ${ev.eventType || 'Geopolitical Event'} | ${stateLabel}`;
  eventDetailSummary.textContent = ev.summary || ev.title || 'No summary available.';
  eventDetailType.textContent = ev.eventType || 'Unclassified';
  eventDetailActors.textContent = Array.isArray(ev.actors) && ev.actors.length ? ev.actors.join(', ') : 'Unspecified';
  eventDetailSeverity.textContent = severityLabel(ev.severity);
  eventDetailConfidence.textContent = ev.confidence?.score != null
    ? `${ev.confidence.score}/100 (${ev.confidence.label || 'N/A'})`
    : 'N/A';
  eventDetailSeen.textContent = `${formatEventTime(ev.seendate) || 'Unknown'} (${formatEventTimestamp(ev.lastSeen)})`;
  eventDetailSource.textContent = `${ev.sourceCount || 0} source${ev.sourceCount === 1 ? '' : 's'} | ${ev.domain || (ev.sourceTier === 'fallback' ? 'Fallback model' : 'Open source')}`;

  const link = (Array.isArray(ev.sourceLinks) && ev.sourceLinks[0]?.url) || ev.url;
  if (link) {
    eventDetailLink.style.display = 'inline-block';
    eventDetailLink.href = link;
  } else {
    eventDetailLink.style.display = 'none';
    eventDetailLink.href = '#';
  }
}

async function openEventCCTV(ev) {
  if (!ev || !Number.isFinite(Number(ev.lat)) || !Number.isFinite(Number(ev.lon))) return;
  closeCCTV();

  cctvOverlay.style.display = 'flex';
  cctvTitle.textContent = `[ EVENT CCTV | ${(ev.location || 'UNKNOWN').toUpperCase()} ]`;
  cctvMeta.textContent = `${Number(ev.lat).toFixed(4)} deg, ${Number(ev.lon).toFixed(4)} deg | ${ev.eventType || 'Event'}`;
  cctvGrid.innerHTML = '<div class="cctv-loading">Loading nearby event cameras...</div>';
  cctvStatus.textContent = 'Searching Windy webcams near event...';
  cctvExternal.href = `https://www.google.com/search?q=${encodeURIComponent((ev.location || 'location') + ' live camera')}`;
  cctvExternal.style.display = 'inline';
  cctvExternal.textContent = 'Open More ->';

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(Number(ev.lon), Number(ev.lat), 15000),
    duration: 1.6,
  });

  try {
    const cams = await fetchWindyCameras(Number(ev.lat), Number(ev.lon), 90);
    if (Array.isArray(cams) && cams.length) {
      cctvStatus.textContent = `${cams.length} nearby webcams | click a preview`;
      renderCamImages(cams);
      plotCamerasOnGlobe(cams);
      return;
    }
    cctvGrid.innerHTML = '<div class="cctv-error">No nearby live cameras found for this event.</div>';
    cctvStatus.textContent = 'No nearby cameras';
  } catch (err) {
    cctvGrid.innerHTML = `<div class="cctv-error">Nearby cameras unavailable: ${err.message}</div>`;
    cctvStatus.textContent = 'Event CCTV unavailable';
  }
}

if (eventDetailClose) eventDetailClose.addEventListener('click', closeEventDetail);
if (eventDetailCctvBtn) {
  eventDetailCctvBtn.addEventListener('click', () => {
    if (!currentEventDetail) return;
    openEventCCTV(currentEventDetail);
  });
}
if (eventDetailPinBtn) {
  eventDetailPinBtn.addEventListener('click', () => {
    if (!currentEventDetail) return;
    const key = eventKey(currentEventDetail);
    pinnedEventKey = pinnedEventKey === key ? '' : key;
    syncPinnedEventStorage();
    updateEventPinButton(currentEventDetail);
    document.querySelectorAll('.event-card').forEach((card) => {
      const match = card.getAttribute('data-event-key') === pinnedEventKey;
      card.classList.toggle('pinned', match);
    });
  });
}

async function fetchGeopolitical(opts = {}) {
  const shouldAlert = Boolean(opts.alerts);
  const reqSeq = ++geoRequestSeq;
  try {
    const params = new URLSearchParams({
      timeline: eventView.timeline,
      status: eventView.status,
      severity: eventView.severity,
      type: eventView.type,
    });
    const res = await fetch(`/api/geopolitical?${params.toString()}`);
    const payload = await res.json();
    if (reqSeq !== geoRequestSeq) return;
    setEventsFreshness(payload);
    const events = Array.isArray(payload?.events) ? payload.events : Array.isArray(payload) ? payload : [];
    const availableTypes = Array.isArray(payload?.availableTypes) ? payload.availableTypes : [];
    populateEventTypeOptions(availableTypes);
    if (!Array.isArray(events) || events.length === 0) {
      clearEventEntities();
      const timelineLabel = eventView.timeline === '24' ? '24H' : eventView.timeline === '168' ? '7D' : eventView.timeline === '720' ? '30D' : 'ONGOING';
      renderEventsEmpty(
        `No events found for ${timelineLabel}.`,
        timelineLabel === '24H' ? 'Try 7D or Ongoing for broader context.' : ''
      );
      eventsUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
      if (!pinnedEventKey) closeEventDetail();
      return;
    }

    clearEventEntities();
    eventsListEl.innerHTML = '';

    let detailRestored = false;
    for (const ev of events) {
      const key = eventKey(ev);
      // Globe entity
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 0),
        billboard: {
          image: eventSVG(ev.severity),
          scale: 1.0,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: 0,
        },
        description: JSON.stringify({ type: 'event', ...ev }),
      });
      const labelEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 55000),
        billboard: {
          image: eventTextImage(String(ev.location || 'Event')),
          scale: 0.5,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 12_000_000.0),
          scaleByDistance: new Cesium.NearFarScalar(1_200_000, 1.0, 10_000_000, 0.7),
          translucencyByDistance: new Cesium.NearFarScalar(1_000_000, 1.0, 10_000_000, 0.35),
        },
        description: JSON.stringify({ type: 'event', ...ev }),
      });
      state.eventEntities.push({ entity, labelEntity, severity: ev.severity });

      // Sidebar card
      const card = document.createElement('div');
      card.className = 'event-card';
      const timeStr = formatEventTime(ev.seendate);
      const confClass = confidenceClass(ev.confidence);
      const confText = ev.confidence?.score != null ? `${ev.confidence.label || 'LOW'} ${ev.confidence.score}` : 'LOW 0';
      const stateLabel = String(ev.state || 'active').toUpperCase();
      const isPinned = Boolean(pinnedEventKey && key === pinnedEventKey);
      card.innerHTML = `
        <div class="event-header">
          <div class="event-dot sev-${ev.severity}"></div>
          <div class="event-location">${ev.location.toUpperCase()}</div>
          ${isPinned ? '<div class="event-pin-badge">PINNED</div>' : ''}
          <div class="event-confidence ${confClass}">${confText}</div>
        </div>
        <div class="event-title">${ev.title}</div>
        <div class="event-source">${[stateLabel, timeStr, ev.domain].filter(Boolean).join(' | ')}</div>`;
      card.setAttribute('data-event-key', key);
      if (isPinned) card.classList.add('pinned');
      card.addEventListener('click', () => {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 2_500_000),
          duration: 2,
        });
        openEventDetail(ev, card);
      });
      if (eventSelectedKey && eventSelectedKey === key) card.classList.add('active');
      eventsListEl.appendChild(card);
      if (!detailRestored && eventSelectedKey && eventSelectedKey === key) {
        openEventDetail(ev, card);
        detailRestored = true;
      }
      if (!detailRestored && pinnedEventKey && pinnedEventKey === key) {
        openEventDetail(ev, card);
        detailRestored = true;
      }
    }

    if ((eventSelectedKey || pinnedEventKey) && !detailRestored) closeEventDetail();

    if (shouldAlert) processEventAlerts(events);
    eventsUpdateEl.textContent = `Updated ${new Date().toLocaleTimeString()} | ${events.length} shown`;
    viewer.scene.requestRender();
  } catch (err) {
    console.error('Geopolitical events error:', err.message);
    setEventsFreshness({ cached: true });
    renderEventsEmpty('Events unavailable right now.', 'Data source timeout or upstream error.');
  }
}

function applyEventFilters() {
  renderEventsLoading();
  if (!pinnedEventKey) closeEventDetail();
  fetchGeopolitical({ alerts: false });
}

eventsTimelineButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    eventsTimelineButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    eventView.timeline = btn.dataset.timeline || '24';
    applyEventFilters();
  });
});

if (eventsStatusFilterEl) {
  eventsStatusFilterEl.addEventListener('change', () => {
    eventView.status = eventsStatusFilterEl.value || 'all';
    applyEventFilters();
  });
}

if (eventsSeverityFilterEl) {
  eventsSeverityFilterEl.addEventListener('change', () => {
    eventView.severity = eventsSeverityFilterEl.value || '1';
    applyEventFilters();
  });
}

if (eventsTypeFilterEl) {
  eventsTypeFilterEl.addEventListener('change', () => {
    eventView.type = eventsTypeFilterEl.value || 'all';
    applyEventFilters();
  });
}

if (eventsAlertsEnabledEl) {
  eventsAlertsEnabledEl.checked = eventAlerts.enabled;
  eventsAlertsEnabledEl.addEventListener('change', async () => {
    eventAlerts.enabled = eventsAlertsEnabledEl.checked;
    localStorage.setItem('worldview.alerts.enabled', eventAlerts.enabled ? '1' : '0');
    if (!eventAlerts.enabled) return;
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (_) {}
    }
  });
}

if (eventsAlertSeverityEl) {
  eventsAlertSeverityEl.value = eventAlerts.severity;
  eventsAlertSeverityEl.addEventListener('change', () => {
    eventAlerts.severity = eventsAlertSeverityEl.value || '2';
    localStorage.setItem('worldview.alerts.severity', eventAlerts.severity);
  });
}

// Pulsing animation — update entity scales every 80ms
setInterval(() => {
  if (!state.eventEntities.length) return;
  const t = Date.now() / 1000;
  for (const { entity, severity } of state.eventEntities) {
    const speed = severity === 3 ? 2.4 : severity === 2 ? 1.7 : 1.1;
    entity.billboard.scale = 0.75 + 0.55 * Math.abs(Math.sin(t * speed * Math.PI));
  }
  viewer.scene.requestRender();
}, 80);

// ── Hover Tooltip ─────────────────────────────────────────────────────────────
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

handler.setInputAction(movement => {
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
  tooltip.style.left = (movement.endPosition.x + 16) + 'px';
  tooltip.style.top  = (movement.endPosition.y + 16) + 'px';

  if (d.type === 'flight') {
    tooltipTitle.textContent = `FLIGHT ${d.callsign || d.icao}`;
    tooltipBody.textContent  = `ICAO:     ${d.icao}\nReg:      ${d.reg || '?'}\nType:     ${d.aircraft || '?'}\nAlt:      ${Math.round(d.alt)} m\nSpeed:    ${d.speed} kts\nHeading:  ${d.hdg || '?'} deg`;
  } else if (d.type === 'iss') {
    tooltipTitle.textContent = 'ISS';
    tooltipBody.textContent  = `Lat:  ${d.lat}\nLon:  ${d.lon}\nAlt:  ${d.alt}\nVel:  ${d.vel}`;
  } else if (d.type === 'satellite') {
    tooltipTitle.textContent = `SAT ${d.name}`;
    tooltipBody.textContent  = `Lat:  ${d.lat} deg\nLon:  ${d.lon} deg\nAlt:  ${d.alt}`;
  } else if (d.type === 'city') {
    tooltipTitle.textContent = `CITY ${d.name}`;
    tooltipBody.textContent  = `${d.country} | ${d.lat.toFixed(2)} deg, ${d.lon.toFixed(2)} deg\nClick to view CCTV`;
  } else if (d.type === 'camera') {
    tooltipTitle.textContent = `CAMERA ${d.name}`;
    tooltipBody.textContent  = 'Live camera | click to view';
  } else if (d.type === 'gps-jam') {
    const sevLabel = d.severity === 3 ? 'HIGH' : d.severity === 2 ? 'MEDIUM' : 'LOW';
    tooltipTitle.textContent = `GPS BLOCKING ${d.region}`;
    tooltipBody.textContent = `Severity: ${sevLabel}\n${d.note || 'GNSS/GPS interference'}${d.updatedAt ? `\nUpdated: ${new Date(d.updatedAt).toLocaleString()}` : ''}`;
  } else if (d.type === 'event') {
    const sevLabel = d.severity === 3 ? 'CRITICAL' : d.severity === 2 ? 'HIGH' : 'MODERATE';
    tooltipTitle.textContent = `EVENT ${d.location}`;
    tooltipBody.textContent  = `[${sevLabel}] ${d.eventType || 'Event'}\nState: ${(d.state || 'active').toUpperCase()}\n${d.title}${d.confidence?.score != null ? `\nConfidence: ${d.confidence.score}/100` : ''}`;
  } else if (d.type === 'country') {
    tooltipTitle.textContent = `COUNTRY ${d.name}`;
    tooltipBody.textContent = 'Country label';
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// ── Click handler — cities, camera dots, geopolitical events ──────────────────
handler.setInputAction(click => {
  const picked = viewer.scene.pick(click.position);
  if (!Cesium.defined(picked) || picked.id == null) return;

  let d;
  try {
    d = picked.id.description
      ? JSON.parse(picked.id.description.getValue())
      : picked.id;
  } catch (_) { return; }

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

// ── Layer Toggles ─────────────────────────────────────────────────────────────
document.getElementById('toggle-flights').addEventListener('change', e => {
  state.flightsVisible = e.target.checked;
  flightCollection.show = state.flightsVisible;
});

document.getElementById('toggle-iss').addEventListener('change', e => {
  state.issVisible = e.target.checked;
  if (state.issEntity) state.issEntity.show = state.issVisible;
});

document.getElementById('toggle-satellites').addEventListener('change', e => {
  state.satellitesVisible = e.target.checked;
  satCollection.show = state.satellitesVisible;
});

document.getElementById('toggle-borders').addEventListener('change', e => {
  state.bordersVisible = e.target.checked;
  if (state.bordersSource) state.bordersSource.show = state.bordersVisible;
  if (state.usStatesSource) state.usStatesSource.show = state.bordersVisible;
  updateCountryLabelVisibility();
});

document.getElementById('toggle-cities').addEventListener('change', e => {
  state.citiesVisible = e.target.checked;
  state.cityEntities.forEach(ent => { ent.show = state.citiesVisible; });
});

document.getElementById('toggle-gps-jamming').addEventListener('change', e => {
  state.gpsJammingVisible = e.target.checked;
  state.gpsJammingEntities.forEach(ent => { ent.show = state.gpsJammingVisible; });
});

// ── Focus Regions ─────────────────────────────────────────────────────────────
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

// ── View Mode ─────────────────────────────────────────────────────────────────
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

// ── Refresh Button ────────────────────────────────────────────────────────────
document.getElementById('refresh-btn').addEventListener('click', loadAllData);

// ── Load All Data ─────────────────────────────────────────────────────────────
async function loadAllData() {
  await Promise.all([fetchFlights(), fetchISS(), fetchSatellites(), fetchGpsJamming()]);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
setStatus('Connecting to data sources...');
loadCountryBorders();
loadUSStateBorders();
loadCities();
loadAllData();
renderEventsLoading();
fetchGeopolitical({ alerts: false });

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
  pollTimers.push(setInterval(fetchISS, cadence.iss));
  pollTimers.push(setInterval(updateSatellitePositions, cadence.satPos));
  pollTimers.push(setInterval(fetchFlights, cadence.flights));
  pollTimers.push(setInterval(fetchSatellites, cadence.satellites));
  pollTimers.push(setInterval(fetchGpsJamming, cadence.gps));
  pollTimers.push(setInterval(() => fetchGeopolitical({ alerts: true }), cadence.events));
}

document.addEventListener('visibilitychange', () => {
  startPollTimers();
  if (!document.hidden) {
    fetchISS();
    fetchFlights();
    fetchGpsJamming();
    fetchGeopolitical({ alerts: false });
  }
});

startPollTimers();






