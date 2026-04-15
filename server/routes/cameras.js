function registerCameraRoutes(app, deps) {
  const { fetch, fetchWithTimeout, HEADERS, WINDY_KEY, WINDY_BASE_URLS, WINDY_CACHE_TTL } = deps; const windyCache = new Map();
  let sgCache = null;
  let sgTime  = 0;
  
  app.get('/api/cameras/singapore', async (_req, res) => {
    const now = Date.now();
    if (sgCache && now - sgTime < 300_000) return res.json(sgCache);
  
    // Try new API endpoint first, fall back to old one
    const SG_URLS = [
      'https://api.data.gov.sg/v1/transport/traffic-images',
      'https://datamall2.mytransport.sg/ltaodataservice/Traffic-Imagesv2',
    ];
  
    for (const url of SG_URLS) {
      try {
        const r = await fetch(url, { headers: HEADERS, timeout: 10000 });
        console.log(`Singapore LTA ${url} ? ${r.status}`);
        if (!r.ok) continue;
        const data = await r.json();
        // Handle both response formats
        const rawCams = data.items?.[0]?.cameras || data.value || [];
        if (!rawCams.length) continue;
        const cameras = rawCams.map(c => ({
          name:     `CAM ${c.camera_id || c.CameraID}`,
          lat:      c.location?.latitude  ?? c.Latitude,
          lon:      c.location?.longitude ?? c.Longitude,
          imageUrl: c.image ?? c.ImageLink,
        })).filter(c => c.lat && c.lon && c.imageUrl);
        if (!cameras.length) continue;
        sgCache = cameras;
        sgTime  = now;
        console.log(`Singapore cameras cached: ${cameras.length} from ${url}`);
        return res.json(cameras);
      } catch (e) {
        console.error(`Singapore ${url}: ${e.message}`);
      }
    }
  
    if (sgCache) return res.json(sgCache);
    res.status(500).json({ error: 'Singapore camera API unavailable' });
  });

  const STATIC_CAMERAS = {
    // Americas
    nyc: [
      { name: 'Times Square',            lat: 40.7580, lon: -73.9855 },
      { name: 'Brooklyn Bridge',         lat: 40.7061, lon: -73.9969 },
      { name: 'Central Park South',      lat: 40.7644, lon: -73.9735 },
      { name: 'Grand Central Terminal',  lat: 40.7527, lon: -73.9772 },
      { name: 'World Trade Center',      lat: 40.7127, lon: -74.0134 },
      { name: 'Holland Tunnel',          lat: 40.7272, lon: -74.0096 },
      { name: 'Manhattan Bridge',        lat: 40.7075, lon: -73.9903 },
      { name: 'FDR Drive & 42nd St',     lat: 40.7531, lon: -73.9638 },
    ],
    la: [
      { name: 'Hollywood & Highland',    lat: 34.1017, lon: -118.3394 },
      { name: 'Santa Monica Pier',       lat: 34.0084, lon: -118.4982 },
      { name: 'I-405 & Wilshire',        lat: 34.0536, lon: -118.4565 },
      { name: 'Downtown — 5th & Grand',  lat: 34.0494, lon: -118.2566 },
      { name: 'LAX Airport Approach',    lat: 33.9444, lon: -118.4094 },
      { name: 'I-405 & I-10 Interchange',lat: 34.0318, lon: -118.4481 },
      { name: 'Sunset & Vine',           lat: 34.0979, lon: -118.3267 },
    ],
    chicago: [
      { name: 'Millennium Park',         lat: 41.8826, lon: -87.6226 },
      { name: 'Willis Tower',            lat: 41.8789, lon: -87.6359 },
      { name: 'Navy Pier',               lat: 41.8919, lon: -87.6051 },
      { name: 'Michigan Ave & Chicago',  lat: 41.8967, lon: -87.6241 },
      { name: 'Wacker & Lake St',        lat: 41.8863, lon: -87.6326 },
      { name: 'O\'Hare Airport I-190',   lat: 41.9779, lon: -87.8675 },
      { name: 'I-90/94 & Congress',      lat: 41.8756, lon: -87.6334 },
    ],
    miami: [
      { name: 'South Beach — Ocean Dr',  lat: 25.7826, lon: -80.1300 },
      { name: 'Downtown Brickell',       lat: 25.7617, lon: -80.1918 },
      { name: 'Port of Miami',           lat: 25.7743, lon: -80.1742 },
      { name: 'Miami Beach Causeway',    lat: 25.7907, lon: -80.1636 },
      { name: 'Wynwood Arts District',   lat: 25.8008, lon: -80.1989 },
      { name: 'I-95 & NW 36th St',       lat: 25.8111, lon: -80.2085 },
    ],
    dc: [
      { name: 'White House',             lat: 38.8977, lon: -77.0365 },
      { name: 'US Capitol',              lat: 38.8899, lon: -77.0091 },
      { name: 'National Mall',           lat: 38.8893, lon: -77.0353 },
      { name: 'Lincoln Memorial',        lat: 38.8893, lon: -77.0502 },
      { name: 'Dupont Circle',           lat: 38.9096, lon: -77.0437 },
      { name: 'Georgetown — M St NW',    lat: 38.9076, lon: -77.0723 },
      { name: 'Pentagon',                lat: 38.8719, lon: -77.0563 },
      { name: 'Reagan Airport',          lat: 38.8521, lon: -77.0402 },
    ],
    toronto: [
      { name: 'CN Tower',                lat: 43.6426, lon: -79.3871 },
      { name: 'Yonge & Dundas',          lat: 43.6561, lon: -79.3802 },
      { name: 'Gardiner Expressway',     lat: 43.6367, lon: -79.3945 },
      { name: 'Highway 401 & 400',       lat: 43.7484, lon: -79.5441 },
      { name: 'Distillery District',     lat: 43.6503, lon: -79.3596 },
    ],
    vancouver: [
      { name: 'Downtown — Granville St', lat: 49.2827, lon: -123.1207 },
      { name: 'Stanley Park',            lat: 49.3023, lon: -123.1452 },
      { name: 'Gastown',                 lat: 49.2838, lon: -123.1078 },
      { name: 'Lions Gate Bridge',       lat: 49.3130, lon: -123.1399 },
      { name: 'Vancouver Airport',       lat: 49.1967, lon: -123.1815 },
    ],
    mexico: [
      { name: 'Zócalo',                  lat: 19.4326, lon: -99.1332 },
      { name: 'Paseo de la Reforma',     lat: 19.4274, lon: -99.1677 },
      { name: 'Angel of Independence',   lat: 19.4269, lon: -99.1674 },
      { name: 'Chapultepec Park',        lat: 19.4200, lon: -99.1897 },
      { name: 'Insurgentes & Baja Cal.', lat: 19.4000, lon: -99.1731 },
      { name: 'NAICM Airport',           lat: 19.3607, lon: -99.0006 },
    ],
    saopaulo: [
      { name: 'Paulista Avenue',         lat: -23.5630, lon: -46.6543 },
      { name: 'Ibirapuera Park',         lat: -23.5874, lon: -46.6576 },
      { name: 'Downtown — Praça Sé',     lat: -23.5505, lon: -46.6333 },
      { name: 'Marginal Tietê',          lat: -23.5209, lon: -46.6267 },
      { name: 'Guarulhos Airport',       lat: -23.4356, lon: -46.4731 },
    ],
    buenosaires: [
      { name: 'Plaza de Mayo',           lat: -34.6083, lon: -58.3712 },
      { name: 'Obelisk — 9 de Julio',    lat: -34.6037, lon: -58.3816 },
      { name: 'La Boca — Caminito',      lat: -34.6345, lon: -58.3631 },
      { name: 'Palermo — Santa Fe',      lat: -34.5908, lon: -58.4098 },
      { name: 'Ezeiza Airport',          lat: -34.8222, lon: -58.5358 },
    ],
    bogota: [
      { name: 'Plaza Bolívar',           lat:  4.5981,  lon: -74.0760 },
      { name: 'Carrera 7 & 26',          lat:  4.6097,  lon: -74.0817 },
      { name: 'Zona Rosa',               lat:  4.6667,  lon: -74.0526 },
      { name: 'El Dorado Airport',       lat:  4.7016,  lon: -74.1469 },
    ],
    lima: [
      { name: 'Plaza Mayor',             lat: -12.0464, lon: -77.0285 },
      { name: 'Miraflores Malecón',      lat: -12.1219, lon: -77.0301 },
      { name: 'Javier Prado Ave',        lat: -12.0875, lon: -77.0508 },
      { name: 'Jorge Chávez Airport',    lat: -12.0219, lon: -77.1143 },
    ],
    santiago: [
      { name: 'Plaza de Armas',          lat: -33.4372, lon: -70.6506 },
      { name: 'Costanera Center',        lat: -33.4172, lon: -70.6064 },
      { name: 'Alameda Ave',             lat: -33.4489, lon: -70.6693 },
      { name: 'Arturo Merino Airport',   lat: -33.3930, lon: -70.7954 },
    ],
    // Europe
    paris: [
      { name: 'Eiffel Tower',            lat: 48.8584, lon:  2.2945 },
      { name: 'Champs-Élysées & Arc',    lat: 48.8738, lon:  2.2950 },
      { name: 'Notre-Dame',              lat: 48.8530, lon:  2.3499 },
      { name: 'Louvre Museum',           lat: 48.8606, lon:  2.3376 },
      { name: 'Place de la Bastille',    lat: 48.8533, lon:  2.3692 },
      { name: 'Gare du Nord',            lat: 48.8809, lon:  2.3553 },
      { name: 'Montmartre — Sacré-Cœur', lat: 48.8867, lon:  2.3431 },
    ],
    berlin: [
      { name: 'Brandenburg Gate',        lat: 52.5163, lon: 13.3777 },
      { name: 'Potsdamer Platz',         lat: 52.5096, lon: 13.3760 },
      { name: 'Alexanderplatz',          lat: 52.5219, lon: 13.4132 },
      { name: 'Checkpoint Charlie',      lat: 52.5075, lon: 13.3904 },
      { name: 'Kurfürstendamm',          lat: 52.5027, lon: 13.3317 },
      { name: 'Tegel Airport',           lat: 52.5597, lon: 13.2877 },
    ],
    madrid: [
      { name: 'Puerta del Sol',          lat: 40.4168, lon: -3.7038 },
      { name: 'Plaza Mayor',             lat: 40.4154, lon: -3.7074 },
      { name: 'Gran Vía',                lat: 40.4200, lon: -3.7025 },
      { name: 'Paseo del Prado',         lat: 40.4137, lon: -3.6923 },
      { name: 'Barajas Airport T4',      lat: 40.4947, lon: -3.5769 },
    ],
    rome: [
      { name: 'Colosseum',               lat: 41.8902, lon: 12.4922 },
      { name: 'Trevi Fountain',          lat: 41.9009, lon: 12.4833 },
      { name: 'Vatican St Peter\'s',     lat: 41.9022, lon: 12.4534 },
      { name: 'Piazza Navona',           lat: 41.8992, lon: 12.4730 },
      { name: 'Via del Corso',           lat: 41.9031, lon: 12.4797 },
      { name: 'Fiumicino Airport',       lat: 41.8003, lon: 12.2389 },
    ],
    amsterdam: [
      { name: 'Dam Square',              lat: 52.3731, lon:  4.8926 },
      { name: 'Anne Frank House',        lat: 52.3752, lon:  4.8840 },
      { name: 'Rijksmuseum',             lat: 52.3600, lon:  4.8852 },
      { name: 'Leidseplein',             lat: 52.3625, lon:  4.8820 },
      { name: 'Schiphol Airport',        lat: 52.3105, lon:  4.7683 },
    ],
    brussels: [
      { name: 'Grand Place',             lat: 50.8467, lon:  4.3525 },
      { name: 'Atomium',                 lat: 50.8947, lon:  4.3414 },
      { name: 'EU Quarter',              lat: 50.8466, lon:  4.3776 },
      { name: 'Brussels South Station',  lat: 50.8354, lon:  4.3362 },
      { name: 'Brussels Airport',        lat: 50.9014, lon:  4.4844 },
    ],
    vienna: [
      { name: 'Stephansdom',             lat: 48.2085, lon: 16.3731 },
      { name: 'Ringstrasse',             lat: 48.2036, lon: 16.3660 },
      { name: 'Prater — Riesenrad',      lat: 48.2167, lon: 16.3967 },
      { name: 'Schönbrunn Palace',       lat: 48.1845, lon: 16.3120 },
      { name: 'Vienna Airport',          lat: 48.1103, lon: 16.5697 },
    ],
    warsaw: [
      { name: 'Old Town Market',         lat: 52.2494, lon: 21.0126 },
      { name: 'Palace of Culture',       lat: 52.2318, lon: 21.0062 },
      { name: 'Warsaw Central Station',  lat: 52.2278, lon: 21.0031 },
      { name: 'Nowy Swiat',              lat: 52.2355, lon: 21.0162 },
      { name: 'Warsaw Chopin Airport',   lat: 52.1657, lon: 20.9671 },
    ],
    kyiv: [
      { name: 'Maidan Nezalezhnosti',    lat: 50.4501, lon: 30.5234 },
      { name: 'Khreshchatyk Street',     lat: 50.4470, lon: 30.5233 },
      { name: 'Sophia Cathedral',        lat: 50.4526, lon: 30.5141 },
      { name: 'Pechersk Lavra',          lat: 50.4347, lon: 30.5572 },
      { name: 'Boryspil Airport',        lat: 50.3450, lon: 30.8947 },
    ],
    moscow: [
      { name: 'Red Square',              lat: 55.7539, lon: 37.6208 },
      { name: 'Kremlin',                 lat: 55.7520, lon: 37.6175 },
      { name: 'Arbat Street',            lat: 55.7500, lon: 37.5929 },
      { name: 'Moscow City',             lat: 55.7498, lon: 37.5404 },
      { name: 'Sheremetyevo Airport',    lat: 55.9726, lon: 37.4146 },
    ],
    stockholm: [
      { name: 'Gamla Stan',              lat: 59.3233, lon: 18.0707 },
      { name: 'Sergels Torg',            lat: 59.3326, lon: 18.0632 },
      { name: 'Djurgården',              lat: 59.3250, lon: 18.1088 },
      { name: 'Kungsträdgården',         lat: 59.3319, lon: 18.0712 },
      { name: 'Arlanda Airport',         lat: 59.6519, lon: 17.9186 },
    ],
    lisbon: [
      { name: 'Praça do Comércio',       lat: 38.7080, lon: -9.1367 },
      { name: 'Alfama District',         lat: 38.7136, lon: -9.1313 },
      { name: 'Belém Tower',             lat: 38.6916, lon: -9.2160 },
      { name: 'Marquês de Pombal',       lat: 38.7259, lon: -9.1493 },
      { name: 'Humberto Delgado Airport',lat: 38.7742, lon: -9.1342 },
    ],
    athens: [
      { name: 'Acropolis',               lat: 37.9715, lon: 23.7257 },
      { name: 'Syntagma Square',         lat: 37.9756, lon: 23.7349 },
      { name: 'Monastiraki',             lat: 37.9753, lon: 23.7244 },
      { name: 'Omonia Square',           lat: 37.9839, lon: 23.7278 },
      { name: 'Athens Airport',          lat: 37.9364, lon: 23.9445 },
    ],
    istanbul: [
      { name: 'Hagia Sophia',            lat: 41.0086, lon: 28.9802 },
      { name: 'Grand Bazaar',            lat: 41.0108, lon: 28.9681 },
      { name: 'Taksim Square',           lat: 41.0369, lon: 28.9850 },
      { name: 'Bosphorus Bridge',        lat: 41.0455, lon: 29.0337 },
      { name: 'Atatürk Airport',         lat: 40.9769, lon: 28.8146 },
    ],
    // Middle East
    dubai: [
      { name: 'Burj Khalifa',            lat: 25.1972, lon: 55.2744 },
      { name: 'Dubai Mall',              lat: 25.1980, lon: 55.2796 },
      { name: 'Palm Jumeirah',           lat: 25.1124, lon: 55.1390 },
      { name: 'Dubai Marina',            lat: 25.0818, lon: 55.1389 },
      { name: 'Sheikh Zayed Road',       lat: 25.2037, lon: 55.2562 },
      { name: 'Dubai Airport T3',        lat: 25.2532, lon: 55.3657 },
      { name: 'Jumeirah Beach',          lat: 25.2009, lon: 55.2370 },
    ],
    abudhabi: [
      { name: 'Sheikh Zayed Mosque',     lat: 24.4128, lon: 54.4751 },
      { name: 'Corniche',                lat: 24.4635, lon: 54.3440 },
      { name: 'Yas Island Circuit',      lat: 24.4672, lon: 54.6031 },
      { name: 'Abu Dhabi Corniche',      lat: 24.4672, lon: 54.3604 },
      { name: 'Abu Dhabi Airport',       lat: 24.4330, lon: 54.6511 },
    ],
    riyadh: [
      { name: 'Kingdom Centre Tower',    lat: 24.7114, lon: 46.6742 },
      { name: 'Diriyah',                 lat: 24.7341, lon: 46.5753 },
      { name: 'Tahlia Street',           lat: 24.6898, lon: 46.6720 },
      { name: 'Olaya District',          lat: 24.6999, lon: 46.6830 },
      { name: 'KFIA Airport',            lat: 24.9575, lon: 46.6988 },
    ],
    baghdad: [
      { name: 'Green Zone',              lat: 33.3152, lon: 44.3661 },
      { name: 'Tahrir Square',           lat: 33.3406, lon: 44.4009 },
      { name: 'Al-Rasheed Street',       lat: 33.3387, lon: 44.4020 },
      { name: 'Baghdad Airport',         lat: 33.2625, lon: 44.2346 },
      { name: 'Tigris Bridges',          lat: 33.3500, lon: 44.3800 },
    ],
    tehran: [
      { name: 'Azadi Tower',             lat: 35.6998, lon: 51.3379 },
      { name: 'Vanak Square',            lat: 35.7574, lon: 51.4103 },
      { name: 'Milad Tower',             lat: 35.7448, lon: 51.3745 },
      { name: 'Grand Bazaar',            lat: 35.6737, lon: 51.4204 },
      { name: 'IKA Airport',             lat: 35.4161, lon: 51.1522 },
    ],
    doha: [
      { name: 'Souq Waqif',              lat: 25.2867, lon: 51.5333 },
      { name: 'Pearl Qatar',             lat: 25.3704, lon: 51.5504 },
      { name: 'Corniche',                lat: 25.2897, lon: 51.5319 },
      { name: 'Lusail Stadium',          lat: 25.4355, lon: 51.4894 },
      { name: 'Hamad Airport',           lat: 25.2609, lon: 51.6138 },
    ],
    kuwait: [
      { name: 'Kuwait Towers',           lat: 29.3813, lon: 47.9842 },
      { name: 'Grand Mosque',            lat: 29.3733, lon: 47.9858 },
      { name: 'Marina Mall',             lat: 29.3572, lon: 47.9860 },
      { name: 'Kuwait City Airport',     lat: 29.2267, lon: 47.9689 },
    ],
    muscat: [
      { name: 'Sultan Qaboos Mosque',    lat: 23.5892, lon: 58.4030 },
      { name: 'Old Muscat Corniche',     lat: 23.6141, lon: 58.5921 },
      { name: 'Mutrah Souq',             lat: 23.6191, lon: 58.5902 },
      { name: 'Muscat Airport',          lat: 23.5933, lon: 58.2844 },
    ],
    beirut: [
      { name: 'Martyrs\' Square',        lat: 33.8942, lon: 35.5030 },
      { name: 'Hamra Street',            lat: 33.8957, lon: 35.4793 },
      { name: 'Corniche Beirut',         lat: 33.8937, lon: 35.4837 },
      { name: 'Port of Beirut',          lat: 33.9003, lon: 35.5196 },
      { name: 'Beirut Airport',          lat: 33.8209, lon: 35.4884 },
    ],
    amman: [
      { name: 'Downtown — Rainbow St',   lat: 31.9521, lon: 35.9308 },
      { name: 'Amman Citadel',           lat: 31.9551, lon: 35.9314 },
      { name: 'Fourth Circle',           lat: 31.9713, lon: 35.8990 },
      { name: 'Queen Alia Airport',      lat: 31.7226, lon: 35.9932 },
    ],
    telaviv: [
      { name: 'Dizengoff Square',        lat: 32.0782, lon: 34.7748 },
      { name: 'Jaffa Clock Tower',       lat: 32.0519, lon: 34.7516 },
      { name: 'Rothschild Boulevard',    lat: 32.0631, lon: 34.7706 },
      { name: 'Ayalon Highway',          lat: 32.0840, lon: 34.7990 },
      { name: 'Ben Gurion Airport',      lat: 32.0114, lon: 34.8867 },
    ],
    // Africa
    cairo: [
      { name: 'Tahrir Square',           lat: 30.0444, lon: 31.2357 },
      { name: 'Pyramids of Giza',        lat: 29.9792, lon: 31.1342 },
      { name: 'Cairo Tower',             lat: 30.0459, lon: 31.2243 },
      { name: 'Khan El-Khalili',         lat: 30.0478, lon: 31.2627 },
      { name: 'Cairo International',     lat: 30.1219, lon: 31.4056 },
    ],
    lagos: [
      { name: 'Victoria Island',         lat:  6.4314, lon:  3.4229 },
      { name: 'Eko Bridge',              lat:  6.4552, lon:  3.3840 },
      { name: 'Balogun Market',          lat:  6.4530, lon:  3.3967 },
      { name: 'Murtala Mohammed Airport',lat:  6.5775, lon:  3.3212 },
    ],
    nairobi: [
      { name: 'KICC',                    lat: -1.2864, lon: 36.8233 },
      { name: 'Kenyatta Avenue',         lat: -1.2831, lon: 36.8219 },
      { name: 'Uhuru Park',              lat: -1.2914, lon: 36.8127 },
      { name: 'Westlands',               lat: -1.2642, lon: 36.8047 },
      { name: 'JKIA Airport',            lat: -1.3192, lon: 36.9275 },
    ],
    joburg: [
      { name: 'Sandton City',            lat: -26.1072, lon: 28.0567 },
      { name: 'Nelson Mandela Square',   lat: -26.1077, lon: 28.0563 },
      { name: 'Constitution Hill',       lat: -26.1950, lon: 28.0422 },
      { name: 'OR Tambo Airport',        lat: -26.1392, lon: 28.2460 },
    ],
    addis: [
      { name: 'Meskel Square',           lat:  9.0074, lon: 38.7635 },
      { name: 'Bole Road',               lat:  9.0047, lon: 38.7814 },
      { name: 'Piazza District',         lat:  9.0369, lon: 38.7527 },
      { name: 'Bole International',      lat:  8.9779, lon: 38.7992 },
    ],
    casablanca: [
      { name: 'Hassan II Mosque',        lat: 33.6084, lon: -7.6325 },
      { name: 'Place Mohammed V',        lat: 33.5903, lon: -7.6196 },
      { name: 'Boulevard de la Corniche',lat: 33.5950, lon: -7.6680 },
      { name: 'Mohammed V Airport',      lat: 33.3675, lon: -7.5899 },
    ],
    khartoum: [
      { name: 'Nile Confluence',         lat: 15.5965, lon: 32.5541 },
      { name: 'Martyrs Square',          lat: 15.5988, lon: 32.5311 },
      { name: 'Khartoum Airport',        lat: 15.5895, lon: 32.5532 },
      { name: 'Omdurman Bridge',         lat: 15.6403, lon: 32.5137 },
    ],
    kinshasa: [
      { name: 'Gombe District',          lat: -4.3022, lon: 15.2978 },
      { name: 'Boulevard du 30-Juin',    lat: -4.3217, lon: 15.3224 },
      { name: 'Ndjili Airport',          lat: -4.3854, lon: 15.4447 },
      { name: 'Congo River Waterfront',  lat: -4.3167, lon: 15.2914 },
    ],
    // Asia-Pacific
    tokyo: [
      { name: 'Shibuya Crossing',        lat: 35.6595, lon: 139.7004 },
      { name: 'Shinjuku Station',        lat: 35.6896, lon: 139.6917 },
      { name: 'Tokyo Tower',             lat: 35.6586, lon: 139.7454 },
      { name: 'Ginza 4-chome',           lat: 35.6717, lon: 139.7649 },
      { name: 'Asakusa Temple',          lat: 35.7148, lon: 139.7967 },
      { name: 'Haneda Airport',          lat: 35.5494, lon: 139.7798 },
    ],
    beijing: [
      { name: 'Tiananmen Square',        lat: 39.9042, lon: 116.4074 },
      { name: 'Forbidden City',          lat: 39.9163, lon: 116.3972 },
      { name: 'Wangfujing',              lat: 39.9148, lon: 116.4126 },
      { name: 'National Stadium (Bird)', lat: 39.9929, lon: 116.3963 },
      { name: 'Beijing Capital Airport', lat: 40.0801, lon: 116.5846 },
    ],
    shanghai: [
      { name: 'The Bund',                lat: 31.2399, lon: 121.4900 },
      { name: 'People\'s Square',        lat: 31.2304, lon: 121.4737 },
      { name: 'Oriental Pearl Tower',    lat: 31.2397, lon: 121.4997 },
      { name: 'Nanjing Road',            lat: 31.2376, lon: 121.4774 },
      { name: 'Pudong Airport',          lat: 31.1434, lon: 121.8052 },
    ],
    seoul: [
      { name: 'Gangnam Station',         lat: 37.4979, lon: 127.0276 },
      { name: 'Myeongdong',              lat: 37.5637, lon: 126.9851 },
      { name: 'Gyeongbokgung Palace',    lat: 37.5796, lon: 126.9770 },
      { name: 'Han River Bridge',        lat: 37.5495, lon: 126.9469 },
      { name: 'Incheon Airport',         lat: 37.4602, lon: 126.4407 },
    ],
    hongkong: [
      { name: 'Victoria Harbour',        lat: 22.2965, lon: 114.1722 },
      { name: 'Central District',        lat: 22.2800, lon: 114.1588 },
      { name: 'Nathan Road — Tsim Sha',  lat: 22.3027, lon: 114.1714 },
      { name: 'The Peak',                lat: 22.2759, lon: 114.1455 },
      { name: 'HKIA Airport',            lat: 22.3080, lon: 113.9185 },
    ],
    bangkok: [
      { name: 'Grand Palace',            lat: 13.7500, lon: 100.4913 },
      { name: 'Khao San Road',           lat: 13.7589, lon: 100.4977 },
      { name: 'Sukhumvit Road',          lat: 13.7311, lon: 100.5630 },
      { name: 'Suvarnabhumi Airport',    lat: 13.6900, lon: 100.7501 },
      { name: 'Chatuchak Market',        lat: 13.7999, lon: 100.5501 },
    ],
    jakarta: [
      { name: 'National Monument',       lat: -6.1751, lon: 106.8272 },
      { name: 'Jalan Sudirman',          lat: -6.2177, lon: 106.8228 },
      { name: 'Kota Tua',                lat: -6.1352, lon: 106.8133 },
      { name: 'Soekarno-Hatta Airport',  lat: -6.1256, lon: 106.6559 },
    ],
    kl: [
      { name: 'Petronas Twin Towers',    lat:  3.1578, lon: 101.7123 },
      { name: 'Bukit Bintang',           lat:  3.1482, lon: 101.7105 },
      { name: 'Central Market',          lat:  3.1433, lon: 101.6945 },
      { name: 'KLIA Airport',            lat:  2.7456, lon: 101.7099 },
    ],
    manila: [
      { name: 'Rizal Park',              lat: 14.5826, lon: 120.9787 },
      { name: 'EDSA — Makati Ave',       lat: 14.5568, lon: 121.0132 },
      { name: 'Intramuros',              lat: 14.5896, lon: 120.9750 },
      { name: 'Ninoy Aquino Airport',    lat: 14.5086, lon: 121.0194 },
    ],
    hcmc: [
      { name: 'Ben Thanh Market',        lat: 10.7726, lon: 106.6980 },
      { name: 'Bui Vien Street',         lat: 10.7663, lon: 106.6939 },
      { name: 'Dong Khoi Street',        lat: 10.7769, lon: 106.7030 },
      { name: 'Tan Son Nhat Airport',    lat: 10.8188, lon: 106.6520 },
    ],
    sydney: [
      { name: 'Sydney Opera House',      lat: -33.8568, lon: 151.2153 },
      { name: 'Harbour Bridge',          lat: -33.8523, lon: 151.2108 },
      { name: 'Bondi Beach',             lat: -33.8908, lon: 151.2743 },
      { name: 'Central Station',         lat: -33.8831, lon: 151.2063 },
      { name: 'Circular Quay',           lat: -33.8617, lon: 151.2107 },
      { name: 'Sydney Airport',          lat: -33.9461, lon: 151.1772 },
    ],
    melbourne: [
      { name: 'Flinders St Station',     lat: -37.8183, lon: 144.9671 },
      { name: 'Federation Square',       lat: -37.8180, lon: 144.9690 },
      { name: 'St Kilda Beach',          lat: -37.8672, lon: 144.9763 },
      { name: 'CBD — Collins St',        lat: -37.8136, lon: 144.9631 },
      { name: 'Melbourne Airport',       lat: -37.6690, lon: 144.8410 },
    ],
    // South Asia
    delhi: [
      { name: 'India Gate',              lat: 28.6129, lon: 77.2295 },
      { name: 'Connaught Place',         lat: 28.6315, lon: 77.2167 },
      { name: 'Red Fort',                lat: 28.6562, lon: 77.2410 },
      { name: 'IGI Airport T3',          lat: 28.5562, lon: 77.1000 },
      { name: 'NH-48 Mahipalpur',        lat: 28.5459, lon: 77.1278 },
    ],
    mumbai: [
      { name: 'Gateway of India',        lat: 18.9220, lon: 72.8347 },
      { name: 'Marine Drive',            lat: 18.9440, lon: 72.8237 },
      { name: 'Bandra-Worli Sea Link',   lat: 19.0237, lon: 72.8175 },
      { name: 'Chhatrapati Shivaji T.',  lat: 18.9398, lon: 72.8355 },
      { name: 'Mumbai Airport T2',       lat: 19.0896, lon: 72.8656 },
    ],
    karachi: [
      { name: 'Clifton Beach',           lat: 24.8161, lon: 67.0294 },
      { name: 'M.A. Jinnah Road',        lat: 24.8607, lon: 67.0011 },
      { name: 'Mazar-e-Quaid',           lat: 24.8746, lon: 67.0330 },
      { name: 'Jinnah Airport',          lat: 24.9065, lon: 67.1608 },
    ],
    dhaka: [
      { name: 'Shahbag Square',          lat: 23.7384, lon: 90.3950 },
      { name: 'Motijheel',               lat: 23.7249, lon: 90.4174 },
      { name: 'National Parliament',     lat: 23.7619, lon: 90.3759 },
      { name: 'Hazrat Shahjalal Airport',lat: 23.8433, lon: 90.3978 },
    ],
    colombo: [
      { name: 'Galle Face Green',        lat:  6.9109, lon: 79.8479 },
      { name: 'Colombo Fort',            lat:  6.9344, lon: 79.8428 },
      { name: 'Pettah Market',           lat:  6.9355, lon: 79.8516 },
      { name: 'Bandaranaike Airport',    lat:  7.1804, lon: 79.8841 },
    ],
  };
  
  app.get('/api/cameras/static/:city', (req, res) => {
    const cams = STATIC_CAMERAS[req.params.city];
    if (!cams) return res.json([]);
    res.json(cams);
  });

  function windyCacheKey(lat, lon, radiusKm) {
    return `${lat.toFixed(4)}:${lon.toFixed(4)}:${Math.round(radiusKm)}`;
  }
  
  function normalizeWindyWebcam(cam) {
    const lat = Number(cam?.location?.latitude);
    const lon = Number(cam?.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const preview =
      cam?.images?.current?.preview ||
      cam?.images?.daylight?.preview ||
      cam?.image?.current?.preview ||
      cam?.image?.day?.preview;
    if (!preview) return null;
    const streamUrl = cam?.player?.day?.hd || cam?.player?.day?.sd || cam?.player?.hd || cam?.player?.sd || null;
    return {
      name: cam.title || cam?.title || 'Webcam',
      lat,
      lon,
      imageUrl: preview,
      streamUrl,
    };
  }
  
  async function fetchWindyCameras(lat, lon, radiusKm = 30) {
    if (!WINDY_KEY) return null;
    const cacheKey = windyCacheKey(lat, lon, radiusKm);
    const cached = windyCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.ts < WINDY_CACHE_TTL) {
      return cached.data;
    }
    const coordString = `${lat.toFixed(4)},${lon.toFixed(4)},${Math.round(radiusKm)}`;
    const v3Params = new URLSearchParams({
      nearby: coordString,
      include: 'location,images,player',
      limit: '24',
    });
    const endpoints = WINDY_BASE_URLS.map(base => `${base}?${v3Params.toString()}`);
    const attempts = [];
  
    for (const url of endpoints) {
      const response = await fetchWithTimeout(url, {
        headers: { ...HEADERS, 'x-windy-api-key': WINDY_KEY },
        timeout: 20000,
      });
  
      if (!response.ok) {
        const body = await response.text().catch(() => '<no body>');
        attempts.push({ status: response.status, body, url });
        console.error('Windy API error body:', body);
        continue;
      }
  
      const data = await response.json();
      const cams = Array.isArray(data?.webcams)
        ? data.webcams
        : Array.isArray(data?.result?.webcams)
          ? data.result.webcams
          : Array.isArray(data)
            ? data
            : [];
      const normalized = cams.map(normalizeWindyWebcam).filter(Boolean).slice(0, 24);
      windyCache.set(cacheKey, { ts: now, data: normalized });
      return normalized;
    }
  
    const lastAttempt = attempts[attempts.length - 1] || null;
    const err = new Error(`Windy ${lastAttempt?.status || 502}`);
    err.status = lastAttempt?.status || 502;
    err.details = lastAttempt?.body || 'Windy request failed';
    err.endpoint = lastAttempt?.url || null;
    err.attempts = attempts;
    throw err;
  }

  app.get('/api/cameras/windy', async (req, res) => {
    if (!WINDY_KEY) return res.status(503).json({ error: 'Windy CCTV key not configured' });
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const radius = parseFloat(req.query.radius) || 30;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'lat and lon query params required' });
    }
    try {
      const requestedRadius = Math.max(5, Math.min(200, radius));
      const candidateRadii = [
        requestedRadius,
        Math.max(80, requestedRadius * 2),
        Math.max(120, requestedRadius * 3),
      ].map(r => Math.round(Math.min(200, r)));
      const radii = [...new Set(candidateRadii)];
  
      let cameras = [];
      for (const searchRadius of radii) {
        cameras = await fetchWindyCameras(lat, lon, searchRadius);
        if (Array.isArray(cameras) && cameras.length) {
          return res.json(cameras);
        }
      }
  
      res.json([]);
    } catch (err) {
      console.error('Windy cameras error:', err.message);
      res.status(err.status || 502).json({
        error: err.message,
        details: err.details || null,
        endpoint: err.endpoint || null,
        attempts: err.attempts || [],
      });
    }
  });

  let tflCache = null;
  let tflTime  = 0;
  
  app.get('/api/cameras/london', async (_req, res) => {
    const now = Date.now();
    if (tflCache && now - tflTime < 3_600_000) return res.json(tflCache);
    try {
      const r = await fetchWithTimeout('https://api.tfl.gov.uk/Place/Type/JamCam', { headers: HEADERS });
      if (!r.ok) throw new Error(`TfL API ${r.status}`);
      const data = await r.json();
      const cams = data
        .filter(c =>
          c.lat > 51.45 && c.lat < 51.56 &&
          c.lon > -0.22 && c.lon < 0.05
        )
        .map(c => ({
          name:     c.commonName,
          lat:      c.lat,
          lon:      c.lon,
          imageUrl: c.additionalProperties?.find(p => p.key === 'imageUrl')?.value,
        }))
        .filter(c => c.imageUrl)
        .slice(0, 9);
      tflCache = cams;
      tflTime  = now;
      console.log(`London cameras cached: ${cams.length}`);
      res.json(cams);
    } catch (err) {
      console.error('TfL error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  const ALLOWED_CAM_HOSTS = [
    's3-eu-west-1.amazonaws.com',
    'jamcams.tfl.gov.uk',
    'images.data.gov.sg',
    'api.data.gov.sg',
  ];
  
  app.get('/api/cam-proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send('Missing url');
    let hostname;
    try { hostname = new URL(url).hostname; } catch { return res.status(400).send('Bad url'); }
    if (!ALLOWED_CAM_HOSTS.some(h => hostname.endsWith(h))) {
      return res.status(403).send('Host not allowed');
    }
    try {
      const r = await fetchWithTimeout(url, { headers: HEADERS });
      if (!r.ok) return res.status(r.status).send('Upstream error');
      res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
      r.body.pipe(res);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

}

module.exports = { registerCameraRoutes };
