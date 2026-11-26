import * as THREE from 'three';
import { AIRCRAFT_DIMENSIONS } from './aircraft.js';
import { DEST_RUNWAY_X, WORLD_BOUNDS, getArchDistanceInfo, getTerrainHeight, getThermalLiftAt } from './world.js';

export const FLIGHT_CONFIG = Object.freeze({
  gravity: 9.81, maxThrustAccel: 29.5, stallSpeedMs: 24.5, flapsStallSpeedMs: 19.5,
  cruiseSpeedMs: 72.0, maxSpeedMs: 105.0, pitchRateRad: 1.05, rollRateRad: 1.72, yawRateRad: 0.62, fuelBurnBase: 0.26, fuelBurnMax: 0.90,
});

/** Create initial flight physics state positioned at departure airfield threshold. */
export function createFlightState(sortieConfig) {
  return {
    pos: new THREE.Vector3(0, WORLD_BOUNDS.startRunwayElevation + AIRCRAFT_DIMENSIONS.gearHeight, WORLD_BOUNDS.startRunwayZ + 148),
    vel: new THREE.Vector3(), quat: new THREE.Quaternion(),
    headingDeg: 0, pitchDeg: 0, rollDeg: 0, airspeedKt: 0, groundSpeedKt: 0,
    altitudeFt: Math.round(WORLD_BOUNDS.startRunwayElevation * 3.28084), altitudeAglFt: 0, vsiFpm: 0, aoaDeg: 0,
    throttle: 0.84, rpm: 0.25, fuel: sortieConfig.initialFuel, hull: 100, engineTemp: 62, gLoad: 1.0,
    windSpeedKt: sortieConfig.windSpeedKt, windDirRad: sortieConfig.windDirRad,
    flapsDeployed: false, autoLevel: false, brakesActive: false, inThermal: false,
    approachActive: false, supplyModeActive: false, isStorm: false, locDev: 0, gsDev: 0,
    stallWarning: false, terrainWarning: false, overheatWarning: false, lowFuelWarning: false,
    airborne: false, onRunway: true, onDestRunway: false,
    touchdownVsiFpm: 0, touchdownAlignmentM: 0, touchdownSignedOffsetM: 0, touchdownThresholdM: 0, touchdownQuality: '',
    crashed: false, crashReason: '', landedComplete: false, controls: { pitch: 0, roll: 0, yaw: 0 },
    events: { touchdownThisStep: false, crashedThisStep: false, hullDamagedThisStep: false },
  };
}

const tmpFwd = new THREE.Vector3(); const tmpUp = new THREE.Vector3();
const tmpAirVel = new THREE.Vector3(); const tmpWind = new THREE.Vector3();
const tmpDQ = new THREE.Quaternion(); const tmpEul = new THREE.Euler(0, 0, 0, 'YXZ');

/** Advance 6-DOF flight aerodynamics, crosswind drift, ILS guidance, thermals & runway collisions. */
export function stepFlightAerodynamics(state, input, sortieConfig, gatesCleared, totalGates, dt, readyForRecovery = true) {
  state.events.touchdownThisStep = false; state.events.crashedThisStep = false; state.events.hullDamagedThisStep = false;
  if (state.crashed || state.landedComplete) return;

  const thrDelta = (input.throttleUp ? 1 : 0) - (input.throttleDown ? 1 : 0);
  if (thrDelta !== 0) state.throttle = THREE.MathUtils.clamp(state.throttle + thrDelta * 0.45 * dt, 0, 1);
  if (input.wheelDelta !== 0) state.throttle = THREE.MathUtils.clamp(state.throttle - input.wheelDelta * 0.0005, 0, 1);

  state.rpm = THREE.MathUtils.lerp(state.rpm, state.fuel > 0 ? 0.14 + state.throttle * 0.86 : 0.04, Math.min(1, dt * 3.8));
  if (state.fuel > 0) state.fuel = Math.max(0, state.fuel - (FLIGHT_CONFIG.fuelBurnBase + Math.pow(state.throttle, 1.45) * FLIGHT_CONFIG.fuelBurnMax) * dt);
  state.lowFuelWarning = state.fuel < 18;
  state.engineTemp = THREE.MathUtils.lerp(state.engineTemp, 54 + state.throttle * 52 + (state.throttle > 0.9 ? 14 : 0), Math.min(1, dt * 0.55));
  state.overheatWarning = state.engineTemp > 103;

  const rawPitch = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0) + (input.analogPitch || 0);
  const autoPitch = state.autoLevel && Math.abs(rawPitch) < 0.05 && state.airborne ? THREE.MathUtils.clamp(-state.pitchDeg * 0.08, -0.35, 0.35) : 0;
  const targetPitch = THREE.MathUtils.clamp((input.invertPitch ? -rawPitch : rawPitch) + autoPitch, -1, 1);
  const rawRoll = (input.rollLeft ? 1 : 0) - (input.rollRight ? 1 : 0) + (input.analogRoll || 0);
  const autoRoll = state.autoLevel && Math.abs(rawRoll) < 0.05 && state.airborne ? THREE.MathUtils.clamp(-state.rollDeg * 0.06, -0.45, 0.45) : 0;
  const targetRoll = THREE.MathUtils.clamp(rawRoll + autoRoll, -1, 1);
  const targetYaw = (input.yawLeft ? 1 : 0) - (input.yawRight ? 1 : 0);

  state.controls.pitch = THREE.MathUtils.lerp(state.controls.pitch, targetPitch, Math.min(1, dt * 9));
  state.controls.roll = THREE.MathUtils.lerp(state.controls.roll, targetRoll, Math.min(1, dt * 9));
  state.controls.yaw = THREE.MathUtils.lerp(state.controls.yaw, targetYaw, Math.min(1, dt * 8));

  const cosRoll = Math.max(0.4, Math.cos(THREE.MathUtils.degToRad(state.rollDeg)));
  state.gLoad = THREE.MathUtils.lerp(state.gLoad, state.airborne ? THREE.MathUtils.clamp(1 / cosRoll + state.controls.pitch * 0.45, 0.4, 3.2) : 1.0, Math.min(1, dt * 5));

  const windMs = state.windSpeedKt * 0.51444; tmpWind.set(Math.sin(state.windDirRad) * windMs, 0, Math.cos(state.windDirRad) * windMs);
  const speedMs = state.vel.length(); tmpAirVel.copy(state.vel).sub(tmpWind); const airspeedMs = tmpAirVel.length();
  state.airspeedKt = airspeedMs * 1.94384; state.groundSpeedKt = speedMs * 1.94384;
  tmpEul.setFromQuaternion(state.quat, 'YXZ');
  state.pitchDeg = THREE.MathUtils.radToDeg(tmpEul.x); state.rollDeg = THREE.MathUtils.radToDeg(tmpEul.z);
  state.headingDeg = (THREE.MathUtils.radToDeg(-tmpEul.y) % 360 + 360) % 360;

  const airAuth = state.airborne ? THREE.MathUtils.clamp(0.45 + airspeedMs / 56, 0.45, 1.15) : THREE.MathUtils.clamp(speedMs / 30, 0.12, 0.9);
  const dPitch = state.controls.pitch * FLIGHT_CONFIG.pitchRateRad * airAuth * dt;
  const dRoll = (state.controls.roll * FLIGHT_CONFIG.rollRateRad * airAuth + (Math.abs(targetRoll) < 0.05 && state.airborne ? -tmpEul.z * 0.35 : 0)) * dt;
  const dYaw = state.controls.yaw * FLIGHT_CONFIG.yawRateRad * Math.max(0.45, airAuth) * dt;

  if (state.airborne) {
    tmpDQ.setFromEuler(new THREE.Euler(dPitch, dYaw, dRoll, 'YXZ')); state.quat.multiply(tmpDQ).normalize();
    const bankYaw = Math.sin(tmpEul.z) * 0.46 * THREE.MathUtils.clamp(airspeedMs / 50, 0.25, 1.1) * dt;
    if (Math.abs(bankYaw) > 1e-6) { tmpDQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), bankYaw); state.quat.premultiply(tmpDQ).normalize(); }
  } else {
    tmpDQ.setFromEuler(new THREE.Euler(speedMs > 24 && state.controls.pitch > 0 ? dPitch * 0.85 : 0, state.controls.yaw * 0.65 * Math.min(1, speedMs / 18) * dt, 0, 'YXZ'));
    state.quat.multiply(tmpDQ).normalize(); tmpEul.setFromQuaternion(state.quat, 'YXZ');
    tmpEul.z = THREE.MathUtils.lerp(tmpEul.z, 0, Math.min(1, dt * 8)); tmpEul.x = THREE.MathUtils.clamp(tmpEul.x, -0.05, 0.28); state.quat.setFromEuler(tmpEul);
  }

  tmpFwd.set(0, 0, -1).applyQuaternion(state.quat).normalize(); tmpUp.set(0, 1, 0).applyQuaternion(state.quat).normalize();
  const aoaRad = airspeedMs > 5 ? Math.atan2(-tmpAirVel.dot(tmpUp), Math.max(4, Math.max(0, tmpAirVel.dot(tmpFwd)))) : 0;
  state.aoaDeg = THREE.MathUtils.radToDeg(aoaRad);
  const activeStallMs = state.flapsDeployed ? FLIGHT_CONFIG.flapsStallSpeedMs : FLIGHT_CONFIG.stallSpeedMs;
  state.stallWarning = state.airborne && (airspeedMs < activeStallMs || Math.abs(state.aoaDeg) > 19);

  const thrustAccel = state.fuel > 0 ? state.rpm * FLIGHT_CONFIG.maxThrustAccel * (state.engineTemp > 106 ? 0.82 : 1.0) : 0;
  const refSpeedMs = state.flapsDeployed ? 28.5 : 33.5;
  const groundEffect = state.altitudeAglFt < 20 ? 1.0 + 0.18 * (1 - state.altitudeAglFt / 20) : 1.0;
  const liftAccel = FLIGHT_CONFIG.gravity * Math.min(2.1, THREE.MathUtils.clamp((airspeedMs / refSpeedMs) * (airspeedMs / refSpeedMs) * groundEffect, 0, 2.4) * (1.0 + THREE.MathUtils.clamp(aoaRad * 2.1, -0.5, 0.95)) * (state.stallWarning ? 0.54 : 1.0));
  const thermalLift = state.airborne ? getThermalLiftAt(state.pos) : 0;
  state.inThermal = thermalLift > 0.2; state.brakesActive = Boolean(input.brake);

  if (state.airborne) {
    if (airspeedMs < activeStallMs - 2) { tmpDQ.setFromEuler(new THREE.Euler(-0.32 * dt, 0, 0, 'YXZ')); state.quat.multiply(tmpDQ).normalize(); }
    const dragCoeff = 0.0044 + (state.flapsDeployed ? 0.0056 : 0) + (state.brakesActive ? 0.011 : 0) + Math.abs(aoaRad) * 0.012 + (state.onDestRunway ? 0.008 : 0);
    const accelVec = new THREE.Vector3().addScaledVector(tmpFwd, thrustAccel).addScaledVector(tmpUp, liftAccel).addScaledVector(tmpAirVel.clone().normalize(), -dragCoeff * airspeedMs * airspeedMs);
    accelVec.y += thermalLift - FLIGHT_CONFIG.gravity; state.vel.addScaledVector(accelVec, dt);
    const desiredGroundVel = tmpFwd.clone().multiplyScalar(THREE.MathUtils.clamp(state.vel.length(), 14, FLIGHT_CONFIG.maxSpeedMs)).addScaledVector(tmpWind, 0.55);
    const vertAuth = state.stallWarning ? 0.16 : THREE.MathUtils.clamp((airspeedMs - 17) / 22, 0.35, 1.0);
    state.vel.x = THREE.MathUtils.lerp(state.vel.x, desiredGroundVel.x, Math.min(1, dt * 2.55));
    state.vel.z = THREE.MathUtils.lerp(state.vel.z, desiredGroundVel.z, Math.min(1, dt * 2.55));
    state.vel.y = THREE.MathUtils.clamp(THREE.MathUtils.lerp(state.vel.y, desiredGroundVel.y, Math.min(1, dt * 1.45 * vertAuth)), -48, 42);
  } else {
    const braking = state.onDestRunway || state.brakesActive || (input.throttleDown && state.throttle < 0.15);
    const newSpeed = Math.max(0, speedMs + (thrustAccel - (braking ? (state.brakesActive ? 14.5 : 9.8) : 1.2) - 0.003 * speedMs * speedMs) * dt);
    state.vel.copy(tmpFwd).multiplyScalar(newSpeed); state.vel.y = 0;
    if (!state.onDestRunway && (newSpeed > 34 || (newSpeed > 27 && state.controls.pitch > 0.15))) { state.airborne = true; state.onRunway = false; state.vel.y = Math.max(3.6, newSpeed * 0.11); }
  }

  state.pos.addScaledVector(state.vel, dt); state.pos.x = THREE.MathUtils.clamp(state.pos.x, -1250, 1250); state.pos.y = THREE.MathUtils.clamp(state.pos.y, -5, 680);
  const terrainY = getTerrainHeight(state.pos.x, state.pos.z); const surfaceY = Math.max(0, terrainY);
  const onStartDeck = Math.abs(state.pos.x) < 18 && state.pos.z <= WORLD_BOUNDS.startRunwayZ + 196 && state.pos.z >= WORLD_BOUNDS.startRunwayZ - 196;
  const onDestDeck = Math.abs(state.pos.x - DEST_RUNWAY_X) < 19.5 && state.pos.z <= WORLD_BOUNDS.destRunwayZ + 225 && state.pos.z >= WORLD_BOUNDS.destRunwayZ - 225;
  const deckY = onStartDeck ? WORLD_BOUNDS.startRunwayElevation : onDestDeck ? WORLD_BOUNDS.destRunwayElevation : surfaceY;

  state.altitudeFt = Math.max(0, state.pos.y * 3.28084); state.altitudeAglFt = Math.max(0, (state.pos.y - deckY) * 3.28084);
  state.vsiFpm = state.vel.y * 196.85;
  state.terrainWarning = Boolean(state.airborne && !onDestDeck && !onStartDeck && state.altitudeAglFt < 65 && state.vsiFpm < -780);
  state.supplyModeActive = Boolean(sortieConfig.supplyDropMode); state.isStorm = Boolean(sortieConfig.stormMode);

  const rwyDistZ = Math.max(25, state.pos.z - (WORLD_BOUNDS.destRunwayZ + 173));
  state.approachActive = Boolean(state.airborne && readyForRecovery);
  state.locDev = THREE.MathUtils.clamp((DEST_RUNWAY_X - state.pos.x) / Math.max(25, rwyDistZ * 0.14), -1.2, 1.2);
  state.gsDev = THREE.MathUtils.clamp((state.pos.y - (WORLD_BOUNDS.destRunwayElevation + rwyDistZ * 0.068)) / Math.max(8, rwyDistZ * 0.045), -1.2, 1.2);

  if (state.airborne && state.inThermal) state.vel.y += Math.sin(state.pos.z * 0.09 + state.fuel * 3) * 0.32 * dt * 6;
  if (getArchDistanceInfo(state.pos).hitRock) { triggerCrash(state, 'ROCK ARCH COLLISION — THREAD THROUGH THE CENTER OPENING'); return; }

  const wheelY = deckY + AIRCRAFT_DIMENSIONS.gearHeight;
  if (state.pos.y <= wheelY) {
    if (!state.airborne) {
      state.pos.y = wheelY;
      if (state.onDestRunway && state.groundSpeedKt < 24) { state.landedComplete = true; state.vel.set(0, 0, 0); }
      return;
    }
    if (onDestDeck || onStartDeck) {
      const sinkFpm = state.vsiFpm; const bankAbs = Math.abs(state.rollDeg);
      if (sinkFpm > -680 && bankAbs < 24 && state.pitchDeg > -10 && state.pitchDeg < 22) {
        state.pos.y = wheelY; state.airborne = false; state.onRunway = true; state.events.touchdownThisStep = true;
        state.touchdownVsiFpm = Math.round(sinkFpm);
        state.touchdownSignedOffsetM = state.pos.x - (onDestDeck ? DEST_RUNWAY_X : 0);
        state.touchdownAlignmentM = Math.abs(state.touchdownSignedOffsetM);
        state.touchdownThresholdM = Math.round((WORLD_BOUNDS.destRunwayZ + 220) - state.pos.z);
        state.touchdownQuality = sinkFpm > -240 ? 'GREASER LANDING' : sinkFpm > -460 ? 'SMOOTH TOUCHDOWN' : 'FIRM LANDING';
        if (onDestDeck && ((gatesCleared >= totalGates && readyForRecovery) || (gatesCleared === 0 && state.pos.z < -3700))) { state.onDestRunway = true; state.throttle = 0; }
        return;
      }
      if (sinkFpm > -940 && bankAbs < 32 && state.hull > 40) {
        state.hull = Math.max(0, state.hull - 38); state.pos.y = wheelY + 0.4; state.vel.y = Math.max(3.2, Math.abs(state.vel.y) * 0.35);
        state.events.hullDamagedThisStep = true; state.events.touchdownThisStep = true; return;
      }
      triggerCrash(state, `HARD RUNWAY IMPACT (${Math.round(sinkFpm)} FPM) — FLARE NOSE BEFORE TOUCHDOWN`); return;
    }
    triggerCrash(state, terrainY < 0.4 ? 'RIVER WATER IMPACT — MAINTAIN CLEARANCE ABOVE CANYON WATER' : 'CANYON TERRAIN IMPACT — PULL UP CLEAR OF SANDSTONE WALLS'); return;
  }
  if (state.fuel <= 0 && state.airspeedKt < 42 && state.altitudeAglFt < 25) triggerCrash(state, 'FUEL EXHAUSTED — MANAGE CRUISE THROTTLE TO REACH THE RUNWAY');
}

function triggerCrash(state, reason) { state.hull = 0; state.crashed = true; state.crashReason = reason; state.events.crashedThisStep = true; state.vel.multiplyScalar(0.12); state.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, 0, 0.24))); }
