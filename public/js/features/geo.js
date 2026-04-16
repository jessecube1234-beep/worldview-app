(function initWorldViewGeoModule(global) {
  const US_STATE_CITIES = [
    { name: 'Birmingham', lat: 33.5186, lon: -86.8104, country: 'US', cam: 'us-birmingham' },
    { name: 'Anchorage', lat: 61.2181, lon: -149.9003, country: 'US', cam: 'us-anchorage' },
    { name: 'Phoenix', lat: 33.4484, lon: -112.0740, country: 'US', cam: 'us-phoenix' },
    { name: 'Little Rock', lat: 34.7465, lon: -92.2896, country: 'US', cam: 'us-littlerock' },
    { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, country: 'US', cam: 'la' },
    { name: 'Denver', lat: 39.7392, lon: -104.9903, country: 'US', cam: 'us-denver' },
    { name: 'Hartford', lat: 41.7658, lon: -72.6734, country: 'US', cam: 'us-hartford' },
    { name: 'Wilmington', lat: 39.7447, lon: -75.5484, country: 'US', cam: 'us-wilmington' },
    { name: 'Miami', lat: 25.7617, lon: -80.1918, country: 'US', cam: 'miami' },
    { name: 'Atlanta', lat: 33.7490, lon: -84.3880, country: 'US', cam: 'us-atlanta' },
    { name: 'Honolulu', lat: 21.3069, lon: -157.8583, country: 'US', cam: 'us-honolulu' },
    { name: 'Boise', lat: 43.6150, lon: -116.2023, country: 'US', cam: 'us-boise' },
    { name: 'Chicago', lat: 41.8781, lon: -87.6298, country: 'US', cam: 'chicago' },
    { name: 'Indianapolis', lat: 39.7684, lon: -86.1581, country: 'US', cam: 'us-indianapolis' },
    { name: 'Des Moines', lat: 41.5868, lon: -93.6250, country: 'US', cam: 'us-desmoines' },
    { name: 'Wichita', lat: 37.6872, lon: -97.3301, country: 'US', cam: 'us-wichita' },
    { name: 'Louisville', lat: 38.2527, lon: -85.7585, country: 'US', cam: 'us-louisville' },
    { name: 'New Orleans', lat: 29.9511, lon: -90.0715, country: 'US', cam: 'us-neworleans' },
    { name: 'Portland ME', lat: 43.6591, lon: -70.2568, country: 'US', cam: 'us-portland-me' },
    { name: 'Baltimore', lat: 39.2904, lon: -76.6122, country: 'US', cam: 'us-baltimore' },
    { name: 'Boston', lat: 42.3601, lon: -71.0589, country: 'US', cam: 'us-boston' },
    { name: 'Detroit', lat: 42.3314, lon: -83.0458, country: 'US', cam: 'us-detroit' },
    { name: 'Minneapolis', lat: 44.9778, lon: -93.2650, country: 'US', cam: 'us-minneapolis' },
    { name: 'Jackson', lat: 32.2988, lon: -90.1848, country: 'US', cam: 'us-jackson-ms' },
    { name: 'St. Louis', lat: 38.6270, lon: -90.1994, country: 'US', cam: 'us-stlouis' },
    { name: 'Billings', lat: 45.7833, lon: -108.5007, country: 'US', cam: 'us-billings' },
    { name: 'Omaha', lat: 41.2565, lon: -95.9345, country: 'US', cam: 'us-omaha' },
    { name: 'Las Vegas', lat: 36.1699, lon: -115.1398, country: 'US', cam: 'us-lasvegas' },
    { name: 'Manchester NH', lat: 42.9956, lon: -71.4548, country: 'US', cam: 'us-manchester-nh' },
    { name: 'Newark', lat: 40.7357, lon: -74.1724, country: 'US', cam: 'us-newark' },
    { name: 'Albuquerque', lat: 35.0844, lon: -106.6504, country: 'US', cam: 'us-albuquerque' },
    { name: 'New York', lat: 40.7128, lon: -74.0060, country: 'US', cam: 'nyc' },
    { name: 'Charlotte', lat: 35.2271, lon: -80.8431, country: 'US', cam: 'us-charlotte' },
    { name: 'Fargo', lat: 46.8772, lon: -96.7898, country: 'US', cam: 'us-fargo' },
    { name: 'Columbus', lat: 39.9612, lon: -82.9988, country: 'US', cam: 'us-columbus' },
    { name: 'Oklahoma City', lat: 35.4676, lon: -97.5164, country: 'US', cam: 'us-oklahomacity' },
    { name: 'Portland OR', lat: 45.5152, lon: -122.6784, country: 'US', cam: 'us-portland-or' },
    { name: 'Philadelphia', lat: 39.9526, lon: -75.1652, country: 'US', cam: 'us-philadelphia' },
    { name: 'Providence', lat: 41.8240, lon: -71.4128, country: 'US', cam: 'us-providence' },
    { name: 'Charleston SC', lat: 32.7765, lon: -79.9311, country: 'US', cam: 'us-charleston-sc' },
    { name: 'Sioux Falls', lat: 43.5446, lon: -96.7311, country: 'US', cam: 'us-siouxfalls' },
    { name: 'Nashville', lat: 36.1627, lon: -86.7816, country: 'US', cam: 'us-nashville' },
    { name: 'Houston', lat: 29.7604, lon: -95.3698, country: 'US', cam: 'us-houston' },
    { name: 'Salt Lake City', lat: 40.7608, lon: -111.8910, country: 'US', cam: 'us-saltlakecity' },
    { name: 'Burlington VT', lat: 44.4759, lon: -73.2121, country: 'US', cam: 'us-burlington-vt' },
    { name: 'Richmond', lat: 37.5407, lon: -77.4360, country: 'US', cam: 'us-richmond' },
    { name: 'Seattle', lat: 47.6062, lon: -122.3321, country: 'US', cam: 'us-seattle' },
    { name: 'Charleston WV', lat: 38.3498, lon: -81.6326, country: 'US', cam: 'us-charleston-wv' },
    { name: 'Milwaukee', lat: 43.0389, lon: -87.9065, country: 'US', cam: 'us-milwaukee' },
    { name: 'Cheyenne', lat: 41.1400, lon: -104.8202, country: 'US', cam: 'us-cheyenne' },
    { name: 'Washington DC', lat: 38.9072, lon: -77.0369, country: 'US', cam: 'dc' },
  ];

  const CITIES = [
    ...US_STATE_CITIES,
    { name: 'Toronto', lat: 43.6532, lon: -79.3832, country: 'CA', cam: 'toronto' },
    { name: 'Vancouver', lat: 49.2827, lon: -123.1207, country: 'CA', cam: 'vancouver' },
    { name: 'Mexico City', lat: 19.4326, lon: -99.1332, country: 'MX', cam: 'mexico' },
    { name: 'Sao Paulo', lat: -23.5505, lon: -46.6333, country: 'BR', cam: 'saopaulo' },
    { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816, country: 'AR', cam: 'buenosaires' },
    { name: 'Bogota', lat: 4.7110, lon: -74.0721, country: 'CO', cam: 'bogota' },
    { name: 'Lima', lat: -12.0464, lon: -77.0428, country: 'PE', cam: 'lima' },
    { name: 'Santiago', lat: -33.4489, lon: -70.6693, country: 'CL', cam: 'santiago' },
    { name: 'London', lat: 51.5074, lon: -0.1278, country: 'GB', cam: 'london' },
    { name: 'Paris', lat: 48.8566, lon: 2.3522, country: 'FR', cam: 'paris' },
    { name: 'Berlin', lat: 52.5200, lon: 13.4050, country: 'DE', cam: 'berlin' },
    { name: 'Madrid', lat: 40.4168, lon: -3.7038, country: 'ES', cam: 'madrid' },
    { name: 'Rome', lat: 41.9028, lon: 12.4964, country: 'IT', cam: 'rome' },
    { name: 'Amsterdam', lat: 52.3676, lon: 4.9041, country: 'NL', cam: 'amsterdam' },
    { name: 'Brussels', lat: 50.8503, lon: 4.3517, country: 'BE', cam: 'brussels' },
    { name: 'Vienna', lat: 48.2082, lon: 16.3738, country: 'AT', cam: 'vienna' },
    { name: 'Warsaw', lat: 52.2297, lon: 21.0122, country: 'PL', cam: 'warsaw' },
    { name: 'Kyiv', lat: 50.4501, lon: 30.5234, country: 'UA', cam: 'kyiv' },
    { name: 'Moscow', lat: 55.7558, lon: 37.6176, country: 'RU', cam: 'moscow' },
    { name: 'Stockholm', lat: 59.3293, lon: 18.0686, country: 'SE', cam: 'stockholm' },
    { name: 'Lisbon', lat: 38.7223, lon: -9.1393, country: 'PT', cam: 'lisbon' },
    { name: 'Athens', lat: 37.9838, lon: 23.7275, country: 'GR', cam: 'athens' },
    { name: 'Istanbul', lat: 41.0082, lon: 28.9784, country: 'TR', cam: 'istanbul' },
    { name: 'Dubai', lat: 25.2048, lon: 55.2708, country: 'AE', cam: 'dubai' },
    { name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773, country: 'AE', cam: 'abudhabi' },
    { name: 'Riyadh', lat: 24.7136, lon: 46.6753, country: 'SA', cam: 'riyadh' },
    { name: 'Baghdad', lat: 33.3152, lon: 44.3661, country: 'IQ', cam: 'baghdad' },
    { name: 'Tehran', lat: 35.6892, lon: 51.3890, country: 'IR', cam: 'tehran' },
    { name: 'Doha', lat: 25.2854, lon: 51.5310, country: 'QA', cam: 'doha' },
    { name: 'Kuwait City', lat: 29.3759, lon: 47.9774, country: 'KW', cam: 'kuwait' },
    { name: 'Muscat', lat: 23.5859, lon: 58.4059, country: 'OM', cam: 'muscat' },
    { name: 'Beirut', lat: 33.8938, lon: 35.5018, country: 'LB', cam: 'beirut' },
    { name: 'Amman', lat: 31.9454, lon: 35.9284, country: 'JO', cam: 'amman' },
    { name: 'Tel Aviv', lat: 32.0853, lon: 34.7818, country: 'IL', cam: 'telaviv' },
    { name: 'Cairo', lat: 30.0444, lon: 31.2357, country: 'EG', cam: 'cairo' },
    { name: 'Lagos', lat: 6.5244, lon: 3.3792, country: 'NG', cam: 'lagos' },
    { name: 'Nairobi', lat: -1.2921, lon: 36.8219, country: 'KE', cam: 'nairobi' },
    { name: 'Johannesburg', lat: -26.2041, lon: 28.0473, country: 'ZA', cam: 'joburg' },
    { name: 'Addis Ababa', lat: 9.0320, lon: 38.7469, country: 'ET', cam: 'addis' },
    { name: 'Casablanca', lat: 33.5731, lon: -7.5898, country: 'MA', cam: 'casablanca' },
    { name: 'Khartoum', lat: 15.5007, lon: 32.5599, country: 'SD', cam: 'khartoum' },
    { name: 'Kinshasa', lat: -4.4419, lon: 15.2663, country: 'CD', cam: 'kinshasa' },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503, country: 'JP', cam: 'tokyo' },
    { name: 'Beijing', lat: 39.9042, lon: 116.4074, country: 'CN', cam: 'beijing' },
    { name: 'Shanghai', lat: 31.2304, lon: 121.4737, country: 'CN', cam: 'shanghai' },
    { name: 'Seoul', lat: 37.5665, lon: 126.9780, country: 'KR', cam: 'seoul' },
    { name: 'Hong Kong', lat: 22.3193, lon: 114.1694, country: 'HK', cam: 'hongkong' },
    { name: 'Singapore', lat: 1.3521, lon: 103.8198, country: 'SG', cam: 'singapore' },
    { name: 'Bangkok', lat: 13.7563, lon: 100.5018, country: 'TH', cam: 'bangkok' },
    { name: 'Jakarta', lat: -6.2088, lon: 106.8456, country: 'ID', cam: 'jakarta' },
    { name: 'Kuala Lumpur', lat: 3.1390, lon: 101.6869, country: 'MY', cam: 'kl' },
    { name: 'Manila', lat: 14.5995, lon: 120.9842, country: 'PH', cam: 'manila' },
    { name: 'Ho Chi Minh', lat: 10.8231, lon: 106.6297, country: 'VN', cam: 'hcmc' },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093, country: 'AU', cam: 'sydney' },
    { name: 'Melbourne', lat: -37.8136, lon: 144.9631, country: 'AU', cam: 'melbourne' },
    { name: 'Delhi', lat: 28.7041, lon: 77.1025, country: 'IN', cam: 'delhi' },
    { name: 'Mumbai', lat: 19.0760, lon: 72.8777, country: 'IN', cam: 'mumbai' },
    { name: 'Karachi', lat: 24.8607, lon: 67.0011, country: 'PK', cam: 'karachi' },
    { name: 'Dhaka', lat: 23.8103, lon: 90.4125, country: 'BD', cam: 'dhaka' },
    { name: 'Colombo', lat: 6.9271, lon: 79.8612, country: 'LK', cam: 'colombo' },
  ];

  const citySvg = (() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#ffe066" stroke-width="1.5" opacity="0.9"/><circle cx="7" cy="7" r="2.5" fill="#ffe066" opacity="0.95"/></svg>';
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  })();

  function initWorldViewGeo(deps) {
    const {
      viewer,
      state,
      countryTextImage,
      cityTextImage,
    } = deps;

    const labelRules = global.WorldViewLabelRules || {};
    const normalizeLonDelta = labelRules.normalizeLonDelta || ((deg) => deg);
    const lonInRectangle = labelRules.lonInRectangle || (() => true);
    const getCountryLabelOffset = labelRules.getCountryLabelOffset || (() => ({ lon: 0, lat: 0 }));
    const countryLabelRuleByHeight = labelRules.countryLabelRuleByHeight || (() => ({ max: 999, minSepDeg: 0 }));

    let countryLabelUpdatePending = false;
    let countryLabelLastUpdateMs = 0;

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
      updateCountryLabelVisibility();
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

  global.initWorldViewGeo = initWorldViewGeo;
})(window);
