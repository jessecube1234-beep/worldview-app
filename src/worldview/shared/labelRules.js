import { getCesium } from './runtimeGlobals.js';

const Cesium = getCesium();

export const COUNTRY_LABEL_OFFSETS = {
    'United States': { lon: -3.2, lat: -0.7 },
    'United States of America': { lon: -3.2, lat: -0.7 },
    'Canada': { lon: -3.0, lat: -1.0 },
    'Russian Federation': { lon: -9.0, lat: -0.8 },
    'Russia': { lon: -9.0, lat: -0.8 },
    'People\'s Republic of China': { lon: -1.2, lat: 0.4 },
    'China': { lon: -1.2, lat: 0.4 },
    'Australia': { lon: 0.2, lat: 0.8 },
    'Brazil': { lon: -0.8, lat: 0.3 },
    'India': { lon: -0.5, lat: 0.4 },
    'Greenland': { lon: -2.0, lat: -0.2 },
  };
export function normalizeLonDelta(deg) {
    let d = deg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }
export function lonInRectangle(lonDeg, rect) {
    const lon = Cesium.Math.toRadians(lonDeg);
    if (rect.west <= rect.east) return lon >= rect.west && lon <= rect.east;
    return lon >= rect.west || lon <= rect.east;
  }
export function getCountryLabelOffset(name) {
    return COUNTRY_LABEL_OFFSETS[name] || { lon: 0, lat: 0 };
  }
export function countryLabelRuleByHeight(heightMeters) {
    if (heightMeters > 22_000_000) return { max: 10, minSepDeg: 18 };
    if (heightMeters > 16_000_000) return { max: 18, minSepDeg: 12 };
    if (heightMeters > 12_000_000) return { max: 40, minSepDeg: 8 };
    if (heightMeters > 8_000_000) return { max: 90, minSepDeg: 5.5 };
    if (heightMeters > 5_000_000) return { max: 160, minSepDeg: 3.5 };
    return { max: 999, minSepDeg: 0 };
  }


