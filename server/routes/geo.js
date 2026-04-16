import { createGeoControllers } from '../controllers/geoController.js';

function registerGeoRoutes(app, deps) {
  const controllers = createGeoControllers(deps);
  app.get('/api/iss', controllers.iss);
  app.get('/api/gps-jamming', controllers.gpsJamming);
  app.get('/api/countries', controllers.countries);
  app.get('/api/us-states', controllers.usStates);
}

export { registerGeoRoutes };
