# WorldView App

A simplified browser-based geospatial intelligence app inspired by Bilawal Sidhu's WorldView project.

## Features
- 🌍 Interactive 3D globe (Cesium.js)
- ✈️ Live flight tracking over the US (OpenSky Network)
- 🛰 Real-time ISS position + altitude/speed HUD
- 🌙 View modes: Standard, Night, Terrain
- Layer toggles for flights and ISS
- Hover tooltips on flights and ISS

## Getting Started

### 1. Install dependencies
```bash
cd worldview-app
npm install
```

### 2. Start the server
```bash
npm start
```
Or for auto-reload during dev:
```bash
npm run dev
```

### 3. Open the app
Go to: [http://localhost:3000](http://localhost:3000)

## Free APIs Used (no keys required)
| API | Data |
|---|---|
| [OpenSky Network](https://opensky-network.org/) | Live flight positions |
| [WhereTheISS](https://wheretheiss.at/) | Real-time ISS position |
| [CelesTrak](https://celestrak.org/) | Satellite orbital data |

## Optional: Get your own Cesium Ion token
The app ships with a public demo token. For production use, get a free token at [ion.cesium.com](https://ion.cesium.com) and replace it at the top of `public/app.js`.

## Project Structure
```
worldview-app/
├── server.js        ← Express backend (API proxy)
├── package.json
└── public/
    ├── index.html   ← App shell + HUD layout
    ├── style.css    ← Dark tactical UI styles
    └── app.js       ← Cesium globe + data logic
```

## Built With AI Assistance
This project was built with the help of [OpenAI Codex](https://openai.com/codex) and [Claude](https://claude.ai) (by Anthropic).

## Next Steps / Ideas
- Add satellite orbit path visualization using satellite.js TLE data
- Add visual shader filters (night vision green, thermal)
- Add CCTV camera feeds from open city cameras
- Add a timeline scrubber to replay historical flight data
- Add GPS jamming detection overlay
