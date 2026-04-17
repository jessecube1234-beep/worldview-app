import { createSatelliteControllers } from '../controllers/satelliteController.js';

function registerSatelliteRoutes(app, deps) {
  const controllers = createSatelliteControllers(deps);
  app.get('/api/satellites', controllers.satellites);
  app.get('/api/satellites/debug', controllers.satellitesDebug);
}

export { registerSatelliteRoutes };
