import { createGeopoliticalHandler } from '../controllers/geopoliticalController.js';

function registerGeopoliticalRoutes(app, deps) {
  app.get('/api/geopolitical', createGeopoliticalHandler(deps));
}

export { registerGeopoliticalRoutes };
