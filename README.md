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
  server.js
  server/
    config.js
    middleware/
      errorHandler.js
      requestLogger.js
    routes/
      geopolitical.js
    utils/
      env.js
  public/
    index.html
    style.css
    app.js
```

## Scripts
- `npm start` - run server
- `npm run dev` - run with nodemon

## License
MIT
