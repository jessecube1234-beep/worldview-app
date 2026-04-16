import { createFlightsHandler } from '../controllers/flightController.js';

function registerFlightRoutes(app, deps) {
  app.get('/api/flights', createFlightsHandler(deps));
}

export { registerFlightRoutes };
