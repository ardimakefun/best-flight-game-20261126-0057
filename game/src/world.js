// Game world state: 10 canyon rings, missions, fuel/hull, checkpoints, scoring, and particles.

import { BONUS_GATE, MISSIONS, WORLD_BOUNDS } from './config.js';
import { clamp, lerp } from './math3d.js';
import { buildArches, buildMesas, buildSceneryProps, canyonCenterX, terrainHeight } from './terrain.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CRASH = 'crash';
export const SCREEN_WIN = 'win';
export const SCREEN_FAIL = 'fail';

export function createWorld() {
  const mesas = buildMesas();
  const scenery = buildSceneryProps();
  const arches = buildArches();

  const state = {
    missionIndex: 0,
    screen: SCREEN_TITLE,
    timeSec: 0,
    flightTime: 0,
    score: 0,
    bestScore: 0,
    streak: 0,
    maxStreak: 0,
    ringsPassed: 0,
    ringsMissed: 0,
    crashes: 0,
    lastCheckpointIndex: -1,
    clearedToLand: false,
    landingGrade: '',
    crashReason: '',
    touchdownFpm: 0,
    bannerText: '',
    bannerColor: '#ffbe4d',
    bannerTimer: 0,
    alertFlash: 0,
    winFlash: 0,
    crashTimer: 0,
    cameraShake: 0,
    camMode: 'chase', // 'chase' | 'cockpit'
    invertPitch: false,
    muted: false,
    events: {
      ringHit: false,
      ringBullseye: false,
      ringMiss: false,
      crash: false,
      touchdown: false,
      win: false,
      fail: false,
    },
    plane: {
      pos: { x: 0, y: WORLD_BOUNDS.departureY + 2.4, z: -120 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0.03,
      roll: 0,
      throttle: 0.72,
      speed: 0,
      vsi: 0,
      fuel: 100,
      hull: 100,
      engineTemp: 42,
      onGround: true,
      propAngle: 0,
      aileronInput: 0,
      elevatorInput: 0,
    },
    rings: [],
    particles: [],
    trails: [],
    mesas,
    scenery,
    arches,
  };

  function buildRings(mission) {
    const list = [];
    const total = WORLD_BOUNDS.ringCount;
    const zStart = 420;
    const zEnd = 4180;

    for (let i = 0; i < total; i += 1) {
      const f = i / (total - 1);
      const z = lerp(zStart, zEnd, f);
      const cx = canyonCenterX(z);
      // Slight lateral slalom inside canyon width so pilot banks gracefully
      const sway = Math.sin(i * 1.45 + 0.4) * 18;
      const x = cx + sway;
      const floorY = terrainHeight(x, z);
      const baseHeight = 42 + Math.sin(i * 1.2 + 0.5) * 11 + mission.ringHeightBias;
      const y = Math.max(floorY + 26, WORLD_BOUNDS.departureY + baseHeight);

      // Compute tangent yaw along canyon so ring faces oncoming flight path
      const nextCx = canyonCenterX(z + 40);
      const yaw = Math.atan2(nextCx - cx, 40);

      const isBonus = i === BONUS_GATE.index;
      list.push({
        id: i,
        x,
        y,
        z,
        yaw,
        radius: isBonus ? Math.round(mission.ringRadius * BONUS_GATE.radiusScale) : mission.ringRadius,
        isBonus,
        passed: false,
        missed: false,
        flash: 0,
      });
    }
    return list;
  }

  function showBanner(text, color = '#ffbe4d', duration = 2.6) {
    state.bannerText = text;
    state.bannerColor = color;
    state.bannerTimer = duration;
  }

  function spawnBurst(x, y, z, color, count, speed = 26) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.35) * Math.PI;
      const sp = speed * (0.4 + Math.random() * 0.9);
      state.particles.push({
        x,
        y,
        z,
        vx: Math.cos(a) * Math.cos(b) * sp,
        vy: Math.sin(b) * sp + 6,
        vz: Math.sin(a) * Math.cos(b) * sp,
        life: 0.45 + Math.random() * 0.5,
        maxLife: 0.95,
        size: 1.8 + Math.random() * 2.8,
        color,
      });
    }
  }

  function setDemoPose(t = 0) {
    // Showcase pose for the Start Screen: gliding in chase view right over river & canyon toward Ring 1
    const mission = MISSIONS[state.missionIndex];
    state.rings = buildRings(mission);
    const z = 195 + Math.sin(t * 0.35) * 35;
    const x = canyonCenterX(z) + Math.sin(t * 0.45) * 10;
    const nextX = canyonCenterX(z + 45);
    state.plane.pos = { x, y: 60 + Math.sin(t * 0.7) * 3.5, z };
    state.plane.yaw = Math.atan2(nextX - x, 45);
    state.plane.pitch = 0.04 + Math.sin(t * 0.6) * 0.03;
    state.plane.roll = Math.sin(t * 0.55) * 0.16;
    state.plane.speed = 62;
    state.plane.vel = {
      x: Math.sin(state.plane.yaw) * 62,
      y: 1.5,
      z: Math.cos(state.plane.yaw) * 62,
    };
    state.plane.throttle = 0.74;
    state.plane.fuel = 96;
    state.plane.hull = 100;
    state.plane.vsi = 120;
    state.plane.onGround = false;
    state.plane.propAngle = t * 34;
    state.plane.aileronInput = state.plane.roll * 1.4;
    state.plane.elevatorInput = 0.15;
  }

  function reset(startPlaying = true) {
    const mission = MISSIONS[state.missionIndex];
    state.rings = buildRings(mission);
    state.particles = [];
    state.trails = [];
    state.flightTime = 0;
    state.score = 0;
    state.streak = 0;
    state.maxStreak = 0;
    state.ringsPassed = 0;
    state.ringsMissed = 0;
    state.crashes = 0;
    state.lastCheckpointIndex = -1;
    state.clearedToLand = false;
    state.landingGrade = '';
    state.touchdownFpm = 0;
    state.alertFlash = 0;
    state.winFlash = 0;
    state.crashTimer = 0;
    state.cameraShake = 0;

    // Position on departure desert airstrip ready for takeoff roll
    const startZ = WORLD_BOUNDS.departureZStart + 38;
    const startX = canyonCenterX(startZ);
    const groundY = terrainHeight(startX, startZ);

    state.plane.pos = { x: startX, y: groundY + 2.4, z: startZ };
    state.plane.vel = { x: 0, y: 0, z: 10 };
    state.plane.yaw = 0;
    state.plane.pitch = 0.04;
    state.plane.roll = 0;
    state.plane.throttle = 0.78;
    state.plane.speed = 10;
    state.plane.vsi = 0;
    state.plane.fuel = 100;
    state.plane.hull = 100;
    state.plane.engineTemp = 45;
    state.plane.onGround = true;
    state.plane.aileronInput = 0;
    state.plane.elevatorInput = 0;

    if (startPlaying) {
      state.screen = SCREEN_PLAY;
      showBanner('FULL THROTTLE! ACCELERATE & PULL UP (W / ↑) TO TAKE OFF', '#5ee7ff', 3.4);
    } else {
      state.screen = SCREEN_TITLE;
      setDemoPose(0);
    }
  }

  function respawnAtCheckpoint() {
    const idx = state.lastCheckpointIndex;
    const nextRing = state.rings.find((r) => !r.passed && !r.missed) || state.rings[state.rings.length - 1];
    let rx;
    let ry;
    let rz;
    let ryaw;

    if (idx >= 0 && state.rings[idx]) {
      const cp = state.rings[idx];
      rz = cp.z + 32;
      rx = cp.x;
      ry = Math.max(terrainHeight(rx, rz) + 34, cp.y + 4);
      ryaw = cp.yaw;
    } else {
      rz = 180;
      rx = canyonCenterX(rz);
      ry = Math.max(terrainHeight(rx, rz) + 42, 62);
      ryaw = Math.atan2(canyonCenterX(rz + 40) - rx, 40);
    }

    if (nextRing && rz > nextRing.z - 60) {
      rz = nextRing.z - 120;
      rx = canyonCenterX(rz);
      ry = Math.max(terrainHeight(rx, rz) + 36, nextRing.y + 6);
      ryaw = Math.atan2(nextRing.x - rx, nextRing.z - rz);
    }

    state.plane.pos = { x: rx, y: ry, z: rz };
    state.plane.yaw = ryaw;
    state.plane.pitch = 0.02;
    state.plane.roll = 0;
    state.plane.throttle = 0.72;
    state.plane.speed = 54;
    state.plane.vel = {
      x: Math.sin(ryaw) * 54,
      y: 0,
      z: Math.cos(ryaw) * 54,
    };
    state.plane.onGround = false;
    state.screen = SCREEN_PLAY;
    showBanner(`CHECKPOINT RECOVERY  •  NEXT: GATE ${clamp(idx + 2, 1, WORLD_BOUNDS.ringCount)}`, '#ffbe4d', 2.6);
  }

  function clearEvents() {
    state.events.ringHit = false;
    state.events.ringBullseye = false;
    state.events.ringMiss = false;
    state.events.crash = false;
    state.events.touchdown = false;
    state.events.win = false;
    state.events.fail = false;
  }

  function stepAmbient(dt) {
    state.timeSec += dt;
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    state.alertFlash = Math.max(0, state.alertFlash - dt * 1.6);
    state.winFlash = Math.max(0, state.winFlash - dt * 0.9);
    state.cameraShake = Math.max(0, state.cameraShake - dt * 2.2);

    for (let i = 0; i < state.rings.length; i += 1) {
      if (state.rings[i].flash > 0) state.rings[i].flash = Math.max(0, state.rings[i].flash - dt * 1.8);
    }

    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 12 * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    for (let i = state.trails.length - 1; i >= 0; i -= 1) {
      state.trails[i].life -= dt;
      if (state.trails[i].life <= 0) state.trails.splice(i, 1);
    }
  }

  reset(false);

  return {
    state,
    reset,
    setDemoPose,
    respawnAtCheckpoint,
    showBanner,
    spawnBurst,
    clearEvents,
    stepAmbient,
  };
}
