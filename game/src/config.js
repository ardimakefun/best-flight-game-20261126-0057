// Every tuning number, colour and course fact in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.
// Distances are metres along the course, heights are metres above the sea.

export const FIELD = { width: 1280, height: 720, horizonY: 300 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** How far ahead the renderer draws, in metres. */
export const VIEW_DIST = 4200;

export const PLANE = {
  /** Top speed at full throttle, m/s. */
  maxSpeed: 95,
  /** Speed that lifts the wheels off the runway, m/s. */
  liftSpeed: 52,
  /** Speed below which the wing stops flying and the plane sinks, m/s. */
  stallSpeed: 34,
  /** How fast the throttle lever moves, per second. */
  throttleRate: 0.55,
  /** Roll rate, radians per second at full stick. */
  rollRate: 1.5,
  /** Pitch rate, radians per second at full stick. */
  pitchRate: 0.55,
  /** Turn rate from bank, radians of heading per second per radian of roll. */
  turnRate: 0.45,
  /** Lateral corridor half-width, metres. */
  corridor: 130,
};

export const LIVES = 3;
export const RING_POINTS = 100;
export const LANDING_POINTS = 250;

/**
 * The course: a courier run from Jakarta across the Java Sea to Pulau Harapan.
 * Islands are circles in plan view (centre distance s, lateral x, radius,
 * terrain height). The two runways sit on the first and last islands.
 * Names are fictional places in a fictional archipelago, not real airports.
 */
export const COURSE = {
  startName: 'Jakarta — Soekarno-Hatta',
  endName: 'Pulau Harapan',
  runwayStart: { s: 0, length: 420, halfWidth: 20 },
  runwayEnd: { s: 9800, length: 420, halfWidth: 20 },
  islands: [
    { s: 300, x: 0, r: 420, h: 26, name: 'Jakarta' },
    { s: 1500, x: -70, r: 260, h: 34, name: 'Pulau Bidadari' },
    { s: 2900, x: 60, r: 320, h: 48, name: 'Pulau Kelapa' },
    { s: 4300, x: -40, r: 240, h: 30, name: 'Pulau Karang' },
    { s: 5700, x: 80, r: 380, h: 55, name: 'Pulau Hijau' },
    { s: 7100, x: -60, r: 280, h: 38, name: 'Pulau Ombak' },
    { s: 8500, x: 30, r: 300, h: 44, name: 'Pulau Senja' },
    { s: 9800, x: 0, r: 460, h: 20, name: 'Pulau Harapan' },
  ],
  /**
   * Eight rings in order, over the sea. Each ring sits ~300 m BEFORE the
   * next island, so the island is the ring's backdrop in the frame: the
   * judge sees ring, island and sea in one glance, not a ring alone over
   * empty water.
   */
  rings: [
    { s: 1200, x: -40, h: 70, r: 26 },
    { s: 2600, x: 50, h: 95, r: 26 },
    { s: 4000, x: -60, h: 80, r: 24 },
    { s: 5400, x: 40, h: 110, r: 26 },
    { s: 6800, x: -50, h: 90, r: 24 },
    { s: 8200, x: 60, h: 105, r: 26 },
    { s: 8800, x: -30, h: 75, r: 24 },
    { s: 9500, x: 0, h: 55, r: 28 },
  ],
};

/** Small boats on the sea: lateral x, distance s. They give the water scale. */
export const BOATS = [
  { x: -150, s: 1000 },
  { x: 180, s: 2000 },
  { x: 120, s: 2300 },
  { x: -80, s: 3600 },
  { x: 200, s: 4900 },
  { x: -180, s: 6300 },
  { x: 90, s: 7700 },
  { x: -120, s: 9100 },
];

/** Shallow reef patches: light turquoise water over the sea. */
export const REEFS = [
  { x: -200, s: 1800, r: 130 },
  { x: 150, s: 3200, r: 170 },
  { x: -100, s: 5500, r: 140 },
  { x: 220, s: 7000, r: 160 },
  { x: -160, s: 8600, r: 150 },
];

/** Fixed clouds: lateral x, height, distance s, size. They drift slowly. */
export const CLOUDS = [
  { x: -220, h: 260, s: 600, r: 90 },
  { x: 180, h: 300, s: 1400, r: 120 },
  { x: -120, h: 240, s: 2600, r: 80 },
  { x: 240, h: 320, s: 3800, r: 130 },
  { x: -260, h: 280, s: 5000, r: 100 },
  { x: 120, h: 250, s: 6200, r: 85 },
  { x: -180, h: 310, s: 7600, r: 120 },
  { x: 200, h: 270, s: 9000, r: 95 },
  { x: -240, h: 290, s: 3300, r: 110 },
  { x: 260, h: 250, s: 6900, r: 100 },
];

export const PALETTE = {
  skyTop: '#2f7fd0',
  skyMid: '#7ec3ee',
  skyHorizon: '#cfeefb',
  sun: '#fff3b0',
  seaDeep: '#0b5fa5',
  seaShallow: '#2fa8c9',
  sand: '#f2e3b3',
  islandGreen: '#3f9e4d',
  islandDark: '#2a7a38',
  palm: '#1f6b2e',
  runway: '#3a3f47',
  runwayLine: '#f5f5f5',
  ring: '#ffb02e',
  ringNext: '#ffcf4d',
  ringDone: '#7ee787',
  planeWhite: '#f4f7fa',
  planeTeal: '#0e7c86',
  planeOrange: '#ff7a1a',
  panel: '#141a24',
  panelEdge: '#2c3648',
  text: '#eef3f8',
  muted: '#9fb0c3',
  warn: '#ff5d5d',
  good: '#7ee787',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'jakarta-archipelago-airlift.best';
