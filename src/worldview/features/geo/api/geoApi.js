export async function fetchCountriesGeoJson() {
  const res = await fetch('/api/countries');
  if (!res.ok) throw new Error(`Countries ${res.status}`);
  return res.json();
}

export async function loadUSStatesDataSource(Cesium) {
  return Cesium.GeoJsonDataSource.load('/api/us-states', {
    stroke: Cesium.Color.fromCssColorString('#7fd6ff').withAlpha(0.45),
    fill: Cesium.Color.TRANSPARENT,
    strokeWidth: 1,
  });
}
