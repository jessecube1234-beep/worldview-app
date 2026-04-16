export function getCesium() {
  const Cesium = window.Cesium;
  if (!Cesium) {
    throw new Error('Cesium is not loaded. Ensure Cesium CDN script is included in index.html.');
  }
  return Cesium;
}

export function getSatellite() {
  const satellite = window.satellite;
  if (!satellite) {
    throw new Error('satellite.js is not loaded. Ensure the CDN script is included in index.html.');
  }
  return satellite;
}
