const { createSatelliteControllers } = require('../controllers/satelliteController');

function registerSatelliteRoutes(app, deps) {
  const controllers = createSatelliteControllers(deps);
  app.get('/api/satellites', controllers.satellites);
  app.get('/api/satellites/debug', controllers.satellitesDebug);
}

module.exports = { registerSatelliteRoutes };
