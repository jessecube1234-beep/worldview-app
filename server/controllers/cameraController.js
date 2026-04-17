import { STATIC_CAMERAS } from '../data/staticCameras.js';
import {
  createSingaporeHandler,
  createWindyHandler,
  createLondonHandler,
  createCamProxyHandler,
} from '../services/cameraHandlers.js';

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

export { createCameraControllers };
