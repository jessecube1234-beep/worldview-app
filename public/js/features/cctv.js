(function initWorldViewCCTVModule(global) {
  function initWorldViewCCTV(deps) {
    const { viewer, state } = deps;

    const camSvg = (() => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="14" viewBox="0 0 20 14"><rect x="1" y="2" width="12" height="10" rx="2" fill="#ff6b35" opacity="0.95"/><polygon points="13,4 19,1 19,13 13,10" fill="#ff6b35" opacity="0.85"/><circle cx="7" cy="7" r="2.8" fill="#fff" opacity="0.7"/></svg>`;
      return 'data:image/svg+xml;base64,' + btoa(svg);
    })();

    const CITY_CAM_INFO = {
      london: { label: 'London', liveApi: '/api/cameras/london', external: 'https://www.earthcam.com/world/england/london/' },
      singapore: { label: 'Singapore', liveApi: '/api/cameras/singapore', external: 'https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html' },
      nyc: { label: 'New York', staticApi: '/api/cameras/static/nyc', external: 'https://webcams.nyc.gov/' },
      la: { label: 'Los Angeles', staticApi: '/api/cameras/static/la', external: 'https://cwwp2.dot.ca.gov/vm/streamlist.htm' },
      chicago: { label: 'Chicago', staticApi: '/api/cameras/static/chicago', external: 'https://www.earthcam.com/usa/illinois/chicago/' },
      miami: { label: 'Miami', staticApi: '/api/cameras/static/miami', external: 'https://www.earthcam.com/usa/florida/miami/' },
      dc: { label: 'Washington DC', staticApi: '/api/cameras/static/dc', external: 'https://www.earthcam.com/usa/dc/washingtondc/' },
      toronto: { label: 'Toronto', staticApi: '/api/cameras/static/toronto', external: 'https://www.earthcam.com/world/canada/toronto/' },
      vancouver: { label: 'Vancouver', staticApi: '/api/cameras/static/vancouver', external: 'https://www.earthcam.com/world/canada/vancouver/' },
      mexico: { label: 'Mexico City', staticApi: '/api/cameras/static/mexico', external: 'https://www.earthcam.com/world/mexico/mexicocity/' },
      saopaulo: { label: 'Sao Paulo', staticApi: '/api/cameras/static/saopaulo', external: 'https://www.earthcam.com/world/brazil/saopaulo/' },
      buenosaires: { label: 'Buenos Aires', staticApi: '/api/cameras/static/buenosaires', external: 'https://www.earthcam.com/world/argentina/buenosaires/' },
      bogota: { label: 'Bogota', staticApi: '/api/cameras/static/bogota', external: 'https://www.earthcam.com/world/colombia/bogota/' },
      lima: { label: 'Lima', staticApi: '/api/cameras/static/lima', external: 'https://www.earthcam.com/world/peru/lima/' },
      santiago: { label: 'Santiago', staticApi: '/api/cameras/static/santiago', external: 'https://www.earthcam.com/world/chile/santiago/' },
      paris: { label: 'Paris', staticApi: '/api/cameras/static/paris', external: 'https://www.earthcam.com/world/france/paris/' },
      berlin: { label: 'Berlin', staticApi: '/api/cameras/static/berlin', external: 'https://www.earthcam.com/world/germany/berlin/' },
      madrid: { label: 'Madrid', staticApi: '/api/cameras/static/madrid', external: 'https://www.earthcam.com/world/spain/madrid/' },
      rome: { label: 'Rome', staticApi: '/api/cameras/static/rome', external: 'https://www.earthcam.com/world/italy/rome/' },
      amsterdam: { label: 'Amsterdam', staticApi: '/api/cameras/static/amsterdam', external: 'https://www.earthcam.com/world/netherlands/amsterdam/' },
      brussels: { label: 'Brussels', staticApi: '/api/cameras/static/brussels', external: 'https://www.earthcam.com/world/belgium/brussels/' },
      vienna: { label: 'Vienna', staticApi: '/api/cameras/static/vienna', external: 'https://www.earthcam.com/world/austria/vienna/' },
      warsaw: { label: 'Warsaw', staticApi: '/api/cameras/static/warsaw', external: 'https://www.earthcam.com/world/poland/warsaw/' },
      kyiv: { label: 'Kyiv', staticApi: '/api/cameras/static/kyiv', external: 'https://www.earthcam.com/world/ukraine/kyiv/' },
      moscow: { label: 'Moscow', staticApi: '/api/cameras/static/moscow', external: 'https://www.earthcam.com/world/russia/moscow/' },
      stockholm: { label: 'Stockholm', staticApi: '/api/cameras/static/stockholm', external: 'https://www.earthcam.com/world/sweden/stockholm/' },
      lisbon: { label: 'Lisbon', staticApi: '/api/cameras/static/lisbon', external: 'https://www.earthcam.com/world/portugal/lisbon/' },
      athens: { label: 'Athens', staticApi: '/api/cameras/static/athens', external: 'https://www.earthcam.com/world/greece/athens/' },
      istanbul: { label: 'Istanbul', staticApi: '/api/cameras/static/istanbul', external: 'https://www.earthcam.com/world/turkey/istanbul/' },
      dubai: { label: 'Dubai', staticApi: '/api/cameras/static/dubai', external: 'https://www.earthcam.com/world/unitedarabemirates/dubai/' },
      abudhabi: { label: 'Abu Dhabi', staticApi: '/api/cameras/static/abudhabi', external: 'https://www.earthcam.com/world/unitedarabemirates/' },
      riyadh: { label: 'Riyadh', staticApi: '/api/cameras/static/riyadh', external: 'https://www.earthcam.com/world/saudiarabia/' },
      baghdad: { label: 'Baghdad', staticApi: '/api/cameras/static/baghdad', external: 'https://www.google.com/search?q=Baghdad+live+cameras' },
      tehran: { label: 'Tehran', staticApi: '/api/cameras/static/tehran', external: 'https://www.earthcam.com/world/iran/tehran/' },
      doha: { label: 'Doha', staticApi: '/api/cameras/static/doha', external: 'https://www.earthcam.com/world/qatar/doha/' },
      kuwait: { label: 'Kuwait City', staticApi: '/api/cameras/static/kuwait', external: 'https://www.google.com/search?q=Kuwait+City+live+cameras' },
      muscat: { label: 'Muscat', staticApi: '/api/cameras/static/muscat', external: 'https://www.google.com/search?q=Muscat+live+cameras' },
      beirut: { label: 'Beirut', staticApi: '/api/cameras/static/beirut', external: 'https://www.earthcam.com/world/lebanon/beirut/' },
      amman: { label: 'Amman', staticApi: '/api/cameras/static/amman', external: 'https://www.google.com/search?q=Amman+live+cameras' },
      telaviv: { label: 'Tel Aviv', staticApi: '/api/cameras/static/telaviv', external: 'https://www.earthcam.com/world/israel/telaviv/' },
      cairo: { label: 'Cairo', staticApi: '/api/cameras/static/cairo', external: 'https://www.earthcam.com/world/egypt/cairo/' },
      lagos: { label: 'Lagos', staticApi: '/api/cameras/static/lagos', external: 'https://www.earthcam.com/world/nigeria/lagos/' },
      nairobi: { label: 'Nairobi', staticApi: '/api/cameras/static/nairobi', external: 'https://www.earthcam.com/world/kenya/nairobi/' },
      joburg: { label: 'Johannesburg', staticApi: '/api/cameras/static/joburg', external: 'https://www.earthcam.com/world/southafrica/' },
      addis: { label: 'Addis Ababa', staticApi: '/api/cameras/static/addis', external: 'https://www.google.com/search?q=Addis+Ababa+live+cameras' },
      casablanca: { label: 'Casablanca', staticApi: '/api/cameras/static/casablanca', external: 'https://www.earthcam.com/world/morocco/casablanca/' },
      khartoum: { label: 'Khartoum', staticApi: '/api/cameras/static/khartoum', external: 'https://www.google.com/search?q=Khartoum+live+cameras' },
      kinshasa: { label: 'Kinshasa', staticApi: '/api/cameras/static/kinshasa', external: 'https://www.google.com/search?q=Kinshasa+live+cameras' },
      tokyo: { label: 'Tokyo', staticApi: '/api/cameras/static/tokyo', external: 'https://www.earthcam.com/world/japan/tokyo/' },
      beijing: { label: 'Beijing', staticApi: '/api/cameras/static/beijing', external: 'https://www.earthcam.com/world/china/beijing/' },
      shanghai: { label: 'Shanghai', staticApi: '/api/cameras/static/shanghai', external: 'https://www.earthcam.com/world/china/shanghai/' },
      seoul: { label: 'Seoul', staticApi: '/api/cameras/static/seoul', external: 'https://www.earthcam.com/world/korea/seoul/' },
      hongkong: { label: 'Hong Kong', staticApi: '/api/cameras/static/hongkong', external: 'https://www.earthcam.com/world/china/hongkong/' },
      bangkok: { label: 'Bangkok', staticApi: '/api/cameras/static/bangkok', external: 'https://www.earthcam.com/world/thailand/bangkok/' },
      jakarta: { label: 'Jakarta', staticApi: '/api/cameras/static/jakarta', external: 'https://www.earthcam.com/world/indonesia/jakarta/' },
      kl: { label: 'Kuala Lumpur', staticApi: '/api/cameras/static/kl', external: 'https://www.earthcam.com/world/malaysia/kualalumpur/' },
      manila: { label: 'Manila', staticApi: '/api/cameras/static/manila', external: 'https://www.earthcam.com/world/philippines/manila/' },
      hcmc: { label: 'Ho Chi Minh', staticApi: '/api/cameras/static/hcmc', external: 'https://www.earthcam.com/world/vietnam/hochiminhcity/' },
      sydney: { label: 'Sydney', staticApi: '/api/cameras/static/sydney', external: 'https://www.livetraffic.com/traffic-cameras.html' },
      melbourne: { label: 'Melbourne', staticApi: '/api/cameras/static/melbourne', external: 'https://www.earthcam.com/world/australia/melbourne/' },
      delhi: { label: 'Delhi', staticApi: '/api/cameras/static/delhi', external: 'https://www.earthcam.com/world/india/newdelhi/' },
      mumbai: { label: 'Mumbai', staticApi: '/api/cameras/static/mumbai', external: 'https://www.earthcam.com/world/india/mumbai/' },
      karachi: { label: 'Karachi', staticApi: '/api/cameras/static/karachi', external: 'https://www.google.com/search?q=Karachi+live+cameras' },
      dhaka: { label: 'Dhaka', staticApi: '/api/cameras/static/dhaka', external: 'https://www.google.com/search?q=Dhaka+live+cameras' },
      colombo: { label: 'Colombo', staticApi: '/api/cameras/static/colombo', external: 'https://www.google.com/search?q=Colombo+live+cameras' },
    };

    function getCityCamInfo(city) {
      if (CITY_CAM_INFO[city.cam]) return CITY_CAM_INFO[city.cam];
      const query = city.country === 'US'
        ? `${city.name} traffic cameras live`
        : `${city.name} live webcam CCTV street camera`;
      return {
        label: city.name,
        windRadius: city.country === 'US' ? 90 : 60,
        external: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      };
    }

    async function fetchWindyCameras(lat, lon, radius = 40) {
      const params = new URLSearchParams({
        lat: lat.toFixed(4),
        lon: lon.toFixed(4),
        radius: Math.round(radius).toString(),
      });
      const res = await fetch(`/api/cameras/windy?${params}`);
      if (!res.ok) {
        let details = '';
        try {
          const body = await res.json();
          if (body?.error) details = body.error;
          if (body?.details) details = `${details}${details ? ' | ' : ''}${body.details}`;
        } catch (_) {}
        throw new Error(`Windy cameras ${res.status}${details ? `: ${details}` : ''}`);
      }
      return res.json();
    }

    const cctvOverlay = document.getElementById('cctv-overlay');
    const cctvTitle = document.getElementById('cctv-title');
    const cctvMeta = document.getElementById('cctv-meta');
    const cctvGrid = document.getElementById('cctv-grid');
    const cctvStatus = document.getElementById('cctv-status');
    const cctvExternal = document.getElementById('cctv-external');

    let cctvRefreshTimer = null;
    let cctvCurrentCams = [];
    let cctvFocusedCamKey = null;

    function clearCameraEntities() {
      state.cameraEntities.forEach((e) => viewer.entities.remove(e));
      state.cameraEntities = [];
      viewer.scene.requestRender();
    }

    function plotCamerasOnGlobe(cameras) {
      clearCameraEntities();
      for (const cam of cameras) {
        if (cam.lat == null || cam.lon == null) continue;
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 30),
          billboard: {
            image: camSvg,
            scale: 1.1,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: 0,
          },
          description: JSON.stringify({
            type: 'camera',
            name: cam.name,
            imageUrl: cam.imageUrl,
            lat: cam.lat,
            lon: cam.lon,
            streamUrl: cam.streamUrl || '',
          }),
        });
        state.cameraEntities.push(entity);
      }
      viewer.scene.requestRender();
    }

    function closeCCTV() {
      cctvOverlay.style.display = 'none';
      clearInterval(cctvRefreshTimer);
      cctvRefreshTimer = null;
      cctvCurrentCams = [];
      cctvFocusedCamKey = null;
      clearCameraEntities();
    }

    function cctvCamKey(cam) {
      return `${cam.name || ''}|${Number(cam.lat).toFixed(5)}|${Number(cam.lon).toFixed(5)}|${cam.imageUrl || ''}`;
    }

    function renderFocusedCam(cam) {
      cctvGrid.innerHTML = '';
      const toolbar = document.createElement('div');
      toolbar.className = 'cam-focus-toolbar';
      const backBtn = document.createElement('button');
      backBtn.className = 'cam-focus-back';
      backBtn.type = 'button';
      backBtn.textContent = 'Back to all feeds';
      backBtn.addEventListener('click', () => {
        cctvFocusedCamKey = null;
        cctvStatus.textContent = `${cctvCurrentCams.length} cameras | click a preview to focus`;
        renderCamImages(cctvCurrentCams);
      });
      toolbar.appendChild(backBtn);
      cctvGrid.appendChild(toolbar);

      const cell = document.createElement('div');
      cell.className = 'cam-cell cam-single';
      const img = document.createElement('img');
      img.className = 'cam-img cam-img-large';
      img.alt = cam.name;
      img.src = cam.imageUrl;
      img.onerror = () => { img.src = ''; cell.classList.add('cam-error'); };
      const label = document.createElement('div');
      label.className = 'cam-label';
      label.textContent = cam.name;
      cell.appendChild(img);
      cell.appendChild(label);
      cctvGrid.appendChild(cell);
      cctvStatus.textContent = `${cam.name} | focused feed`;
    }

    function renderCamImages(cams) {
      cctvCurrentCams = Array.isArray(cams) ? cams : [];
      if (cctvFocusedCamKey && cctvCurrentCams.length) {
        const focused = cctvCurrentCams.find((cam) => cctvCamKey(cam) === cctvFocusedCamKey);
        if (focused) {
          renderFocusedCam(focused);
          return;
        }
        cctvFocusedCamKey = null;
        cctvStatus.textContent = `${cctvCurrentCams.length} cameras | click a preview to focus`;
      }

      cctvGrid.innerHTML = '';
      for (const cam of cctvCurrentCams) {
        const cell = document.createElement('div');
        cell.className = 'cam-cell cam-clickable';
        cell.title = `Open ${cam.name}`;

        const label = document.createElement('div');
        label.className = 'cam-label';
        label.textContent = cam.name;

        const img = document.createElement('img');
        img.className = 'cam-img';
        img.alt = cam.name;
        img.src = cam.imageUrl;
        img.onerror = () => { img.src = ''; cell.classList.add('cam-error'); label.textContent += ' (unavailable)'; };

        cell.addEventListener('click', () => {
          cctvFocusedCamKey = cctvCamKey(cam);
          renderFocusedCam(cam);
        });

        cell.appendChild(img);
        cell.appendChild(label);
        cctvGrid.appendChild(cell);
      }
    }

    function renderStaticCamCards(cams) {
      cctvGrid.innerHTML = '';
      for (const cam of cams) {
        const cell = document.createElement('div');
        cell.className = 'cam-cell cam-static-cell';
        cell.title = `Click to fly to ${cam.name}`;

        const placeholder = document.createElement('div');
        placeholder.className = 'cam-static-placeholder';
        const icon = document.createElement('span');
        icon.className = 'cam-static-icon';
        icon.textContent = 'CAM';
        const nameEl = document.createElement('div');
        nameEl.className = 'cam-static-name';
        nameEl.textContent = cam.name;
        placeholder.appendChild(icon);
        placeholder.appendChild(nameEl);

        const coords = document.createElement('div');
        coords.className = 'cam-static-coords';
        coords.textContent = `${cam.lat.toFixed(4)} deg  ${cam.lon.toFixed(4)} deg`;

        cell.appendChild(placeholder);
        cell.appendChild(coords);
        cell.addEventListener('click', () => {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 1500),
            duration: 1.5,
          });
        });
        cctvGrid.appendChild(cell);
      }
    }

    async function openCCTV(city) {
      closeCCTV();
      const info = getCityCamInfo(city);
      cctvOverlay.style.display = 'flex';
      cctvTitle.textContent = `[ ${city.name.toUpperCase()} | CCTV ]`;
      cctvMeta.textContent = `${city.lat.toFixed(4)} deg, ${city.lon.toFixed(4)} deg | ${city.country}`;
      cctvGrid.innerHTML = '<div class="cctv-loading">Loading cameras...</div>';
      cctvStatus.textContent = '';
      cctvCurrentCams = [];
      cctvFocusedCamKey = null;
      cctvExternal.href = info.external || `https://www.google.com/search?q=${encodeURIComponent(city.name + ' live webcam CCTV street camera')}`;
      cctvExternal.style.display = 'inline';
      cctvExternal.textContent = 'Open More ?';

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 15000),
        duration: 1.5,
      });

      if (!info.skipWindy) {
        try {
          cctvStatus.textContent = 'Searching Windy webcams...';
          const windyCams = await fetchWindyCameras(city.lat, city.lon, info.windRadius ?? 40);
          if (Array.isArray(windyCams) && windyCams.length) {
            cctvStatus.textContent = `${windyCams.length} Windy webcams | click a preview`;
            renderCamImages(windyCams);
            plotCamerasOnGlobe(windyCams);
            return;
          }
          cctvStatus.textContent = 'Windy has no nearby cameras | showing fallback sources';
        } catch (err) {
          console.warn('Windy webcams error:', err);
          cctvStatus.textContent = 'Windy webcams unavailable | showing fallback sources';
        }
      }

      if (info.liveApi) {
        try {
          const res = await fetch(info.liveApi);
          const cams = await res.json();
          if (!Array.isArray(cams) || cams.length === 0) throw new Error('No cameras returned');
          cctvStatus.textContent = `${cams.length} live cameras | click dots on globe | auto-refresh 10s`;
          renderCamImages(cams);
          plotCamerasOnGlobe(cams);
          cctvRefreshTimer = setInterval(() => renderCamImages(cams), 10000);
        } catch (err) {
          cctvGrid.innerHTML = `<div class="cctv-error">Live feed unavailable: ${err.message}</div>`;
          cctvStatus.textContent = 'Live API error';
        }
        return;
      }

      if (info.staticApi) {
        try {
          const res = await fetch(info.staticApi);
          const cams = await res.json();
          if (Array.isArray(cams) && cams.length > 0) {
            plotCamerasOnGlobe(cams);
            cctvStatus.textContent = `${cams.length} camera positions | click a card or globe dot to fly there`;
            renderStaticCamCards(cams);
            return;
          }
        } catch (_) {}
      }

      cctvGrid.innerHTML = '<div class="cctv-error">Camera data unavailable</div>';
      cctvStatus.textContent = 'No camera data';
    }

    function showSingleCamera(cam) {
      cctvOverlay.style.display = 'flex';
      cctvTitle.textContent = `[ CAMERA | ${cam.name.toUpperCase()} ]`;
      cctvMeta.textContent = `${Number(cam.lat).toFixed(4)} deg, ${Number(cam.lon).toFixed(4)} deg`;
      cctvExternal.style.display = 'none';
      clearInterval(cctvRefreshTimer);
      cctvCurrentCams = [];
      cctvFocusedCamKey = null;

      if (!cam.imageUrl) {
        cctvStatus.textContent = 'Known camera location - no live feed available';
        cctvGrid.innerHTML = `
      <div class="cctv-nostream">
        <div class="cctv-nostream-icon">CAM</div>
        <div class="cctv-nostream-msg">
          <strong>${cam.name}</strong><br>
          ${Number(cam.lat).toFixed(5)} deg, ${Number(cam.lon).toFixed(5)} deg<br><br>
          Known camera position. Live feed not directly accessible.<br>
          Close this panel and click <strong>Open More -></strong> for external feeds.
        </div>
      </div>`;
        return;
      }

      cctvStatus.textContent = 'Live feed | auto-refresh 5s';
      cctvGrid.innerHTML = '';
      const cell = document.createElement('div');
      cell.className = 'cam-cell cam-single';
      const img = document.createElement('img');
      img.className = 'cam-img cam-img-large';
      img.src = cam.imageUrl;
      img.onerror = () => cell.classList.add('cam-error');
      const label = document.createElement('div');
      label.className = 'cam-label';
      label.textContent = cam.name;
      cell.appendChild(img);
      cell.appendChild(label);
      cctvGrid.appendChild(cell);
      cctvRefreshTimer = setInterval(() => {
        img.src = '';
        img.src = cam.imageUrl;
      }, 5000);
    }

    async function openEventCCTV(ev) {
      if (!ev || !Number.isFinite(Number(ev.lat)) || !Number.isFinite(Number(ev.lon))) return;
      closeCCTV();
      cctvOverlay.style.display = 'flex';
      cctvTitle.textContent = `[ EVENT CCTV | ${(ev.location || 'UNKNOWN').toUpperCase()} ]`;
      cctvMeta.textContent = `${Number(ev.lat).toFixed(4)} deg, ${Number(ev.lon).toFixed(4)} deg | ${ev.eventType || 'Event'}`;
      cctvGrid.innerHTML = '<div class="cctv-loading">Loading nearby event cameras...</div>';
      cctvStatus.textContent = 'Searching Windy webcams near event...';
      cctvExternal.href = `https://www.google.com/search?q=${encodeURIComponent((ev.location || 'location') + ' live camera')}`;
      cctvExternal.style.display = 'inline';
      cctvExternal.textContent = 'Open More ->';
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(Number(ev.lon), Number(ev.lat), 15000),
        duration: 1.6,
      });
      try {
        const cams = await fetchWindyCameras(Number(ev.lat), Number(ev.lon), 90);
        if (Array.isArray(cams) && cams.length) {
          cctvStatus.textContent = `${cams.length} nearby webcams | click a preview`;
          renderCamImages(cams);
          plotCamerasOnGlobe(cams);
          return;
        }
        cctvGrid.innerHTML = '<div class="cctv-error">No nearby live cameras found for this event.</div>';
        cctvStatus.textContent = 'No nearby cameras';
      } catch (err) {
        cctvGrid.innerHTML = `<div class="cctv-error">Nearby cameras unavailable: ${err.message}</div>`;
        cctvStatus.textContent = 'Event CCTV unavailable';
      }
    }

    const closeButton = document.getElementById('cctv-close');
    if (closeButton) closeButton.addEventListener('click', closeCCTV);
    cctvOverlay.addEventListener('click', (e) => { if (e.target === cctvOverlay) closeCCTV(); });

    return {
      openCCTV,
      showSingleCamera,
      openEventCCTV,
      closeCCTV,
      plotCamerasOnGlobe,
    };
  }

  global.initWorldViewCCTV = initWorldViewCCTV;
})(window);
