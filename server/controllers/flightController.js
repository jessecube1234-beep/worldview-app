import { createFlightTracker } from '../services/flightTracker.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('flights');

function createFlightsHandler(deps) {
  const tracker = createFlightTracker(deps);

  return async function flightsHandler(_req, res) {
    try {
      const result = await tracker.getFlights(Date.now());
      if (result.stale) return res.json({ ac: result.ac, stale: true });
      return res.json({ ac: result.ac });
    } catch (err) {
      logger.error('Flight fetch error:', err.message);
      const status = err.message === 'Flight feeds unavailable' ? 503 : 500;
      return res.status(status).json({ error: err.message });
    }
  };
}

export { createFlightsHandler };
