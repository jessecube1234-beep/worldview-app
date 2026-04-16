const { createGeopoliticalHandler } = require('../controllers/geopoliticalController');

function registerGeopoliticalRoutes(app, deps) {
  app.get('/api/geopolitical', createGeopoliticalHandler(deps));
}

module.exports = { registerGeopoliticalRoutes };
