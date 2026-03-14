# WorldView App

A simplified browser-based geospatial intelligence app inspired by Bilawal Sidhu's WorldView project.

## Features
- 🌍 Interactive 3D globe (Cesium.js)
- ✈️ Live flight tracking over the US (OpenSky Network)
- 🛰 Real-time ISS position + altitude/speed HUD
- 🌙 View modes: Standard, Night, Terrain
- Layer toggles for flights and ISS
- Hover tooltips on flights and ISS
- Live CCTV webcam feeds via Windy

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/worldview-app.git
cd worldview-app
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure your API keys
Create a `.env` file in the project root:
```bash
cp .env.example .env
```
Then open `.env` and fill in your keys (see **API Keys** section below).

### 4. Start the server
```bash
npm start
```
Or for auto-reload during development:
```bash
npm run dev
```

### 5. Open the app
Go to: [http://localhost:4000](http://localhost:4000)

---

## API Keys

### Windy Webcams (required for CCTV camera feeds)
1. Sign up at [windy.com](https://www.windy.com) and go to your account settings
2. Navigate to **API** and generate a Webcams API key
3. Add it to your `.env`:
```
WINDY_WEBCAMS_KEY=your_key_here
```
Without this key the server will still run — the CCTV panel will just show a 503 error.

### Cesium Ion (optional, for high-res terrain/imagery)
The app ships with a public demo token. For production or personal use:
1. Get a free token at [ion.cesium.com](https://ion.cesium.com)
2. Replace the token at the top of `public/app.js`

### Other APIs (no keys needed)
| API | Data |
|---|---|
| [OpenSky Network](https://opensky-network.org/) | Live flight positions |
| [WhereTheISS](https://wheretheiss.at/) | Real-time ISS position |
| [CelesTrak](https://celestrak.org/) | Satellite orbital data |

---

## Project Structure
```
worldview-app/
├── server.js        ← Express backend (API proxy)
├── package.json
├── .env             ← Your local secrets (never committed)
├── .env.example     ← Template showing required keys
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
- Add a timeline scrubber to replay historical flight data
- Add GPS jamming detection overlay

## License
MIT © Jesse
