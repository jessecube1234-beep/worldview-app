import { getCityCamInfo } from '../shared/cctvCities.js';
import { getCesium } from '../shared/runtimeGlobals.js';

export function initWorldViewCCTV(deps) {
    const Cesium = getCesium();
    const { viewer, state } = deps;
    const camSvg = (() => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="14" viewBox="0 0 20 14"><rect x="1" y="2" width="12" height="10" rx="2" fill="#ff6b35" opacity="0.95"/><polygon points="13,4 19,1 19,13 13,10" fill="#ff6b35" opacity="0.85"/><circle cx="7" cy="7" r="2.8" fill="#fff" opacity="0.7"/></svg>`;
      return 'data:image/svg+xml;base64,' + btoa(svg);
    })();

    const safeGetCityCamInfo = typeof getCityCamInfo === 'function'
      ? getCityCamInfo
      : (city) => {
          const query = city.country === 'US'
            ? `${city.name} traffic cameras live`
            : `${city.name} live webcam CCTV street camera`;
          return {
            label: city.name,
            windRadius: city.country === 'US' ? 90 : 60,
            external: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          };
        };

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
      const info = safeGetCityCamInfo(city);
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
    const overlayClickHandler = (e) => {
      if (e.target === cctvOverlay) closeCCTV();
    };
    if (closeButton) closeButton.addEventListener('click', closeCCTV);
    cctvOverlay.addEventListener('click', overlayClickHandler);

    function destroy() {
      closeCCTV();
      if (closeButton) closeButton.removeEventListener('click', closeCCTV);
      cctvOverlay.removeEventListener('click', overlayClickHandler);
    }

    return {
      openCCTV,
      showSingleCamera,
      openEventCCTV,
      closeCCTV,
      plotCamerasOnGlobe,
      destroy,
    };
  }




