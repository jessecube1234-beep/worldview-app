import * as labelRules from '../shared/labelRules.js';
import { getCesium } from '../shared/runtimeGlobals.js';
import { fetchCountriesGeoJson, loadUSStatesDataSource } from './geo/api/geoApi.js';
import { CITIES, citySvg } from './geo/state/cities.js';
import { createCountryLabelVisibilityController } from './geo/dom/countryLabelVisibility.js';

export function initWorldViewGeo(deps) {
  const Cesium = getCesium();
  const {
    viewer,
    state,
    countryTextImage,
    cityTextImage,
  } = deps;

  const normalizeLonDelta = labelRules.normalizeLonDelta || ((deg) => deg);
  const lonInRectangle = labelRules.lonInRectangle || (() => true);
  const getCountryLabelOffset = labelRules.getCountryLabelOffset || (() => ({ lon: 0, lat: 0 }));
  const countryLabelRuleByHeight = labelRules.countryLabelRuleByHeight || (() => ({ max: 999, minSepDeg: 0 }));

  const visibilityController = createCountryLabelVisibilityController({
    Cesium,
    viewer,
    state,
    countryLabelRuleByHeight,
    normalizeLonDelta,
    lonInRectangle,
  });

  async function loadCountryBorders() {
    try {
      const countriesGeoJson = await fetchCountriesGeoJson();

      const dataSource = await Cesium.GeoJsonDataSource.load(countriesGeoJson, {
        stroke: Cesium.Color.fromCssColorString('#00ff9d').withAlpha(0.35),
        fill: Cesium.Color.TRANSPARENT,
        strokeWidth: 1,
      });

      for (const entity of dataSource.entities.values) {
        if (entity.polygon) {
          entity.polygon.fill = false;
          entity.polygon.outline = true;
          entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#00ff9d').withAlpha(0.35);
          entity.polygon.outlineWidth = 1;
        }
      }

      dataSource.name = 'countries';
      dataSource.show = state.bordersVisible;
      await viewer.dataSources.add(dataSource);
      state.bordersSource = dataSource;

      state.countryLabelEntities.forEach((entity) => viewer.entities.remove(entity));
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

      visibilityController.attachCameraListeners();
      visibilityController.scheduleCountryLabelVisibilityUpdate(true);
      viewer.scene.requestRender();
    } catch (err) {
      console.error('Country borders error:', err.message);
    }
  }

  async function loadUSStateBorders() {
    try {
      const dataSource = await loadUSStatesDataSource(Cesium);

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
    } catch (err) {
      console.error('US state borders error:', err.message);
    }
  }

  function loadCities() {
    state.cityEntities.forEach((entity) => viewer.entities.remove(entity));
    state.cityEntities = [];

    for (const city of CITIES) {
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 0),
        billboard: {
          image: citySvg,
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

  function setBordersVisible(visible) {
    state.bordersVisible = Boolean(visible);
    if (state.bordersSource) state.bordersSource.show = state.bordersVisible;
    if (state.usStatesSource) state.usStatesSource.show = state.bordersVisible;
    visibilityController.updateCountryLabelVisibility();
  }

  function setCitiesVisible(visible) {
    state.citiesVisible = Boolean(visible);
    state.cityEntities.forEach((entity) => { entity.show = state.citiesVisible; });
    viewer.scene.requestRender();
  }

  return {
    loadCountryBorders,
    loadUSStateBorders,
    loadCities,
    setBordersVisible,
    setCitiesVisible,
  };
}
