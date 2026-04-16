export const REGIONS = {
  world: { lon: 0, lat: 20, alt: 18_000_000, label: 'Global view' },
  mideast: { lon: 42, lat: 27, alt: 3_500_000, label: 'Middle East' },
  europe: { lon: 15, lat: 50, alt: 4_000_000, label: 'Europe' },
  eastasia: { lon: 118, lat: 30, alt: 5_000_000, label: 'East Asia' },
  northam: { lon: -95, lat: 45, alt: 8_000_000, label: 'North America' },
  africa: { lon: 20, lat: 5, alt: 7_000_000, label: 'Africa' },
};

export const POLL_MS_ACTIVE = {
  iss: 10_000,
  satPos: 30_000,
  flights: 60_000,
  satellites: 3_600_000,
  gps: 60_000,
  events: 900_000,
};

export const POLL_MS_HIDDEN = {
  iss: 30_000,
  satPos: 60_000,
  flights: 300_000,
  satellites: 3_600_000,
  gps: 300_000,
  events: 1_800_000,
};
