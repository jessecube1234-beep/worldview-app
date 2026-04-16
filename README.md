# WorldView App

A browser-based geospatial intelligence demo with a Cesium globe, live aircraft tracking, ISS telemetry, satellites, CCTV feeds, GPS interference overlays, and geopolitical event clustering.

## Features
- Interactive 3D globe (Cesium.js)
- Live flight tracking
- Real-time ISS HUD (altitude and speed)
- Satellite positions from TLE data
- CCTV camera overlays and modal viewer
- Geopolitical event timeline (`24H`, `7D`, `30D`, `ONGOING`)

## Requirements
- Node.js 18 or higher

## Quick Start
1. Install dependencies:
```bash
npm install
```
2. Create `.env`:
```bash
cp .env.example .env
```
3. Start the app:
```bash
npm start
```
4. Open:
`http://localhost:4000`

## Environment Variables
- `WINDY_WEBCAMS_KEY` (required for Windy CCTV endpoints)
- `CESIUM_ION_TOKEN` (required for Cesium world terrain/imagery)
- `GPS_JAM_URL` (optional)
- `GPS_JAM_URL_TEMPLATE` (optional)
- `DEMO_MODE=true` (optional strict mode; requires `WINDY_WEBCAMS_KEY` at startup)

## Project Structure
```text
worldview-app/
  server/
    index.js
    config.js
    cache/
      tle-cache.json
    controllers/
      cameraController.js
      flightController.js
    data/
      staticCameras.js
    middleware/
      errorHandler.js
      requestLogger.js
    routes/
      cameras.js
      flights.js
      geo.js
      geopolitical.js
      satellites.js
    services/
      cameraHandlers.js
      flightTracker.js
    utils/
      env.js
  logs/
    *.log
  src/
    App.jsx
    main.jsx
    router.jsx
    auth/
    pages/
      AboutPage.jsx
      DashboardPage.jsx
    worldview/
      components/
      config/
      features/
      hooks/
      shared/
      WorldViewDashboard.jsx
  tests/
  index.html
  vite.config.mjs
```

## Notes
- Frontend runtime now lives in `src/` and is built with Vite.
- `npm run dev` runs Vite (`5173`) and the API server (`PORT`, default `4000`) together.
- Production server serves built frontend from `dist/`.

## Scripts
- `npm start` - run server (serves `dist` when built)
- `npm run dev` - run server + Vite dev client
- `npm run build` - build frontend bundle to `dist`
- `npm run test` - run Node test suite
- `npm run lint` - run ESLint

## License
MIT
