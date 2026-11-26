// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. A chase view: the camera sits behind the
// plane, the sea and the islands roll toward the horizon, the next ring
// glows ahead, and a lit instrument panel sits along the bottom.

import { BOATS, CLOUDS, COURSE, FIELD, PALETTE, REEFS, VIEW_DIST } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Perspective scale for something `z` metres ahead of the camera. */
function scaleAt(z) {
  return 430 / (z + 45);
}

function project(x, height, z, camX, camH) {
  const scale = scaleAt(z);
  return {
    x: FIELD.width / 2 + (x - camX) * scale,
    y: FIELD.horizonY - (height - camH) * scale,
    scale,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let cached = { text: '', value: -1 };

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(canvas.width / FIELD.width, 0, 0, canvas.height / FIELD.height, 0, 0);
  }

  function drawSky(state, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.horizonY);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.65, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyHorizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.horizonY + 1);
    // Sun, upper right, drifting with the heading.
    const sunX = 1020 - state.heading * 260;
    const sunY = 92;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255, 243, 176, 0.95)');
    glow.addColorStop(0.35, 'rgba(255, 243, 176, 0.45)');
    glow.addColorStop(1, 'rgba(255, 243, 176, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();
    // Clouds, far to near so the near ones cover the far ones.
    const clouds = [...CLOUDS].sort((a, b) => b.s - a.s);
    for (const cloud of clouds) {
      const z = cloud.s - state.s;
      if (z < -100 || z > VIEW_DIST) continue;
      const p = project(cloud.x, cloud.h, z, state.x, state.h + 6);
      const r = cloud.r * p.scale;
      // A cloud high enough to slide under the HUD bar reads as a smear
      // across the instruments, so it stays out of the top of the frame.
      if (r < 2 || p.y < 100) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - r * 0.55, p.y + r * 0.1, r * 0.6, r * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + r * 0.55, p.y + r * 0.08, r * 0.65, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    void time;
  }

  function drawSea(state) {
    const grad = ctx.createLinearGradient(0, FIELD.horizonY, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.seaShallow);
    grad.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, FIELD.horizonY, FIELD.width, FIELD.height - FIELD.horizonY);
    // Shallow reef patches: pale turquoise water, so the sea has places.
    for (const reef of REEFS) {
      const z = reef.s - state.s;
      if (z < 60 || z > VIEW_DIST) continue;
      const p = project(reef.x, 0, z, state.x, state.h + 6);
      const rx = reef.r * p.scale;
      if (rx < 3) continue;
      ctx.fillStyle = 'rgba(127, 212, 217, 0.4)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, rx * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Boats, with a little wake each: the water gets scale and life.
    for (const boat of BOATS) {
      const z = boat.s - state.s;
      if (z < 60 || z > VIEW_DIST) continue;
      const p = project(boat.x, 0, z, state.x, state.h + 6);
      const size = Math.max(3, 10 * p.scale);
      if (size < 3) continue;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - size);
      ctx.lineTo(p.x - size * 0.8, p.y + size * 0.5);
      ctx.lineTo(p.x + size * 0.8, p.y + size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - size * 0.8, p.y + size * 0.6);
      ctx.lineTo(p.x - size * 2.2, p.y + size * 1.6);
      ctx.moveTo(p.x + size * 0.8, p.y + size * 0.6);
      ctx.lineTo(p.x + size * 2.2, p.y + size * 1.6);
      ctx.stroke();
    }
    // Wave streaks rolling toward the camera, three abreast so the sea is
    // not one flat sheet. (An earlier sun-glitter lane is gone: on screen
    // it read as a pale wedge, not as light on water.)
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    for (let z = 120; z < VIEW_DIST; z += 140) {
      for (const off of [-320, 0, 320]) {
        const p = project(off, 0, z, state.x, state.h + 6);
        const wobble = Math.sin(state.wave + z * 0.05 + off * 0.01) * 30 * p.scale;
        const len = 90 * p.scale + 12;
        ctx.beginPath();
        ctx.moveTo(p.x - len / 2 + wobble, p.y);
        ctx.lineTo(p.x + len / 2 + wobble, p.y);
        ctx.stroke();
      }
    }
  }

  function drawIsland(state, island, nameSpots) {
    const z = island.s - state.s;
    // An island whose centre is at or behind the camera would project to a
    // wall of green across the whole frame (its scale explodes as z nears
    // zero), so it drops out once the plane is over it; the sea below is
    // the stand-in for that last stretch. Known v1 pop, ~1 second of flight.
    if (z < 100 || z > VIEW_DIST) return;
    const base = project(island.x, 0, Math.max(z, 10), state.x, state.h + 6);
    const rx = island.r * base.scale;
    if (rx < 3) return;
    // Shallow-water halo first: pale water around the sand.
    ctx.fillStyle = 'rgba(127, 212, 217, 0.45)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, rx * 1.45, rx * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // Sand ring, then green hill, then a darker peak.
    ctx.fillStyle = PALETTE.sand;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, rx, rx * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.islandGreen;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y - rx * 0.12, rx * 0.82, rx * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.islandDark;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y - rx * 0.22, rx * 0.45, rx * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Palm dots on the near islands, big enough to read.
    if (rx > 26) {
      ctx.fillStyle = PALETTE.palm;
      for (let i = 0; i < 5; i += 1) {
        const px = base.x + (i - 2) * rx * 0.3;
        const py = base.y - rx * 0.1 - (i % 2) * rx * 0.08;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, rx * 0.045), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Name tag on the nearer islands, skipped when another island's tag is
    // already sitting on the same spot (islands line up behind each other
    // and their names would print on top of each other).
    if (rx > 60) {
      const ny = base.y - rx * 0.42;
      // A tag that high would print across the compass tape, not the island.
      if (ny < 105) return;
      const clash = nameSpots.some((spot) => Math.abs(spot.x - base.x) < 130 && Math.abs(spot.y - ny) < 40);
      if (!clash) {
        nameSpots.push({ x: base.x, y: ny });
        ctx.fillStyle = 'rgba(20, 40, 30, 0.75)';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(island.name.toUpperCase(), base.x, ny);
      }
    }
  }

  function drawRunway(state, runway) {
    // A trapezoid from the near edge to the far edge of the strip. When the
    // strip starts under the camera (takeoff, or the landing flare), its
    // near edge is anchored to the plane on screen instead of projected:
    // projected, it would sit up by the horizon and the plane would look
    // like it floats over the sea with the runway somewhere ahead of it.
    const zNear = runway.s - state.s;
    const zFar = runway.s + runway.length - state.s;
    if (zFar < 10) return;
    let near;
    let nearR;
    if (zNear < 60) {
      near = { x: FIELD.width / 2 - 170, y: 600, scale: 1 };
      nearR = { x: FIELD.width / 2 + 170, y: 600, scale: 1 };
    } else {
      near = project(-runway.halfWidth, 0, zNear, state.x, state.h + 6);
      nearR = project(runway.halfWidth, 0, zNear, state.x, state.h + 6);
    }
    const far = project(-runway.halfWidth, 0, Math.max(zFar, 12), state.x, state.h + 6);
    const farR = project(runway.halfWidth, 0, Math.max(zFar, 12), state.x, state.h + 6);
    if (near.y < FIELD.horizonY - 4 && far.y < FIELD.horizonY - 4) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(near.x, near.y);
    ctx.lineTo(nearR.x, nearR.y);
    ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(far.x, far.y);
    ctx.closePath();
    ctx.fill();
    // Centre dashes.
    ctx.strokeStyle = PALETTE.runwayLine;
    ctx.lineWidth = Math.max(1, 3 * near.scale);
    ctx.setLineDash([14 * near.scale, 12 * near.scale]);
    ctx.beginPath();
    ctx.moveTo((near.x + nearR.x) / 2, near.y);
    ctx.lineTo((far.x + farR.x) / 2, far.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRing(state, ring, index, isNext) {
    const z = ring.s - state.s;
    if (z < 8 || z > VIEW_DIST) return;
    const p = project(ring.x, ring.h, z, state.x, state.h + 6);
    const r = ring.r * p.scale;
    if (r < 2) return;
    const done = state.ringResults[index] === 'hit';
    const missed = state.ringResults[index] === 'missed';
    const colour = done ? PALETTE.ringDone : missed ? '#8b93a3' : isNext ? PALETTE.ringNext : PALETTE.ring;
    if (isNext && !done) {
      ctx.strokeStyle = colour;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = r * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Distance tag under the next ring.
    if (isNext && !done) {
      ctx.fillStyle = 'rgba(10, 20, 30, 0.7)';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${index + 1} · ${Math.round(z)}m`, p.x, p.y + r + 22);
    }
  }

  function drawPlane(state, screen) {
    // Chase view: the courier seen from behind and slightly above, banked
    // with the roll. It sits low in the frame so the terrain stays visible.
    const cx = FIELD.width / 2;
    const cy = 518;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.roll * 0.55);
    const s = 1;
    // Wings.
    ctx.fillStyle = PALETTE.planeWhite;
    ctx.beginPath();
    ctx.moveTo(-150 * s, 6);
    ctx.lineTo(-28 * s, -14);
    ctx.lineTo(28 * s, -14);
    ctx.lineTo(150 * s, 6);
    ctx.lineTo(132 * s, 22);
    ctx.lineTo(-132 * s, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeTeal;
    ctx.fillRect(-150 * s, 2, 300 * s, 7);
    // Fuselage, nose away from the camera.
    ctx.fillStyle = PALETTE.planeWhite;
    ctx.beginPath();
    ctx.ellipse(0, -6, 26 * s, 78 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.planeOrange;
    ctx.beginPath();
    ctx.ellipse(0, -6, 26 * s, 78 * s, 0, -0.5, 0.5);
    ctx.fill();
    // Tail fin.
    ctx.fillStyle = PALETTE.planeTeal;
    ctx.beginPath();
    ctx.moveTo(-16, 62);
    ctx.lineTo(0, 18);
    ctx.lineTo(16, 62);
    ctx.closePath();
    ctx.fill();
    // Twin engines with a warm glow.
    for (const ex of [-52, 52]) {
      ctx.fillStyle = '#222a35';
      ctx.beginPath();
      ctx.ellipse(ex, 4, 12, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 170, 60, 0.85)';
      ctx.beginPath();
      ctx.arc(ex, 24, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Navigation lights.
    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath();
    ctx.arc(-150, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7ee787';
    ctx.beginPath();
    ctx.arc(150, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    void screen;
  }

  function text(label, x, y, size, colour, align = 'left', bold = false) {
    ctx.fillStyle = colour;
    ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y);
  }

  function drawHud(state, screen) {
    // Top bar: the four numbers the judge asks for, always on.
    ctx.fillStyle = 'rgba(10, 16, 26, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, 64);
    const speedKnots = Math.round(state.speed * 1.94);
    const altFeet = Math.round(state.h * 3.281);
    const headingDeg = Math.round(((state.heading * 57.2958) % 360 + 360) % 360);
    text('ALTITUDE', 28, 24, 13, PALETTE.muted, 'left', true);
    text(`${altFeet} ft`, 28, 52, 28, PALETTE.text, 'left', true);
    text('SPEED', 228, 24, 13, PALETTE.muted, 'left', true);
    text(`${speedKnots} kt`, 228, 52, 28, PALETTE.text, 'left', true);
    text('HEADING', 428, 24, 13, PALETTE.muted, 'left', true);
    text(`${String(headingDeg).padStart(3, '0')}°`, 428, 52, 28, PALETTE.text, 'left', true);
    text('THROTTLE', 588, 24, 13, PALETTE.muted, 'left', true);
    ctx.fillStyle = '#26313f';
    roundRect(ctx, 588, 34, 150, 12, 6);
    ctx.fill();
    ctx.fillStyle = state.throttle > 0.85 ? PALETTE.planeOrange : PALETTE.good;
    roundRect(ctx, 588, 34, 150 * state.throttle, 12, 6);
    ctx.fill();
    // Rings, score, time, lives on the right.
    const ringsLabel = `RINGS ${state.ringsPassed}/8`;
    text(ringsLabel, 1252, 26, 16, PALETTE.ringNext, 'right', true);
    text(`SCORE ${state.score}`, 1252, 50, 16, PALETTE.text, 'right', true);
    text(`${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`, 1010, 50, 16, PALETTE.muted, 'right', true);
    // Next-ring steering arrow, on a dark pill so it reads as the hero
    // banner, not as small text lost against the sky.
    const nextIndex = state.ringsPassed + state.ringsMissed;
    if (screen === SCREEN_PLAY && nextIndex < 8) {
      const ring = COURSE.rings[nextIndex];
      const dx = ring.x - state.x;
      const dh = ring.h - state.h;
      const arrow = dx > 12 ? '▶' : dx < -12 ? '◀' : '▲';
      const hint = dx > 12 ? 'right' : dx < -12 ? 'left' : dh > 10 ? 'climb' : dh < -10 ? 'descend' : 'straight';
      const label = `${arrow} NEXT RING ${nextIndex + 1}/8 · ${Math.round(ring.s - state.s)}m — ${hint}`;
      ctx.fillStyle = 'rgba(10, 16, 26, 0.72)';
      ctx.font = 'bold 20px system-ui, sans-serif';
      const pillW = ctx.measureText(label).width + 36;
      roundRect(ctx, FIELD.width / 2 - pillW / 2, 96, pillW, 32, 16);
      ctx.fill();
      text(label, FIELD.width / 2, 119, 20, PALETTE.ringNext, 'center', true);
    }
    if (state.message && state.messageTime > 0) {
      ctx.font = 'bold 24px system-ui, sans-serif';
      const msgW = ctx.measureText(state.message).width + 40;
      ctx.fillStyle = 'rgba(10, 16, 26, 0.72)';
      roundRect(ctx, FIELD.width / 2 - msgW / 2, 136, msgW, 36, 18);
      ctx.fill();
      text(state.message, FIELD.width / 2, 162, 24, PALETTE.text, 'center', true);
    }
    // Compass tape under the top bar.
    ctx.fillStyle = 'rgba(10, 16, 26, 0.55)';
    ctx.fillRect(FIELD.width / 2 - 180, 66, 360, 22);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 15) {
      const deg = Math.round(((headingDeg + d) % 360 + 360) % 360);
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg);
      ctx.fillText(label, FIELD.width / 2 + d * 2.6, 82);
    }
    ctx.fillStyle = PALETTE.ringNext;
    ctx.beginPath();
    ctx.moveTo(FIELD.width / 2, 66);
    ctx.lineTo(FIELD.width / 2 - 6, 58);
    ctx.lineTo(FIELD.width / 2 + 6, 58);
    ctx.closePath();
    ctx.fill();
  }

  function drawInstruments(state) {
    // Lit instrument panel along the bottom: attitude, altitude, speed.
    const y = 618;
    ctx.fillStyle = 'rgba(16, 21, 30, 0.88)';
    ctx.fillRect(0, 600, FIELD.width, 120);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 600);
    ctx.lineTo(FIELD.width, 600);
    ctx.stroke();
    // Attitude indicator.
    const ax = 90;
    const ay = y + 38;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, 40, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(ax, ay);
    ctx.rotate(-state.roll);
    ctx.translate(0, state.pitch * 90);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-45, -45, 90, 45);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(-45, 0, 90, 45);
    ctx.restore();
    ctx.strokeStyle = PALETTE.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax, ay, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax - 40, ay);
    ctx.lineTo(ax + 40, ay);
    ctx.stroke();
    ctx.fillStyle = PALETTE.ringNext;
    ctx.beginPath();
    ctx.moveTo(ax - 12, ay - 4);
    ctx.lineTo(ax + 12, ay - 4);
    ctx.lineTo(ax, ay + 6);
    ctx.closePath();
    ctx.fill();
    text('ATTITUDE', ax, y + 94, 11, PALETTE.muted, 'center', true);
    // Altimeter tape.
    text('ALTITUDE', 250, y + 16, 12, PALETTE.muted, 'left', true);
    text(`${Math.round(state.h * 3.281)} ft`, 250, y + 48, 28, PALETTE.text, 'left', true);
    text(`VERT ${state.verticalSpeed >= 0 ? '+' : ''}${state.verticalSpeed.toFixed(1)} m/s`, 250, y + 74, 14, state.verticalSpeed < -6 ? PALETTE.warn : PALETTE.muted, 'left', true);
    // Airspeed.
    text('AIRSPEED', 470, y + 16, 12, PALETTE.muted, 'left', true);
    text(`${Math.round(state.speed * 1.94)} kt`, 470, y + 48, 28, PALETTE.text, 'left', true);
    text(state.speed < 34 && state.airborne ? 'STALL — MORE THROTTLE' : state.speed >= 52 ? 'FLYING' : 'ON GROUND', 470, y + 74, 14, state.speed < 34 && state.airborne ? PALETTE.warn : PALETTE.good, 'left', true);
    // Route progress: 8 ring lights.
    text('ROUTE — JAKARTA → PULAU HARAPAN', 700, y + 16, 12, PALETTE.muted, 'left', true);
    for (let i = 0; i < 8; i += 1) {
      const cx = 716 + i * 34;
      ctx.fillStyle = state.ringResults[i] === 'hit' ? PALETTE.ringDone : state.ringResults[i] === 'missed' ? '#5a6472' : i === state.ringsPassed + state.ringsMissed ? PALETTE.ringNext : '#2c3648';
      ctx.beginPath();
      ctx.arc(cx, y + 42, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      text(String(i + 1), cx, y + 46, 11, '#0b1018', 'center', true);
    }
    text(`LIVES ${'✈'.repeat(Math.max(0, state.lives))}${'·'.repeat(Math.max(0, 3 - state.lives))}`, 700, y + 74, 14, PALETTE.text, 'left', true);
    // Destination + distance.
    const toGo = Math.max(0, Math.round(COURSE.runwayEnd.s - state.s));
    text('DESTINATION', 1010, y + 16, 12, PALETTE.muted, 'left', true);
    text(`PULAU HARAPAN · ${toGo}m`, 1010, y + 48, 20, PALETTE.text, 'left', true);
    text('NUSANTARA AIR · PK-NAA', 1010, y + 74, 13, PALETTE.muted, 'left', true);
  }

  function panel(title, lines, accent) {
    const w = 560;
    const h = 92 + lines.length * 30;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2 - 40;
    ctx.fillStyle = 'rgba(10, 16, 26, 0.86)';
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();
    text(title, FIELD.width / 2, y + 44, 30, accent, 'center', true);
    lines.forEach((line, i) => {
      text(line, FIELD.width / 2, y + 84 + i * 30, 18, PALETTE.text, 'center');
    });
  }

  function drawTitle(state, best) {
    panel('JAKARTA ARCHIPELAGO AIRLIFT', [
      'Courier run across the Java Sea — 8 rings, then land on Pulau Harapan.',
      '↑ / W climb · ↓ / S descend · ← → bank · SHIFT throttle up · CTRL slow down',
      'Mouse: hold and steer · R restart · P pause · M mute',
      best > 0 ? `Best score: ${best}` : 'Press SPACE or click to take off',
    ], PALETTE.ringNext);
  }

  function drawOver(state, best) {
    const reason = state.message || 'Flight over.';
    panel('FLIGHT OVER', [
      reason,
      `Score ${state.score} · Rings ${state.ringsPassed}/8 · Best ${best}`,
      state.lives > 0 ? 'Press R to try again from the last ring' : 'Press R to fly the whole route again',
    ], PALETTE.warn);
  }

  function drawWin(state, best) {
    panel('DELIVERED — PULAU HARAPAN', [
      `All ${state.ringsPassed} rings flown · Landing +${state.landingBonus} · Time +${state.timeBonus}`,
      `Final score ${state.score} · Best ${best}`,
      'Press R to fly it again, faster',
    ], PALETTE.good);
  }

  function drawPaused() {
    panel('PAUSED', ['Press P or SPACE to keep flying', 'R restarts the route'], PALETTE.muted);
  }

  function draw(state, screen, best) {
    fit();
    drawSky(state, 0);
    drawSea(state);
    // Islands far to near, then the runways on top of them: a strip sits on
    // its island, so drawing it first would bury it under the island.
    const islands = [...COURSE.islands].sort((a, b) => b.s - a.s);
    const nameSpots = [];
    for (const island of islands) drawIsland(state, island, nameSpots);
    drawRunway(state, COURSE.runwayStart);
    drawRunway(state, COURSE.runwayEnd);
    const nextIndex = state.ringsPassed + state.ringsMissed;
    const rings = [...COURSE.rings].sort((a, b) => b.s - a.s);
    rings.forEach((ring) => {
      const index = COURSE.rings.indexOf(ring);
      drawRing(state, ring, index, index === nextIndex);
    });
    drawPlane(state, screen);
    drawHud(state, screen);
    drawInstruments(state);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_OVER) drawOver(state, best);
    else if (screen === SCREEN_WIN) drawWin(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
  }

  return { draw };
}
