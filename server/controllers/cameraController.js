const { STATIC_CAMERAS } = require('../data/staticCameras');
const {
  createSingaporeHandler,
  createWindyHandler,
  createLondonHandler,
  createCamProxyHandler,
} = require('../services/cameraHandlers');

function createStaticCityCamerasHandler() {
  return function staticCityCamerasHandler(req, res) {
    const cams = STATIC_CAMERAS[req.params.city];
    if (!cams) return res.json([]);
    return res.json(cams);
  };
}

function createCameraControllers(deps) {
  return {
    singapore: createSingaporeHandler(deps),
    staticCity: createStaticCityCamerasHandler(),
    windy: createWindyHandler(deps),
    london: createLondonHandler(deps),
    proxy: createCamProxyHandler(deps),
  };
}

module.exports = { createCameraControllers };
