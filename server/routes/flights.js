const { createFlightsHandler } = require('../controllers/flightController');

function registerFlightRoutes(app, deps) {
  app.get('/api/flights', createFlightsHandler(deps));
}

module.exports = { registerFlightRoutes };
