// The screenshot scenes behind ?shot=start|play|ring|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (aim at the next ring's x and height, keep the speed
// up), so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { COURSE, STEP } from './config.js';
import { EVENT_LANDED, EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** Steer toward the next ring, or land on the runway once the rings are done. */
export function autopilot(state) {
  const nextIndex = state.ringsPassed + state.ringsMissed;
  let targetX = 0;
  let targetH = 80;
  let throttle = state.speed < 70 ? 1 : 0;
  if (nextIndex < COURSE.rings.length) {
    const ring = COURSE.rings[nextIndex];
    targetX = ring.x;
    targetH = ring.h;
  } else {
    // Landing: line up on the strip and hold approach height until the
    // threshold — diving early clips the island's hill short of the runway.
    // Past the threshold, aim just below the strip so the descent stays
    // firm until the wheels touch. Ease the throttle back gently: cut it
    // to idle and the wing loses the speed its pitch authority needs.
    // The throttle command is a lever rate, not a target: 0 holds it.
    targetX = 0;
    targetH = state.s < COURSE.runwayEnd.s - 50 ? 40 : -15;
    throttle = state.speed < 58 ? 0.2 : -0.5;
  }
  // No banking on the runway: the wheels keep the plane straight until liftoff.
  const roll = state.airborne ? Math.max(-1, Math.min(1, (targetX - state.x) / 45)) : 0;
  const pitch = Math.max(-1, Math.min(1, (targetH - state.h) / 45));
  // Pitch input is inverted like the stick: negative input climbs.
  return { roll, pitch: -pitch, throttle };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Names: start, play, ring, end; anything else is start.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'ring' && name !== 'end') {
    // Title over the departure runway: throttle half up, wheels on the ground.
    state.throttle = 0.55;
    state.speed = 28;
    return { screen: SCREEN_TITLE, best: 0 };
  }
  // Fly forward under the autopilot until the scene's moment arrives. The
  // play and ring scenes stop just before a ring, so the ring reads big in
  // the frame; the end scene flies the whole route to the landing.
  let events = 0;
  for (let index = 0; index < 400 / STEP; index += 1) {
    events = world.step(STEP, autopilot(state), false);
    if (events & EVENT_OVER) break;
    if (events & EVENT_LANDED) break;
    if (name === 'play' || name === 'ring') {
      const nextIndex = state.ringsPassed + state.ringsMissed;
      // The play scene stops at the third ring; the ring scene flies on to
      // the sixth and stops right on it, so the two frames are not the same.
      const wantRings = name === 'ring' ? 5 : 2;
      const wantDist = name === 'ring' ? 200 : 350;
      if (nextIndex < COURSE.rings.length && state.ringsPassed >= wantRings) {
        const dist = COURSE.rings[nextIndex].s - state.s;
        if (dist < wantDist && dist > 0) break;
      }
    }
  }
  if (events & EVENT_LANDED) return { screen: SCREEN_WIN, best: state.score };
  const over = state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
}
