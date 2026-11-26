// Boot and main fixed-timestep game loop for Canyon Dawn Patrol.

import { drawAircraft, drawAircraftShadow } from './aircraft.js';
import { createAudio } from './audio.js';
import { createCamera, updateCamera } from './camera.js';
import { BEST_SCORE_KEY, MISSIONS, STEP, VIEW } from './config.js';
import { drawHUD } from './hud.js';
import {
  ACTION_CAMERA,
  ACTION_INVERT,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  ACTION_START,
  createInput,
} from './input.js';
import { stepPhysics } from './physics.js';
import { drawScene } from './renderer.js';
import { terrainHeight } from './terrain.js';
import { createWorld, SCREEN_CRASH, SCREEN_FAIL, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './world.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');

const world = createWorld();
const camera = createCamera();
const input = createInput(canvas);
const audio = createAudio();

const view = { scale: 1, x: 0, y: 0 };

function readBestScore() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_SCORE_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score) {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Ignore storage denial in private mode
  }
}

world.state.bestScore = readBestScore();

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(320, Math.round(window.innerWidth * dpr));
  const h = Math.max(240, Math.round(window.innerHeight * dpr));
  canvas.width = w;
  canvas.height = h;
  view.scale = Math.min(w / VIEW.width, h / VIEW.height);
  view.x = (w - VIEW.width * view.scale) * 0.5;
  view.y = (h - VIEW.height * view.scale) * 0.5;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function announce(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function handleActions() {
  const s = world.state;
  let actions = input.takeActions();
  let missionPick = input.takeMissionSelect();
  const click = input.consumeClick();

  // Check if a click on the Title Screen landed on one of the 3 sortie pills
  if (click && s.screen === SCREEN_TITLE) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const vx = ((click.clientX - rect.left) * dpr - view.x) / view.scale;
    const vy = ((click.clientY - rect.top) * dpr - view.y) / view.scale;
    const pillW = 312;
    const gap = 16;
    const pillsX = VIEW.width * 0.5 - (pillW * 3 + gap * 2) * 0.5;
    if (vy >= 88 && vy <= 146) {
      for (let i = 0; i < MISSIONS.length; i += 1) {
        const px = pillsX + i * (pillW + gap);
        if (vx >= px && vx <= px + pillW) {
          missionPick = i;
          actions &= ~ACTION_START;
          break;
        }
      }
    }
  }

  if (missionPick >= 0 && s.screen === SCREEN_TITLE && missionPick < MISSIONS.length) {
    s.missionIndex = missionPick;
    world.setDemoPose(s.timeSec);
    announce(`Selected ${MISSIONS[missionPick].name}`);
  }

  if (actions & ACTION_MUTE) {
    s.muted = !s.muted;
  }
  if (actions & ACTION_CAMERA) {
    s.camMode = s.camMode === 'chase' ? 'cockpit' : 'chase';
  }
  if (actions & ACTION_INVERT) {
    s.invertPitch = !s.invertPitch;
  }

  if (actions & ACTION_RESTART) {
    audio.init();
    world.reset(true);
    announce('Sortie restarted on departure airstrip.');
    return;
  }

  if (actions & ACTION_PAUSE) {
    if (s.screen === SCREEN_PLAY) {
      s.screen = SCREEN_PAUSED;
      announce('Flight paused.');
    } else if (s.screen === SCREEN_PAUSED) {
      s.screen = SCREEN_PLAY;
      announce('Flight resumed.');
    }
  }

  if (actions & ACTION_START) {
    audio.init();
    if (s.screen === SCREEN_TITLE || s.screen === SCREEN_WIN || s.screen === SCREEN_FAIL) {
      world.reset(true);
      announce('Takeoff roll started. Accelerate and pull up to climb.');
    } else if (s.screen === SCREEN_PAUSED) {
      s.screen = SCREEN_PLAY;
      announce('Flight resumed.');
    }
  }
}

let accumulator = 0;
let lastTs = performance.now();

function stepFrame(now) {
  requestAnimationFrame(stepFrame);
  const frameDt = Math.min((now - lastTs) / 1000, 0.1);
  lastTs = now;

  handleActions();

  const s = world.state;
  const controls = input.readFlightControls();

  accumulator += frameDt;
  while (accumulator >= STEP) {
    if (s.screen === SCREEN_TITLE) {
      world.stepAmbient(STEP);
      world.setDemoPose(s.timeSec);
      updateCamera(camera, s, input, STEP);
    } else if (s.screen === SCREEN_PLAY || s.screen === SCREEN_CRASH) {
      stepPhysics(world, controls, STEP);
      updateCamera(camera, s, input, STEP);
      audio.update(s);
    } else if (s.screen === SCREEN_WIN || s.screen === SCREEN_FAIL) {
      world.stepAmbient(STEP);
      updateCamera(camera, s, input, STEP);
      audio.update(s);
      if (s.score > readBestScore()) saveBestScore(s.score);
    } else {
      audio.update(s);
    }
    accumulator -= STEP;
  }

  // Paint frame scaled to 1280x720 virtual resolution
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d0610';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

  drawScene(ctx, world, camera);
  drawAircraftShadow(ctx, s.plane, camera);
  if (s.screen !== SCREEN_CRASH) {
    drawAircraft(ctx, s.plane, camera, s.timeSec, s.camMode);
  }
  drawHUD(ctx, world, camera);

  // Expose live read-only telemetry for inspection
  const groundY = terrainHeight(s.plane.pos.x, s.plane.pos.z);
  const nextRing = s.rings.find((r) => !r.passed && !r.missed) || null;
  window.__flightTelemetry = {
    screen: s.screen,
    score: s.score,
    ringsPassed: s.ringsPassed,
    ringsMissed: s.ringsMissed,
    crashes: s.crashes,
    clearedToLand: s.clearedToLand,
    onGround: s.plane.onGround,
    pos: { ...s.plane.pos },
    yaw: s.plane.yaw,
    pitch: s.plane.pitch,
    roll: s.plane.roll,
    nextRing: nextRing ? { id: nextRing.id, x: nextRing.x, y: nextRing.y, z: nextRing.z, radius: nextRing.radius, isBonus: !!nextRing.isBonus } : null,
    cam: { pos: { ...camera.pos }, yaw: camera.yaw, pitch: camera.pitch, roll: camera.roll, fov: camera.fov, chaseZoom: camera.chaseZoom },
    altFt: Math.round((s.plane.pos.y - groundY) * 3.28),
    speedKt: Math.round(s.plane.speed * 1.944),
    fuel: Math.round(s.plane.fuel),
    hull: Math.round(s.plane.hull),
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && world.state.screen === SCREEN_PLAY) {
    world.state.screen = SCREEN_PAUSED;
  }
});

announce('Canyon Dawn Patrol ready. Press Space or click to fly.');
requestAnimationFrame(stepFrame);
