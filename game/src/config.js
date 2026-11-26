// Game configuration, aerodynamics, mission profiles, and dawn color palette.

export const VIEW = {
  width: 1280,
  height: 720,
  fov: 880,
  nearZ: 2.2,
  farZ: 1450,
};

export const STEP = 1 / 60;
export const BEST_SCORE_KEY = 'canyon_dawn_patrol_best_v1';

// Low eastern sunrise shining down the canyon corridor
export const SUN_DIR = { x: 0.22, y: 0.25, z: 0.94 };

// Flight dynamics tuned for crisp, intuitive keyboard flight at every speed
export const FLIGHT = {
  gravity: 12.0,
  maxThrust: 38.0,
  dragCoeff: 0.0052,
  stallSpeed: 28.0,
  takeoffSpeed: 27.0,
  cruiseSpeed: 64.0,
  maxSpeed: 105.0,
  pitchRate: 1.18,
  rollRate: 2.25,
  turnRate: 0.78,
  pitchReturn: 1.15,
  rollReturn: 1.35,
  fuelBurnIdle: 0.28,
  fuelBurnFull: 2.1,
  ceilingAlt: 320,
};

export const WORLD_BOUNDS = {
  departureZStart: -160,
  departureZEnd: 140,
  departureY: 12,
  riverY: 4,
  runwayZStart: 4520,
  runwayZEnd: 5120,
  runwayHalfWidth: 28,
  runwayY: 12,
  ringCount: 10,
};

export const BONUS_GATE = {
  index: 3, // Gate 4: one gold bonus gate per flight
  radiusScale: 0.78, // Smaller aperture than a standard gate
  scoreMult: 3, // Worth 3x points
};

export const MISSIONS = [
  {
    id: 'patrol',
    name: 'Dawn Patrol',
    subtitle: '10 Rings + Runway Landing',
    ringHeightBias: 0,
    ringRadius: 28,
    crosswind: 0,
    parTime: 105,
    scoreMult: 1.0,
  },
  {
    id: 'skim',
    name: 'River Skim',
    subtitle: 'Low Gorge Gates 1.35x',
    ringHeightBias: -10,
    ringRadius: 24,
    crosswind: 1.2,
    parTime: 100,
    scoreMult: 1.35,
  },
  {
    id: 'express',
    name: 'Sunrise Express',
    subtitle: 'Crosswinds 1.6x',
    ringHeightBias: 4,
    ringRadius: 22,
    crosswind: 2.8,
    parTime: 86,
    scoreMult: 1.6,
  },
];

export const PALETTE = {
  skyZenith: [16, 11, 40],
  skyUpper: [64, 26, 74],
  skyMid: [162, 58, 48],
  skyWarm: [236, 118, 42],
  skyHorizon: [255, 206, 106],
  hazeColor: [236, 134, 68],
  hudAmber: '#ffbe4d',
  hudCyan: '#5ee7ff',
  hudGreen: '#5cf29c',
  hudRed: '#ff5c4d',
  hudCream: '#fff4d6',
  hudPanel: 'rgba(11, 13, 22, 0.78)',
};
