// The flight model and the course rules, no drawing here. One fixed-step
// update per call: throttle, speed, bank and pitch move the plane; rings are
// collected in order; islands, the sea and a bad landing end the run; a good
// landing on the destination runway finishes it.

import { COURSE, LIVES, LANDING_POINTS, PLANE, RING_POINTS, STEP } from './config.js';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_LANDED = 4;
export const EVENT_OVER = 8;

export const PHASE_TAKEOFF = 'takeoff';
export const PHASE_FLY = 'fly';
export const PHASE_LANDED = 'landed';
export const PHASE_CRASHED = 'crashed';

function islandAt(s, x) {
  for (const island of COURSE.islands) {
    const ds = s - island.s;
    const dx = x - island.x;
    if (ds * ds + dx * dx < island.r * island.r) return island;
  }
  return null;
}

export function createWorld(random) {
  const state = {
    s: 0,
    x: 0,
    h: 0,
    speed: 0,
    throttle: 0,
    roll: 0,
    pitch: 0,
    heading: 0,
    verticalSpeed: 0,
    lives: LIVES,
    ringsPassed: 0,
    ringsMissed: 0,
    score: 0,
    time: 0,
    phase: PHASE_TAKEOFF,
    airborne: false,
    message: '',
    messageTime: 0,
    /** Distance already flown, for the crash camera. */
    crashS: 0,
    landingBonus: 0,
    timeBonus: 0,
    /** Per-ring result, 'pending' | 'hit' | 'missed'. */
    ringResults: COURSE.rings.map(() => 'pending'),
    /** Small deterministic wave phase, so the sea never looks frozen. */
    wave: random.next() * Math.PI * 2,
  };

  function reset() {
    state.s = 0;
    state.x = 0;
    state.h = 0;
    state.speed = 0;
    state.throttle = 0;
    state.roll = 0;
    state.pitch = 0;
    state.heading = 0;
    state.verticalSpeed = 0;
    state.lives = LIVES;
    state.ringsPassed = 0;
    state.ringsMissed = 0;
    state.score = 0;
    state.time = 0;
    state.phase = PHASE_TAKEOFF;
    state.airborne = false;
    state.message = 'Throttle up — hold SHIFT to take off';
    state.messageTime = 4;
    state.crashS = 0;
    state.landingBonus = 0;
    state.timeBonus = 0;
    state.ringResults = COURSE.rings.map(() => 'pending');
  }

  function announce(message, seconds) {
    state.message = message;
    state.messageTime = seconds;
  }

  function crash(reason) {
    state.phase = PHASE_CRASHED;
    state.crashS = state.s;
    state.lives -= 1;
    announce(reason, 3);
    return EVENT_CRASH | (state.lives <= 0 ? EVENT_OVER : 0);
  }

  function land() {
    state.phase = PHASE_LANDED;
    const smooth = Math.max(0, 1 - Math.abs(state.verticalSpeed) / 6);
    const centred = Math.max(0, 1 - Math.abs(state.x) / COURSE.runwayEnd.halfWidth);
    // Freeze the instruments as a landed plane: no more sink, wheels rolling.
    state.verticalSpeed = 0;
    state.throttle = 0;
    state.airborne = false;
    state.speed *= 0.25;
    state.landingBonus = Math.round(LANDING_POINTS * (0.4 + 0.6 * smooth * centred));
    state.timeBonus = Math.max(0, Math.round(300 - state.time));
    state.score += state.landingBonus + state.timeBonus;
    announce(`Delivered! Landing +${state.landingBonus} · Time +${state.timeBonus}`, 6);
    return EVENT_LANDED;
  }

  function respawn() {
    // Back to the last ring passed (or the start), wheels on the ground only
    // at the very start; mid-course the plane rejoins in the air, slowly.
    const lastRing = state.ringsPassed > 0 ? COURSE.rings[state.ringsPassed - 1] : null;
    if (lastRing) {
      state.s = Math.max(0, lastRing.s - 250);
      state.x = lastRing.x;
      state.h = Math.max(60, lastRing.h);
      state.speed = 62;
      state.airborne = true;
    } else {
      state.s = 0;
      state.x = 0;
      state.h = 0;
      state.speed = 0;
      state.airborne = false;
    }
    state.throttle = 0.7;
    state.roll = 0;
    state.pitch = 0;
    state.heading = 0;
    state.verticalSpeed = 0;
    state.phase = state.airborne ? PHASE_FLY : PHASE_TAKEOFF;
    announce(state.airborne ? 'Back in the air — next ring ahead' : 'Throttle up — hold SHIFT to take off', 3);
  }

  /**
   * Advance the world one fixed step. `input` is { roll, pitch, throttle }
   * each -1..1. `attract` is true on the title screen, where the plane sits
   * on the runway and the world idles. Returns an event bitmask.
   */
  function step(dt, input, attract) {
    state.wave += dt * 0.7;
    if (state.messageTime > 0) state.messageTime -= dt;
    if (attract || state.phase === PHASE_LANDED) return 0;
    if (state.phase === PHASE_CRASHED) return 0;

    state.time += dt;
    let events = 0;

    // Throttle lever and speed.
    state.throttle = Math.max(0, Math.min(1, state.throttle + input.throttle * PLANE.throttleRate * dt));
    const targetSpeed = state.throttle * PLANE.maxSpeed;
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 0.8);

    // Bank, pitch and heading. Pitch is inverted like a stick: up is climb.
    // On the runway the wheels keep the plane straight: heading and lateral
    // drift only bite once the plane is in the air.
    const rollTarget = input.roll * 0.6;
    state.roll += (rollTarget - state.roll) * Math.min(1, dt * 4);
    const pitchTarget = -input.pitch * 0.35;
    state.pitch += (pitchTarget - state.pitch) * Math.min(1, dt * 3);
    if (state.airborne) {
      state.heading += state.roll * PLANE.turnRate * dt * (0.3 + 0.7 * (state.speed / PLANE.maxSpeed));
      // Keep the heading readable: the course runs north, drift is small.
      state.heading = Math.max(-0.6, Math.min(0.6, state.heading));
    }

    // Move.
    const prevS = state.s;
    state.s += state.speed * dt;
    if (state.airborne) {
      state.x += Math.sin(state.heading) * state.speed * dt + state.roll * state.speed * 0.35 * dt;
      state.x = Math.max(-PLANE.corridor, Math.min(PLANE.corridor, state.x));
    }

    // Vertical speed: stick up (positive pitch) climbs, stick down descends.
    // A flying wing holds a gentle climb on its own, so the plane does not
    // pancake into the sea the moment it leaves the runway — but only while
    // the stick is not held down: a deliberate descent must reach the
    // ground, or no one could ever land.
    const descending = input.pitch > 0.15;
    let climb = state.pitch * state.speed * 0.55 + (state.airborne && !descending ? 3 : 0);
    if (state.airborne && state.speed < PLANE.stallSpeed) climb -= (PLANE.stallSpeed - state.speed) * 0.35;
    if (!state.airborne) climb = 0;
    state.verticalSpeed = climb;
    state.h = Math.max(0, state.h + climb * dt);
    if (!state.airborne && state.speed >= PLANE.liftSpeed && state.h === 0) {
      state.airborne = true;
      state.h = 2;
      state.phase = PHASE_FLY;
      announce('Airborne! Follow the rings to Pulau Harapan', 3);
    }

    // Rings, in order: crossing one's distance settles it.
    const ringIndex = state.ringsPassed + state.ringsMissed;
    if (ringIndex < COURSE.rings.length) {
      const ring = COURSE.rings[ringIndex];
      if (prevS < ring.s && state.s >= ring.s) {
        const dx = Math.abs(state.x - ring.x);
        const dh = Math.abs(state.h - ring.h);
        if (dx < ring.r && dh < ring.r && state.airborne) {
          state.ringResults[ringIndex] = 'hit';
          state.ringsPassed += 1;
          state.score += RING_POINTS;
          announce(`Ring ${state.ringsPassed}/8! +${RING_POINTS}`, 2);
          events |= EVENT_RING;
        } else {
          state.ringResults[ringIndex] = 'missed';
          state.ringsMissed += 1;
          announce(`Ring missed — ${8 - ringIndex - 1} left`, 2);
        }
      }
    }

    // Destination runway: a gentle touchdown inside the strip finishes the run.
    const end = COURSE.runwayEnd;
    if (state.s >= end.s - 60 && state.s <= end.s + end.length) {
      if (state.h <= 6 && state.airborne) {
        if (Math.abs(state.x) <= end.halfWidth && state.speed < 72 && state.verticalSpeed > -7) {
          return events | land();
        }
        if (state.speed >= 72 || state.verticalSpeed <= -7) {
          return events | crash(state.speed >= 72 ? 'Too fast to land — the plane broke up' : 'Too hard — the landing gear gave way');
        }
      }
    }

    // Terrain: an island is solid ground above the sea — except on a runway
    // and its flat coastal strip, which is at sea level. The strip is wider
    // than the tarmac: a plane low over the beach is not inside the hill.
    const onRunway =
      (state.s >= COURSE.runwayStart.s - 60 && state.s <= COURSE.runwayStart.s + COURSE.runwayStart.length + 100 && Math.abs(state.x) <= 60) ||
      (state.s >= COURSE.runwayEnd.s - 60 && state.s <= COURSE.runwayEnd.s + COURSE.runwayEnd.length && Math.abs(state.x) <= 60);
    if (state.airborne && !onRunway) {
      const island = islandAt(state.s, state.x);
      if (island && state.h < island.h) {
        return events | crash(`Clipped ${island.name} — terrain is not a shortcut`);
      }
      if (state.h <= 0 && state.s > COURSE.runwayStart.length) {
        return events | crash('Ditched in the sea — keep some altitude over water');
      }
    }
    // Rolling past the end of the departure runway without lifting off.
    if (!state.airborne && state.s > COURSE.runwayStart.length + 120) {
      return events | crash('Ran off the end of the runway — more throttle next time');
    }
    // Flew past the destination without landing.
    if (state.s > end.s + end.length + 400) {
      return events | crash('Overshot Pulau Harapan — turn back sooner');
    }
    return events;
  }

  reset();
  return { state, reset, step, respawn, announce };
}

export { COURSE };
export const FIXED_STEP = STEP;
