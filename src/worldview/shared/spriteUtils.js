const svgCache = {};
const textImageCache = new Map();
export function planeSVG(heading) {
    const h = Math.round(heading / 15) * 15 % 360;
    if (!svgCache[h]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><g transform="rotate(${h},10,10)"><polygon points="10,1 13,19 10,16 7,19" fill="#ff6b35" opacity="0.95"/></g></svg>`;
      svgCache[h] = 'data:image/svg+xml;base64,' + btoa(svg);
    }
    return svgCache[h];
  }
export function textBillboardImage(text, opts = {}) {
    const label = String(text || '');
    const font = opts.font || '600 20px "Segoe UI", "Inter", Arial, sans-serif';
    const color = opts.color || '#2fbf71';
    const padX = Number.isFinite(opts.padX) ? opts.padX : 8;
    const height = Number.isFinite(opts.height) ? opts.height : 30;
    const key = `${label}|${font}|${color}|${padX}|${height}`;
    if (textImageCache.has(key)) return textImageCache.get(key);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(label).width + padX * 2);
    canvas.width = width;
    canvas.height = height;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.clearRect(0, 0, width, height);
    ctx.fillText(label, padX, Math.floor(height / 2));

    const image = canvas.toDataURL('image/png');
    textImageCache.set(key, image);
    return image;
  }
export function countryTextImage(name) {
    return textBillboardImage(name, {
      font: '600 20px "Segoe UI", "Inter", Arial, sans-serif',
      color: '#2fbf71',
      padX: 8,
      height: 30,
    });
  }
export function cityTextImage(name) {
    return textBillboardImage(name, {
      font: '600 18px "Segoe UI", "Inter", Arial, sans-serif',
      color: '#6bd3ff',
      padX: 7,
      height: 28,
    });
  }
export function eventTextImage(name) {
    return textBillboardImage(name, {
      font: '600 18px "Segoe UI", "Inter", Arial, sans-serif',
      color: '#ffd166',
      padX: 7,
      height: 28,
    });
  }
export function gpsTextImage(name) {
    return textBillboardImage(name, {
      font: '600 18px "Segoe UI", "Inter", Arial, sans-serif',
      color: '#ff6b6b',
      padX: 7,
      height: 28,
    });
  }


