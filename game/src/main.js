import * as THREE from 'three';
import { createScoutAircraft } from './aircraft.js';
import { createProceduralAudio } from './audio.js';
import { createCockpitRig } from './cockpit.js';
import { createAviationHud } from './hud.js';
import { createSortieMissionManager } from './missions.js';
import { createFlightState, stepFlightAerodynamics } from './physics.js';
import { DEST_RUNWAY_X, WORLD_BOUNDS, createCanyonWorld } from './world.js';

const FIXED_DT = 1 / 60;
const canvas = document.getElementById('flight-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.35, 11000);
const world = createCanyonWorld(scene); const aircraft = createScoutAircraft(scene); const cockpit = createCockpitRig(aircraft.root);
const mission = createSortieMissionManager(scene); const hud = createAviationHud(); const audio = createProceduralAudio();

let selectedSortieIndex = 0; let screenState = 'start'; let isCockpitView = false; let invertPitch = false;
const mouseYoke = { enabled: false, x: 0, y: 0 };
let flightState = createFlightState(mission.mode);
const keys = new Set();
const lookOffset = { yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0 };
let wheelAccum = 0;
const smoothCamPos = new THREE.Vector3(16, 30, WORLD_BOUNDS.startRunwayZ + 160);
const smoothCamTarget = new THREE.Vector3(0, 28, WORLD_BOUNDS.startRunwayZ + 140);

function resetSortie(modeIdx, startPlaying) {
  selectedSortieIndex = modeIdx; mission.setup(modeIdx); flightState = createFlightState(mission.mode);
  if (startPlaying) flightState.fuel = Math.min(100, flightState.fuel + hud.consumeQueuedFuel());
  aircraft.resetTrails(); hud.setSelectedSortie(modeIdx);
  if (startPlaying) {
    screenState = 'playing'; hud.setScreen('playing'); isCockpitView = false; cockpit.setActive(false); aircraft.setCockpitMode(false);
    smoothCamPos.set(flightState.pos.x, flightState.pos.y + 3.2, flightState.pos.z + 12.5);
    smoothCamTarget.set(flightState.pos.x, flightState.pos.y + 1.0, flightState.pos.z - 22);
    hud.announce(`Sortie started: ${mission.mode.title}.`);
  } else {
    screenState = 'start'; hud.setScreen('start'); isCockpitView = false; cockpit.setActive(false); aircraft.setCockpitMode(false);
    hud.announce('Canyon Dawn Patrol 3D. Select a sortie and press Space to launch.');
  }
  aircraft.updateVisuals(flightState, 0.016, 0);
  world.update(0, mission.mode.windSpeedKt, mission.mode.windDirRad, flightState.pos, mission.mode.stormMode ? 1 : 0);
}

function toggleCameraMode() {
  if (screenState !== 'playing') return;
  isCockpitView = !isCockpitView; cockpit.setActive(isCockpitView); aircraft.setCockpitMode(isCockpitView);
  lookOffset.yaw = 0; lookOffset.pitch = 0; audio.playToggle(isCockpitView);
  if (isCockpitView) { flightState.forcePanelRedraw = true; cockpit.update(flightState); flightState.forcePanelRedraw = false; }
  hud.announce(isCockpitView ? 'Cockpit camera.' : 'Chase camera.');
}

function togglePause() {
  if (screenState === 'playing') { screenState = 'paused'; hud.setScreen('paused'); hud.updateOptionsButtons(invertPitch, mouseYoke.enabled); hud.announce('Sortie paused.'); }
  else if (screenState === 'paused') { screenState = 'playing'; hud.setScreen('playing'); hud.announce('Sortie resumed.'); }
}

function handleShortcut(code) {
  if (code === 'KeyC') toggleCameraMode();
  else if (code === 'KeyF' && screenState === 'playing') { flightState.flapsDeployed = !flightState.flapsDeployed; audio.playToggle(flightState.flapsDeployed); hud.announce(flightState.flapsDeployed ? 'Flaps deployed.' : 'Flaps retracted.'); }
  else if (code === 'KeyT' && screenState === 'playing') { flightState.autoLevel = !flightState.autoLevel; audio.playToggle(flightState.autoLevel); hud.announce(flightState.autoLevel ? 'Auto-level trim enabled.' : 'Auto-level trim disabled.'); }
  else if (code === 'KeyP') togglePause();
  else if (code === 'KeyR') resetSortie(selectedSortieIndex, true);
  else if (code === 'KeyM') { const m = audio.toggleMute(); hud.setMuted(m); hud.announce(m ? 'Audio muted.' : 'Audio unmuted.'); }
  else if (code === 'KeyI') { invertPitch = !invertPitch; hud.updateOptionsButtons(invertPitch, mouseYoke.enabled); }
  else if (code === 'KeyG') { mouseYoke.enabled = !mouseYoke.enabled; mouseYoke.x = 0; mouseYoke.y = 0; hud.updateOptionsButtons(invertPitch, mouseYoke.enabled); }
  else if (code === 'KeyV' && screenState === 'playing') { if (mission.triggerSupplyDrop(flightState)) { audio.playCargoDrop(); hud.announce('Supply crate released.'); } }
  else if (screenState === 'debrief' && (code === 'Space' || code === 'Enter')) resetSortie(selectedSortieIndex, true);
}

window.addEventListener('keydown', (e) => {
  audio.unlock(); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); keys.add(e.code);
  if (screenState === 'start') {
    const num = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
    if (num >= 0) resetSortie(num, false);
    else if (e.code === 'Space' || e.code === 'Enter') resetSortie(selectedSortieIndex, true);
    return;
  }
  handleShortcut(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
document.addEventListener('visibilitychange', () => { if (document.hidden && screenState === 'playing') togglePause(); });
canvas.addEventListener('pointerdown', (e) => { audio.unlock(); if (!mouseYoke.enabled) { lookOffset.dragging = true; lookOffset.lastX = e.clientX; lookOffset.lastY = e.clientY; } });
window.addEventListener('pointermove', (e) => {
  if (mouseYoke.enabled && screenState === 'playing') { mouseYoke.x = THREE.MathUtils.clamp((e.clientX / window.innerWidth - 0.5) * 2.4, -1, 1); mouseYoke.y = THREE.MathUtils.clamp((e.clientY / window.innerHeight - 0.5) * 2.4, -1, 1); return; }
  if (!lookOffset.dragging) return;
  lookOffset.yaw = THREE.MathUtils.clamp(lookOffset.yaw - (e.clientX - lookOffset.lastX) * 0.0045, -1.25, 1.25);
  lookOffset.pitch = THREE.MathUtils.clamp(lookOffset.pitch - (e.clientY - lookOffset.lastY) * 0.0035, -0.45, 0.55);
  lookOffset.lastX = e.clientX; lookOffset.lastY = e.clientY;
});
window.addEventListener('pointerup', () => { lookOffset.dragging = false; });
window.addEventListener('wheel', (e) => { wheelAccum += e.deltaY; }, { passive: true });

document.querySelectorAll('.sortie-card').forEach((b) => b.addEventListener('click', () => { audio.unlock(); resetSortie(Number.parseInt(b.dataset.sortie ?? '0', 10), false); }));
document.querySelectorAll('.k-badge[data-key]').forEach((el) => el.addEventListener('click', () => { audio.unlock(); handleShortcut(el.dataset.key); }));
for (const [id, fn] of [
  ['launch-btn', () => { audio.unlock(); resetSortie(selectedSortieIndex, true); }],
  ['resume-btn', togglePause], ['pause-restart-btn', () => resetSortie(selectedSortieIndex, true)],
  ['debrief-retry-btn', () => resetSortie(selectedSortieIndex, true)], ['debrief-menu-btn', () => resetSortie(selectedSortieIndex, false)],
  ['refuel-btn', () => { audio.unlock(); if (hud.tryRefuel()) { audio.playToggle(true); hud.announce('Auxiliary fuel topped up.'); } }],
  ['repair-btn', () => { audio.unlock(); if (hud.tryRepair()) { audio.playToggle(true); hud.announce('Airframe repaired to 100%.'); } }],
  ['presson-btn', () => { audio.unlock(); screenState === 'start' ? resetSortie(selectedSortieIndex, true) : resetSortie((selectedSortieIndex + 1) % 5, false); }],
  ['invert-btn', () => { invertPitch = !invertPitch; hud.updateOptionsButtons(invertPitch, mouseYoke.enabled); }],
  ['yoke-btn', () => { mouseYoke.enabled = !mouseYoke.enabled; mouseYoke.x = 0; mouseYoke.y = 0; hud.updateOptionsButtons(invertPitch, mouseYoke.enabled); }],
]) document.getElementById(id).addEventListener('click', fn);
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

function buildInputSnapshot() {
  return {
    pitchUp: keys.has('KeyS') || keys.has('ArrowDown'), pitchDown: keys.has('KeyW') || keys.has('ArrowUp'),
    rollLeft: keys.has('KeyA') || keys.has('ArrowLeft'), rollRight: keys.has('KeyD') || keys.has('ArrowRight'),
    yawLeft: keys.has('KeyQ'), yawRight: keys.has('KeyE'),
    throttleUp: keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal'), throttleDown: keys.has('KeyX') || keys.has('ControlLeft') || keys.has('Minus'),
    brake: keys.has('KeyB'), invertPitch, analogPitch: mouseYoke.enabled ? mouseYoke.y : 0, analogRoll: mouseYoke.enabled ? -mouseYoke.x : 0, wheelDelta: (() => { const d = wheelAccum; wheelAccum = 0; return d; })(),
  };
}

const tmpFwd = new THREE.Vector3(); const tmpUp = new THREE.Vector3();
const tmpRight = new THREE.Vector3(); const tmpEye = new THREE.Vector3(); const tmpLook = new THREE.Vector3();

function updateCamera(dt, elapsedSec) {
  if (!lookOffset.dragging) { lookOffset.yaw = THREE.MathUtils.lerp(lookOffset.yaw, 0, Math.min(1, dt * 4.5)); lookOffset.pitch = THREE.MathUtils.lerp(lookOffset.pitch, 0, Math.min(1, dt * 4.5)); }
  const targetFov = screenState === 'playing' ? THREE.MathUtils.lerp(59, 68, THREE.MathUtils.clamp((flightState.airspeedKt - 60) / 110, 0, 1)) : 62;
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 5)); camera.updateProjectionMatrix(); }

  if (screenState === 'start') {
    camera.position.set(-15.5 + Math.sin(elapsedSec * 0.35) * 0.45, WORLD_BOUNDS.startRunwayElevation + 2.8, flightState.pos.z + 11.5);
    camera.up.set(0, 1, 0); camera.lookAt(3.5, WORLD_BOUNDS.startRunwayElevation + 3.4, flightState.pos.z - 16.0); return;
  }
  if (isCockpitView && screenState === 'playing') {
    tmpEye.copy(cockpit.eyeLocalOffset).applyQuaternion(flightState.quat).add(flightState.pos);
    tmpFwd.set(0, 0, -1).applyQuaternion(flightState.quat); tmpRight.set(1, 0, 0).applyQuaternion(flightState.quat); tmpUp.set(0, 1, 0).applyQuaternion(flightState.quat);
    tmpLook.copy(tmpEye).addScaledVector(tmpFwd, 90).addScaledVector(tmpRight, Math.sin(lookOffset.yaw) * 45).addScaledVector(tmpUp, -9.5 + Math.sin(lookOffset.pitch) * 35);
    camera.position.copy(tmpEye); camera.up.copy(tmpUp).lerp(new THREE.Vector3(0, 1, 0), 0.45).normalize(); camera.lookAt(tmpLook); return;
  }
  if (screenState === 'debrief') {
    smoothCamPos.lerp(new THREE.Vector3(flightState.pos.x + 13.5, flightState.pos.y + 3.1, flightState.pos.z + 13.5), Math.min(1, dt * 6));
    smoothCamTarget.lerp(new THREE.Vector3(flightState.pos.x - 32.0, flightState.pos.y + 3.3, flightState.pos.z - 12.0), Math.min(1, dt * 7));
    camera.position.copy(smoothCamPos); camera.up.set(0, 1, 0); camera.lookAt(smoothCamTarget); return;
  }
  tmpFwd.set(0, 0, -1).applyQuaternion(flightState.quat); tmpRight.set(1, 0, 0).applyQuaternion(flightState.quat); tmpUp.set(0, 1, 0).applyQuaternion(flightState.quat);
  const bankLead = THREE.MathUtils.clamp(-flightState.rollDeg * 0.055, -1.9, 1.9);
  smoothCamPos.lerp(new THREE.Vector3().copy(flightState.pos).addScaledVector(tmpFwd, -10.6).addScaledVector(tmpRight, bankLead + Math.sin(lookOffset.yaw) * 11).add(new THREE.Vector3(0, 2.45 + Math.sin(lookOffset.pitch) * 6, 0)), 1 - Math.exp(-9.5 * dt));
  smoothCamTarget.lerp(new THREE.Vector3().copy(flightState.pos).addScaledVector(tmpFwd, 34).add(new THREE.Vector3(0, 1.15, 0)), 1 - Math.exp(-12.0 * dt));
  camera.position.copy(smoothCamPos); camera.up.copy(new THREE.Vector3(0, 1, 0).lerp(tmpUp, 0.34).normalize()); camera.lookAt(smoothCamTarget);
}

function stepSimulation(dt, elapsedSec) {
  if (screenState === 'playing') {
    stepFlightAerodynamics(flightState, buildInputSnapshot(), mission.mode, mission.activeIndex, mission.gates.length, dt, mission.isApproachReady());
    mission.update(flightState, dt, elapsedSec);
    if (flightState.events.hullDamagedThisStep) { aircraft.spawnTouchdownDust(flightState.pos, 1.6); audio.playCrash(); hud.announce('Hard landing impact. Hull damaged.'); }
    if (flightState.events.touchdownThisStep && !flightState.events.hullDamagedThisStep) { aircraft.spawnTouchdownDust(flightState.pos, 1.45); audio.playTouchdown(); hud.announce(`Touchdown on runway, ${flightState.touchdownVsiFpm} feet per minute.`); }
    if (mission.events.gateClearedThisStep) { audio.playGateChime(mission.events.lastGateBonus); hud.announce(`Gate ${mission.activeIndex} of ${mission.gates.length} cleared.`); }
    if (mission.events.supplyDeliveredThisStep) { audio.playGateChime(true); hud.announce('Supply drop delivered accurately.'); }
    if (flightState.crashed || flightState.landedComplete) {
      if (flightState.crashed) { aircraft.spawnCrashSmoke(flightState.pos); audio.playCrash(); hud.announce(`Aircraft lost: ${flightState.crashReason}`); }
      else hud.announce(`Sortie complete. Score ${mission.score}.`);
      screenState = 'debrief'; hud.setScreen('debrief'); hud.showDebrief(flightState, mission);
    }
  } else if (screenState === 'start') { flightState.rpm = 0.24; }
  world.update(elapsedSec, mission.mode.windSpeedKt, mission.mode.windDirRad, flightState.pos, mission.mode.stormMode ? 1 : 0);
  world.updatePapi(flightState.pos, WORLD_BOUNDS.destRunwayZ + 173, WORLD_BOUNDS.destRunwayElevation, DEST_RUNWAY_X);
  aircraft.updateVisuals(flightState, dt, elapsedSec); cockpit.update(flightState);
  audio.update(flightState, isCockpitView, screenState === 'playing', dt);
  if (screenState === 'playing' || screenState === 'paused') hud.update(flightState, mission, isCockpitView, camera, mouseYoke, selectedSortieIndex);
}

let lastTimeMs = performance.now(); let accumulator = 0; let totalElapsed = 0;
function animate(nowMs) {
  requestAnimationFrame(animate); const rawDt = Math.min(0.1, (nowMs - lastTimeMs) / 1000); lastTimeMs = nowMs; accumulator += rawDt;
  while (accumulator >= FIXED_DT) { totalElapsed += FIXED_DT; stepSimulation(FIXED_DT, totalElapsed); accumulator -= FIXED_DT; }
  updateCamera(rawDt, totalElapsed); renderer.render(scene, camera);
}

resetSortie(0, false); updateCamera(0.016, 0); renderer.render(scene, camera); requestAnimationFrame(animate);
