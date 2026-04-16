export function createCountryLabelVisibilityController({
  Cesium,
  viewer,
  state,
  countryLabelRuleByHeight,
  normalizeLonDelta,
  lonInRectangle,
}) {
  let countryLabelUpdatePending = false;
  let countryLabelLastUpdateMs = 0;

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

  function attachCameraListeners() {
    if (state.countryLabelCameraListenerAttached) return;
    viewer.camera.changed.addEventListener(() => scheduleCountryLabelVisibilityUpdate(false));
    viewer.camera.moveEnd.addEventListener(() => scheduleCountryLabelVisibilityUpdate(true));
    state.countryLabelCameraListenerAttached = true;
  }

  return {
    updateCountryLabelVisibility,
    scheduleCountryLabelVisibilityUpdate,
    attachCameraListeners,
  };
}
