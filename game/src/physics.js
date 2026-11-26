// Flight physics: takeoff roll, smooth aerodynamics, canyon collision, ring gates, and runway landing.

import { BONUS_GATE, FLIGHT, MISSIONS, WORLD_BOUNDS } from './config.js';
import { buildBasis, clamp, lerp } from './math3d.js';
import { canyonCenterX, canyonFloorHalfW, classifySurface, terrainHeight } from './terrain.js';
import { SCREEN_CRASH, SCREEN_FAIL, SCREEN_PLAY, SCREEN_WIN } from './world.js';

export function stepPhysics(world, controls, dt) {
  const s = world.state;
  const p = s.plane;
  const mission = MISSIONS[s.missionIndex];

  world.clearEvents();
  world.stepAmbient(dt);

  if (s.screen === SCREEN_CRASH) {
    s.crashTimer -= dt;
    if (s.crashTimer <= 0) {
      if (p.hull <= 0) {
        s.screen = SCREEN_FAIL;
        s.events.fail = true;
      } else {
        world.respawnAtCheckpoint();
      }
    }
    return;
  }

  if (s.screen !== SCREEN_PLAY) return;

  s.flightTime += dt;

  const pitchDir = s.invertPitch ? -controls.pitch : controls.pitch;
  p.throttle = clamp(p.throttle + controls.throttle * dt * 0.55, 0, 1);
  p.aileronInput = lerp(p.aileronInput, controls.roll, 10 * dt);
  p.elevatorInput = lerp(p.elevatorInput, pitchDir, 10 * dt);

  const effectiveThrottle = p.fuel > 0 ? p.throttle : 0;
  const burn = lerp(FLIGHT.fuelBurnIdle, FLIGHT.fuelBurnFull, effectiveThrottle * effectiveThrottle);
  p.fuel = Math.max(0, p.fuel - burn * dt);

  const targetTemp = 38 + effectiveThrottle * 54 + (effectiveThrottle > 0.9 ? 22 : 0);
  p.engineTemp = lerp(p.engineTemp, targetTemp, dt * 0.65);
  const heatScale = p.engineTemp > 102 ? 0.84 : 1.0;

  if (p.onGround) {
    const groundY = terrainHeight(p.pos.x, p.pos.z);
    const surf = classifySurface(p.pos.x, p.pos.z, groundY);
    const onRunway = surf === 'airstrip' || surf === 'runway';

    // Ground steering
    p.yaw += controls.roll * 0.52 * dt;
    p.roll = lerp(p.roll, 0, 10 * dt);

    const thrustAcc = effectiveThrottle * heatScale * FLIGHT.maxThrust;
    const rollDrag = onRunway ? 0.14 : 0.45;
    const brake = controls.throttle < 0 || s.clearedToLand ? 16.0 * (1 - effectiveThrottle * 0.85) : 0;

    p.speed = clamp(p.speed + (thrustAcc - p.speed * rollDrag - brake) * dt, 0, FLIGHT.maxSpeed);

    if (p.speed > 18 && pitchDir > 0) {
      p.pitch = clamp(p.pitch + pitchDir * 0.85 * dt, -0.04, 0.34);
    } else {
      p.pitch = lerp(p.pitch, 0.03, 6 * dt);
    }

    p.vel.x = Math.sin(p.yaw) * p.speed;
    p.vel.z = Math.cos(p.yaw) * p.speed;
    p.vel.y = 0;

    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    p.pos.y = terrainHeight(p.pos.x, p.pos.z) + 2.4;
    p.vsi = 0;

    if (p.speed > 14 && Math.random() < 0.45) {
      world.spawnBurst(p.pos.x, p.pos.y - 2.1, p.pos.z - 1.5, '#d89b6a', 1, 5);
    }

    // Smooth liftoff once rolling above rotation speed
    if (p.speed >= FLIGHT.takeoffSpeed && p.pitch > 0.08 && !s.clearedToLand) {
      p.onGround = false;
      p.pos.y += 1.4;
      p.vel.y = Math.max(8.5, Math.sin(p.pitch) * p.speed * 0.9);
      world.showBanner('AIRBORNE! FLY THROUGH THE GLOWING RINGS IN ORDER', '#5cf29c', 2.8);
    }

    if (s.clearedToLand && surf === 'runway' && p.speed < 10.5) {
      finishMission(world);
    }
  } else {
    // Smooth airborne dynamics: responsive pitch/roll + realistic airspeed & turn bleed
    p.pitch += pitchDir * FLIGHT.pitchRate * dt;
    if (Math.abs(pitchDir) < 0.05) p.pitch -= p.pitch * FLIGHT.pitchReturn * dt;
    p.pitch = clamp(p.pitch, -0.88, 0.88);

    p.roll += controls.roll * FLIGHT.rollRate * dt;
    if (Math.abs(controls.roll) < 0.05) p.roll -= p.roll * FLIGHT.rollReturn * dt;
    p.roll = clamp(p.roll, -1.25, 1.25);

    p.yaw += Math.sin(p.roll) * FLIGHT.turnRate * dt;

    const basis = buildBasis(p.yaw, p.pitch, p.roll);

    // Thrust vs quadratic drag + climb/dive energy exchange + gentle stall sink
    const thrust = effectiveThrottle * heatScale * FLIGHT.maxThrust;
    const drag = FLIGHT.dragCoeff * p.speed * p.speed + Math.abs(p.roll) * 2.5;
    const climbLoad = Math.sin(p.pitch) * FLIGHT.gravity * 0.9;
    p.speed = clamp(p.speed + (thrust - drag - climbLoad) * dt, 16, FLIGHT.maxSpeed);

    // Bank lift loss & low-speed stall sink
    const stallSink = p.speed < FLIGHT.stallSpeed ? ((FLIGHT.stallSpeed - p.speed) / FLIGHT.stallSpeed) * FLIGHT.gravity * 1.15 : 0;
    const bankSink = (1 - Math.cos(p.roll)) * 5.5;
    const targetVx = basis.fwd.x * p.speed + (mission.crosswind > 0 ? Math.sin(p.pos.z * 0.002) * mission.crosswind : 0);
    const targetVy = basis.fwd.y * p.speed - stallSink - bankSink;
    const targetVz = basis.fwd.z * p.speed;

    const lag = clamp(5.5 * dt, 0, 1);
    p.vel.x = lerp(p.vel.x, targetVx, lag);
    p.vel.y = lerp(p.vel.y, targetVy, lag);
    p.vel.z = lerp(p.vel.z, targetVz, lag);
    p.vsi = p.vel.y * 196.85;

    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;

    if (p.pos.y > FLIGHT.ceilingAlt) {
      p.pos.y = FLIGHT.ceilingAlt;
      p.vel.y = Math.min(p.vel.y, -1.5);
      p.pitch = Math.min(p.pitch, 0);
    }

    if ((Math.abs(p.roll) > 0.35 || p.speed > 76) && Math.random() < 0.7) {
      s.trails.push({
        x: p.pos.x - basis.right.x * 14,
        y: p.pos.y - basis.right.y * 14 + basis.up.y * 1.3,
        z: p.pos.z - basis.right.z * 14,
        life: 0.55,
        maxLife: 0.55,
      });
      s.trails.push({
        x: p.pos.x + basis.right.x * 14,
        y: p.pos.y + basis.right.y * 14 + basis.up.y * 1.3,
        z: p.pos.z + basis.right.z * 14,
        life: 0.55,
        maxLife: 0.55,
      });
    }

    if (p.hull < 65 && Math.random() < 0.35) {
      world.spawnBurst(p.pos.x, p.pos.y, p.pos.z, '#52494e', 1, 7);
    }
  }

  p.propAngle += (14 + p.throttle * 34) * dt;

  checkRings(world, mission);
  checkTerrainAndLanding(world);
}

function checkRings(world, mission) {
  const s = world.state;
  const p = s.plane;

  for (let i = 0; i < s.rings.length; i += 1) {
    const r = s.rings[i];
    if (r.passed || r.missed) continue;

    const dz = p.pos.z - r.z;
    if (dz < -8) break;

    const dx = p.pos.x - r.x;
    const dy = p.pos.y - r.y;
    const radial = Math.hypot(dx, dy);

    if (Math.abs(dz) <= 12 && radial <= r.radius + 5) {
      r.passed = true;
      r.flash = 1.0;
      s.ringsPassed += 1;
      s.lastCheckpointIndex = i;
      s.streak += 1;
      if (s.streak > s.maxStreak) s.maxStreak = s.streak;

      const bullseye = radial <= r.radius * 0.5;
      const bonusMult = r.isBonus ? BONUS_GATE.scoreMult : 1;
      const pts = Math.round((bullseye ? 1400 : 1000) * (1 + (s.streak - 1) * 0.15) * mission.scoreMult * bonusMult);
      s.score += pts;
      if (s.score > s.bestScore) s.bestScore = s.score;

      if (bullseye) {
        p.fuel = Math.min(100, p.fuel + 2.5);
        s.events.ringBullseye = true;
        const label = r.isBonus ? `BONUS GATE BULLSEYE! +${pts}  (3x PTS` : `BULLSEYE GATE ${i + 1}! +${pts}  (`;
        world.showBanner(`${label}STREAK x${s.streak} • +2.5% FUEL)`, r.isBonus ? '#ffd700' : '#5cf29c', 2.2);
        world.spawnBurst(r.x, r.y, r.z, r.isBonus ? '#ffd700' : '#5cf29c', 28, 36);
      } else {
        s.events.ringHit = true;
        const label = r.isBonus ? `BONUS GATE CLEARED! +${pts}  (3x PTS • ` : `GATE ${i + 1} CLEARED! +${pts}  (`;
        world.showBanner(`${label}STREAK x${s.streak})`, r.isBonus ? '#ffd700' : '#ffbe4d', 1.8);
        world.spawnBurst(r.x, r.y, r.z, r.isBonus ? '#ffd700' : '#ffd15c', 20, 28);
      }

      if (s.ringsPassed + s.ringsMissed >= WORLD_BOUNDS.ringCount) {
        s.clearedToLand = true;
        world.showBanner('ALL GATES COMPLETE! ALIGN WITH DESERT RUNWAY AHEAD & THROTTLE DOWN (Q)', '#5cf29c', 4.5);
      }
    } else if (dz > 14) {
      r.missed = true;
      s.ringsMissed += 1;
      s.streak = 0;
      s.score = Math.max(0, s.score - 350);
      s.flightTime += 5.0;
      s.alertFlash = 0.85;
      s.events.ringMiss = true;
      const missName = r.isBonus ? 'BONUS GATE' : `GATE ${i + 1}`;
      world.showBanner(`${missName} MISSED! -350 PTS  |  +5.0s PENALTY`, '#ff5c4d', 2.4);

      if (s.ringsPassed + s.ringsMissed >= WORLD_BOUNDS.ringCount) {
        s.clearedToLand = true;
        world.showBanner('FINAL APPROACH! ALIGN WITH RUNWAY AHEAD & THROTTLE DOWN (Q)', '#ffbe4d', 4.0);
      }
    }
    break;
  }
}

function checkTerrainAndLanding(world) {
  const s = world.state;
  const p = s.plane;
  const groundY = terrainHeight(p.pos.x, p.pos.z);

  if (p.onGround) {
    const surf = classifySurface(p.pos.x, p.pos.z, groundY);
    if (surf === 'river' || (surf !== 'airstrip' && surf !== 'runway' && p.speed > 26)) {
      triggerCrash(world, 'RUNWAY EXCURSION!');
    }
    if (s.clearedToLand && p.pos.z > WORLD_BOUNDS.runwayZEnd + 30) {
      finishMission(world);
    }
    return;
  }

  if (p.pos.y <= groundY + 2.4) {
    if (p.vel.y > 1.2) return;
    const surf = classifySurface(p.pos.x, p.pos.z, groundY);
    const nearRunway = surf === 'runway' || surf === 'airstrip';

    if (nearRunway && p.vel.y > -16 && Math.abs(p.roll) < 0.45 && p.pitch > -0.3) {
      p.onGround = true;
      p.pos.y = groundY + 2.4;
      s.touchdownFpm = Math.round(Math.abs(p.vel.y) * 196.85);
      p.vel.y = 0;
      p.roll = 0;
      p.pitch = 0.02;
      s.events.touchdown = true;
      world.spawnBurst(p.pos.x, groundY + 1, p.pos.z, '#e8b888', 14, 14);

      if (surf === 'runway' && s.clearedToLand) {
        const gentle = s.touchdownFpm < 500;
        s.landingGrade = gentle ? 'GREASED TOUCHDOWN' : s.touchdownFpm < 1000 ? 'FIRM TOUCHDOWN' : 'HARD TOUCHDOWN';
        if (!gentle && s.touchdownFpm >= 1000) p.hull = Math.max(15, p.hull - 15);
        world.showBanner(`${s.landingGrade} (${s.touchdownFpm} FPM) — BRAKE TO STOP (Q)`, '#5cf29c', 3.5);
      } else if (surf === 'runway' && !s.clearedToLand) {
        world.showBanner('LANDED EARLY — CLEAR REMAINING GATES OR RESTART (R)', '#ffbe4d', 3.0);
      }
      return;
    }

    const reason = surf === 'river' ? 'RIVER IMPACT!' : 'TERRAIN / CANYON IMPACT!';
    triggerCrash(world, reason);
    return;
  }

  const cx = canyonCenterX(p.pos.z);
  const hw = canyonFloorHalfW(p.pos.z);
  if (p.pos.y < 68 && Math.abs(p.pos.x - cx) > hw + 38) {
    triggerCrash(world, 'CANYON WALL COLLISION!');
  }
}

function triggerCrash(world, reason) {
  const s = world.state;
  const p = s.plane;
  s.crashes += 1;
  s.crashReason = reason;
  s.streak = 0;
  s.score = Math.max(0, s.score - 500);
  s.flightTime += 5.0;
  p.hull = Math.max(0, p.hull - 34);
  s.alertFlash = 1.0;
  s.cameraShake = 1.0;
  s.crashTimer = 1.55;
  s.screen = SCREEN_CRASH;
  s.events.crash = true;

  world.spawnBurst(p.pos.x, p.pos.y, p.pos.z, '#ff6830', 34, 42);
  world.spawnBurst(p.pos.x, p.pos.y, p.pos.z, '#3d3338', 20, 22);
  world.showBanner(`${reason}  -500 PTS  |  -34% HULL`, '#ff5c4d', 2.0);
}

function finishMission(world) {
  const s = world.state;
  const p = s.plane;
  if (s.screen === SCREEN_WIN) return;

  const mission = MISSIONS[s.missionIndex];
  const timeBonus = Math.max(0, Math.round((mission.parTime - s.flightTime) * 45));
  const fuelBonus = Math.round(p.fuel * 12);
  const hullBonus = Math.round(p.hull * 15);
  const landBonus = s.landingGrade === 'GREASED TOUCHDOWN' ? 1200 : s.landingGrade === 'FIRM TOUCHDOWN' ? 800 : 450;

  s.score += Math.round((timeBonus + fuelBonus + hullBonus + landBonus) * mission.scoreMult);
  if (s.score > s.bestScore) s.bestScore = s.score;
  s.winFlash = 1.0;
  s.screen = SCREEN_WIN;
  s.events.win = true;
  world.showBanner('PATROL COMPLETE! SAFE LANDING ON SUNRISE AIRFIELD', '#5cf29c', 5.0);
}
