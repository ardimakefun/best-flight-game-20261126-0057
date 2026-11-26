// Procedural dawn sky, volumetric sunbeams, layered mesas, shaded heightfield canyon, river reflections, runways, and glowing 3D rings.

import { PALETTE, SUN_DIR, VIEW, WORLD_BOUNDS } from './config.js';
import { clamp, clipAndProjectPoly, cross, dot, lerp, norm, projectWorld, sub } from './math3d.js';
import { canyonCenterX, classifySurface, riverCenterX, riverHalfWidth, terrainHeight } from './terrain.js';

const SUN_NORM = norm(SUN_DIR);

// Cross-section lateral offsets from canyon centerline (symmetric, denser inside valley & cliffs)
const LAT_OFFSETS = [
  -620, -410, -270, -185, -130, -88, -58, -36, -18, 0, 18, 36, 58, 88, 130, 185, 270, 410, 620,
];

// Adaptive forward Z offsets from camera (dense near aircraft, broad toward horizon)
const Z_STEPS = (() => {
  const arr = [];
  let z = -20;
  while (z < 1420) {
    arr.push(z);
    if (z < 160) z += 20;
    else if (z < 460) z += 30;
    else if (z < 920) z += 48;
    else z += 75;
  }
  return arr;
})();

function rgbStr(r, g, b) {
  return `rgb(${clamp(Math.round(r), 0, 255)},${clamp(Math.round(g), 0, 255)},${clamp(Math.round(b), 0, 255)})`;
}

function shadeTerrainQuad(surface, yAvg, normal, dist, zMid, xMid) {
  const ndl = clamp(dot(normal, SUN_NORM), -0.45, 1.0);
  const sunLit = Math.max(0, ndl);
  const shade = 0.44 + sunLit * 0.62;
  const shadowCool = ndl < 0 ? Math.abs(ndl) * 0.55 : 0;

  let r;
  let g;
  let b;

  if (surface === 'river') {
    const sunGlint = Math.max(0, Math.sin(zMid * 0.055 + xMid * 0.1)) * 0.45 + 0.35;
    r = lerp(34, 245, sunGlint * 0.65);
    g = lerp(74, 152, sunGlint * 0.65);
    b = lerp(112, 88, sunGlint * 0.5);
  } else if (surface === 'airstrip' || surface === 'runway') {
    r = 68 * shade;
    g = 62 * shade;
    b = 64 * shade;
  } else if (surface === 'bank') {
    r = (152 + Math.sin(zMid * 0.04) * 10) * shade;
    g = 96 * shade;
    b = 58 * shade;
  } else if (surface === 'floor') {
    r = 178 * shade;
    g = 98 * shade;
    b = 54 * shade;
  } else {
    const strata = Math.sin(yAvg * 0.24) * 0.5 + 0.5;
    const highMesa = clamp((yAvg - 95) / 70, 0, 1);
    const baseR = lerp(172, 212, strata * 0.6 + highMesa * 0.4);
    const baseG = lerp(66, 108, strata * 0.55 + highMesa * 0.45);
    const baseB = lerp(42, 62, strata * 0.4);

    r = baseR * shade + sunLit * 38;
    g = baseG * shade + sunLit * 18;
    b = baseB * shade + shadowCool * 42;
  }

  const fog = clamp(1 - Math.exp(-Math.max(0, dist - 220) / 860), 0, 0.88);
  r = lerp(r, PALETTE.hazeColor[0], fog);
  g = lerp(g, PALETTE.hazeColor[1], fog);
  b = lerp(b, PALETTE.hazeColor[2], fog);

  return rgbStr(r, g, b);
}

export function drawScene(ctx, world, cam) {
  const s = world.state;
  const horizonY = clamp(VIEW.height * 0.51 + Math.tan(cam.pitch) * cam.fov * 0.85, 80, VIEW.height - 60);

  drawDawnSky(ctx, cam, horizonY, s.timeSec);
  drawDistantRidges(ctx, cam, horizonY);
  drawTerrainGrid(ctx, cam, s.timeSec, s.mesas, s.arches);
  drawRunwaysAndProps(ctx, cam, s);
  drawSceneryProps(ctx, cam, s.scenery);
  drawRingPathGuides(ctx, cam, s.rings);
  drawTargetRings(ctx, cam, s.rings, s.timeSec);
  drawWingTrails(ctx, cam, s.trails);
  drawParticles(ctx, cam, s.particles);
}

function drawDawnSky(ctx, cam, horizonY, timeSec) {
  const w = VIEW.width;
  const h = VIEW.height;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY + 55);
  skyGrad.addColorStop(0.0, `rgb(${PALETTE.skyZenith.join(',')})`);
  skyGrad.addColorStop(0.28, `rgb(${PALETTE.skyUpper.join(',')})`);
  skyGrad.addColorStop(0.58, `rgb(${PALETTE.skyMid.join(',')})`);
  skyGrad.addColorStop(0.83, `rgb(${PALETTE.skyWarm.join(',')})`);
  skyGrad.addColorStop(1.0, `rgb(${PALETTE.skyHorizon.join(',')})`);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, horizonY + 55);

  const lowerGrad = ctx.createLinearGradient(0, horizonY, 0, h);
  lowerGrad.addColorStop(0.0, '#e87e3c');
  lowerGrad.addColorStop(0.25, '#8f3920');
  lowerGrad.addColorStop(1.0, '#2c1110');
  ctx.fillStyle = lowerGrad;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  ctx.save();
  for (let i = 0; i < 65; i += 1) {
    const sx = (((i * 997 + 131) * 1664525) >>> 0) % w;
    const sy = (((i * 613 + 79) * 1013904223) >>> 0) % Math.max(40, Math.floor(horizonY * 0.52));
    const fade = (1 - sy / (horizonY * 0.55)) * (0.45 + 0.35 * Math.sin(timeSec * 1.8 + i));
    ctx.globalAlpha = clamp(fade, 0, 0.75);
    ctx.fillStyle = '#fff5dc';
    ctx.fillRect(sx, sy, 1.6, 1.6);
  }
  ctx.restore();

  const sunYaw = Math.atan2(SUN_NORM.x, SUN_NORM.z);
  const relSunYaw = sunYaw - cam.yaw;
  const sunX = w * 0.5 + Math.tan(clamp(relSunYaw, -1.2, 1.2)) * cam.fov * 0.78;
  const sunY = horizonY - SUN_NORM.y * cam.fov * 0.42;

  const bloom = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 340);
  bloom.addColorStop(0, 'rgba(255, 246, 200, 0.92)');
  bloom.addColorStop(0.14, 'rgba(255, 198, 92, 0.55)');
  bloom.addColorStop(0.45, 'rgba(255, 118, 42, 0.22)');
  bloom.addColorStop(1, 'rgba(255, 80, 20, 0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, horizonY + 140);

  const disc = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 38);
  disc.addColorStop(0, '#fffef2');
  disc.addColorStop(0.55, '#ffe184');
  disc.addColorStop(1, 'rgba(255, 152, 48, 0)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  for (let i = 0; i < 7; i += 1) {
    const a = 0.25 + i * 0.34 + Math.sin(timeSec * 0.25 + i) * 0.04;
    const rayLen = 420 + (i % 3) * 90;
    const spread = 34 + i * 7;
    ctx.globalAlpha = 0.045;
    ctx.fillStyle = '#ffe59c';
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(sunX + Math.cos(a) * rayLen - Math.sin(a) * spread, sunY + Math.sin(a) * rayLen + Math.cos(a) * spread);
    ctx.lineTo(sunX + Math.cos(a) * rayLen + Math.sin(a) * spread, sunY + Math.sin(a) * rayLen - Math.cos(a) * spread);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const clouds = [
    { rx: 0.14, ry: 0.34, rw: 280, rh: 24 },
    { rx: 0.42, ry: 0.25, rw: 330, rh: 26 },
    { rx: 0.72, ry: 0.31, rw: 310, rh: 25 },
    { rx: 0.89, ry: 0.38, rw: 240, rh: 20 },
  ];
  ctx.save();
  for (let i = 0; i < clouds.length; i += 1) {
    const c = clouds[i];
    const cx = ((c.rx * w - cam.yaw * 220 + timeSec * 2.5) % (w + 320) + (w + 320)) % (w + 320) - 160;
    const cy = horizonY * c.ry + 45;
    for (let p = -2; p <= 2; p += 1) {
      const px = cx + p * c.rw * 0.18;
      const py = cy + Math.abs(p) * 3 - (p % 2 === 0 ? 4 : 0);
      const pr = c.rw * (0.28 - Math.abs(p) * 0.04);
      const cg = ctx.createRadialGradient(px, py + c.rh * 0.2, 4, px, py, pr);
      cg.addColorStop(0, 'rgba(255, 198, 120, 0.42)');
      cg.addColorStop(0.45, 'rgba(232, 114, 72, 0.24)');
      cg.addColorStop(1, 'rgba(120, 48, 68, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(px, py, pr, c.rh * (1.0 - Math.abs(p) * 0.14), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawDistantRidges(ctx, cam, horizonY) {
  const w = VIEW.width;
  const shift = cam.yaw * 480;

  const drawLayer = (amp, freq, yBase, fill, stepX) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 80);
    for (let x = 0; x <= w + stepX; x += stepX) {
      const worldAng = (x + shift) * freq;
      const plateau = Math.sin(worldAng) * 0.6 + Math.sin(worldAng * 2.3 + 1.4) * 0.4;
      const mesaShape = clamp(plateau * 1.45, -0.75, 0.72);
      const y = yBase - Math.max(0, mesaShape) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizonY + 80);
    ctx.closePath();
    ctx.fill();
  };

  drawLayer(56, 0.0052, horizonY + 4, 'rgba(128, 52, 58, 0.68)', 18);
  drawLayer(38, 0.0088, horizonY + 12, 'rgba(168, 68, 46, 0.82)', 14);
}

function drawTerrainGrid(ctx, cam, timeSec, mesas, arches) {
  const baseZ = Math.floor(cam.pos.z / 20) * 20;
  const cols = LAT_OFFSETS.length;
  const rows = Z_STEPS.length;

  const grid = new Array(rows);
  for (let r = 0; r < rows; r += 1) {
    const z = baseZ + Z_STEPS[r];
    const cx = canyonCenterX(z);
    const rx = riverCenterX(z);
    const rowArr = new Array(cols);
    for (let c = 0; c < cols; c += 1) {
      let x = cx + LAT_OFFSETS[c];
      if (Math.abs(LAT_OFFSETS[c]) === 18) {
        x = rx + Math.sign(LAT_OFFSETS[c]) * (riverHalfWidth(z) + 2);
      } else if (LAT_OFFSETS[c] === 0) {
        x = rx;
      }
      const y = terrainHeight(x, z);
      rowArr[c] = { x, y, z };
    }
    grid[r] = rowArr;
  }

  const colOrder = [];
  let lo = 0;
  let hi = cols - 2;
  while (lo <= hi) {
    colOrder.push(lo);
    if (lo !== hi) colOrder.push(hi);
    lo += 1;
    hi -= 1;
  }

  for (let r = rows - 2; r >= 0; r -= 1) {
    const rowNear = grid[r];
    const rowFar = grid[r + 1];
    const zNear = baseZ + Z_STEPS[r];
    const zFar = baseZ + Z_STEPS[r + 1];

    for (let oi = 0; oi < colOrder.length; oi += 1) {
      const c = colOrder[oi];
      const p00 = rowNear[c];
      const p10 = rowNear[c + 1];
      const p11 = rowFar[c + 1];
      const p01 = rowFar[c];

      const proj = clipAndProjectPoly([p00, p10, p11, p01], cam);
      if (!proj) continue;

      const xMid = (p00.x + p10.x + p11.x + p01.x) * 0.25;
      const yMid = (p00.y + p10.y + p11.y + p01.y) * 0.25;
      const zMid = (p00.z + p10.z + p11.z + p01.z) * 0.25;

      const e1 = sub(p10, p00);
      const e2 = sub(p01, p00);
      let n = norm(cross(e2, e1));
      if (n.y < 0) n = { x: -n.x, y: -n.y, z: -n.z };

      const surface = classifySurface(xMid, zMid, yMid);
      const dist = Math.hypot(xMid - cam.pos.x, zMid - cam.pos.z);

      const fill = shadeTerrainQuad(surface, yMid, n, dist, zMid + timeSec * 2.5, xMid);
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(proj.pts[0].x, proj.pts[0].y);
      for (let k = 1; k < proj.pts.length; k += 1) ctx.lineTo(proj.pts[k].x, proj.pts[k].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Interleave mesas and natural red-rock arches inside this Z-band
    for (let mIdx = 0; mIdx < mesas.length; mIdx += 1) {
      const m = mesas[mIdx];
      if (m.z >= zNear && m.z < zFar) {
        drawSingleMesa(ctx, cam, m);
      }
    }
    for (let aIdx = 0; aIdx < arches.length; aIdx += 1) {
      const arch = arches[aIdx];
      if (arch.z >= zNear && arch.z < zFar) {
        drawSingleArch(ctx, cam, arch);
      }
    }
  }
}

function drawSingleArch(ctx, cam, arch) {
  const dz = arch.z - cam.pos.z;
  if (dz < -40 || dz > VIEW.farZ) return;
  const dist = Math.hypot(arch.x - cam.pos.x, dz);
  const fog = clamp(1 - Math.exp(-Math.max(0, dist - 240) / 860), 0, 0.88);
  const segs = 10;
  const hd = arch.depth * 0.5;
  const faces = [];

  for (let i = 0; i < segs; i += 1) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const x0 = arch.x + lerp(-arch.halfSpan, arch.halfSpan, t0);
    const x1 = arch.x + lerp(-arch.halfSpan, arch.halfSpan, t1);
    const s0 = Math.sin(t0 * Math.PI);
    const s1 = Math.sin(t1 * Math.PI);
    const yBot0 = 18 + s0 * arch.clearY;
    const yBot1 = 18 + s1 * arch.clearY;
    const yTop0 = arch.clearY + arch.thick + 14 * (1 - s0 * 0.35);
    const yTop1 = arch.clearY + arch.thick + 14 * (1 - s1 * 0.35);

    const zFront = arch.z - hd;
    const zBack = arch.z + hd;

    // Front face (facing incoming pilot), underside soffit, and top ridge
    const qFront = [
      { x: x0, y: yBot0, z: zFront },
      { x: x1, y: yBot1, z: zFront },
      { x: x1, y: yTop1, z: zFront },
      { x: x0, y: yTop0, z: zFront },
    ];
    const qUnder = [
      { x: x0, y: yBot0, z: zFront },
      { x: x1, y: yBot1, z: zFront },
      { x: x1, y: yBot1, z: zBack },
      { x: x0, y: yBot0, z: zBack },
    ];
    const qTop = [
      { x: x0, y: yTop0, z: zFront },
      { x: x1, y: yTop1, z: zFront },
      { x: x1, y: yTop1, z: zBack },
      { x: x0, y: yTop0, z: zBack },
    ];

    const list = [
      { q: qFront, shade: 0.62, lit: 0.1 },
      { q: qUnder, shade: 0.38, lit: 0.0 },
      { q: qTop, shade: 0.88, lit: 0.3 },
    ];
    for (let k = 0; k < list.length; k += 1) {
      const p = clipAndProjectPoly(list[k].q, cam);
      if (!p) continue;
      const r = lerp((178 + list[k].lit * 42) * list[k].shade, PALETTE.hazeColor[0], fog);
      const g = lerp((70 + list[k].lit * 20) * list[k].shade, PALETTE.hazeColor[1], fog);
      const b = lerp(46 * list[k].shade + (list[k].shade < 0.5 ? 16 : 0), PALETTE.hazeColor[2], fog);
      faces.push({ pts: p.pts, depth: p.depth, fill: rgbStr(r, g, b) });
    }
  }

  faces.sort((a, b) => b.depth - a.depth);
  for (let i = 0; i < faces.length; i += 1) {
    const f = faces[i];
    ctx.fillStyle = f.fill;
    ctx.beginPath();
    ctx.moveTo(f.pts[0].x, f.pts[0].y);
    for (let k = 1; k < f.pts.length; k += 1) ctx.lineTo(f.pts[k].x, f.pts[k].y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRunwaysAndProps(ctx, cam, state) {
  drawStrip(ctx, cam, WORLD_BOUNDS.departureZStart, WORLD_BOUNDS.departureZEnd, 18, false, state);
  drawStrip(ctx, cam, WORLD_BOUNDS.runwayZStart, WORLD_BOUNDS.runwayZEnd, WORLD_BOUNDS.runwayHalfWidth, true, state);
}

function drawStrip(ctx, cam, zStart, zEnd, hw, isDestination, state) {
  if (zEnd < cam.pos.z - 80 || zStart > cam.pos.z + VIEW.farZ) return;

  const segs = isDestination ? 10 : 5;
  for (let i = segs - 1; i >= 0; i -= 1) {
    const za = lerp(zStart, zEnd, i / segs);
    const zb = lerp(zStart, zEnd, (i + 1) / segs);
    const cxa = canyonCenterX(za);
    const cxb = canyonCenterX(zb);
    const ya = terrainHeight(cxa, za) + 0.35;
    const yb = terrainHeight(cxb, zb) + 0.35;

    const poly = clipAndProjectPoly([
      { x: cxa - hw, y: ya, z: za },
      { x: cxa + hw, y: ya, z: za },
      { x: cxb + hw, y: yb, z: zb },
      { x: cxb - hw, y: yb, z: zb },
    ], cam);
    if (!poly) continue;

    ctx.fillStyle = isDestination ? '#2f2d34' : '#584438';
    ctx.beginPath();
    ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
    for (let k = 1; k < poly.pts.length; k += 1) ctx.lineTo(poly.pts[k].x, poly.pts[k].y);
    ctx.closePath();
    ctx.fill();
  }

  const dashes = isDestination ? 14 : 7;
  for (let d = 0; d < dashes; d += 1) {
    const za = lerp(zStart + 18, zEnd - 18, d / dashes);
    const zb = lerp(zStart + 18, zEnd - 18, (d + 0.45) / dashes);
    const cxa = canyonCenterX(za);
    const cxb = canyonCenterX(zb);
    const pa = projectWorld({ x: cxa, y: terrainHeight(cxa, za) + 0.55, z: za }, cam);
    const pb = projectWorld({ x: cxb, y: terrainHeight(cxb, zb) + 0.55, z: zb }, cam);
    if (!pa || !pb) continue;
    ctx.strokeStyle = isDestination ? '#fff4d2' : '#f2c97d';
    ctx.lineWidth = clamp(180 / Math.max(pa.z, 20), 1.5, 4.5);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  if (isDestination) {
    const cx0 = canyonCenterX(zStart);
    const y0 = terrainHeight(cx0, zStart) + 0.6;
    for (let b = -3; b <= 3; b += 1) {
      if (b === 0) continue;
      const p1 = projectWorld({ x: cx0 + b * 6, y: y0, z: zStart + 8 }, cam);
      const p2 = projectWorld({ x: cx0 + b * 6, y: y0, z: zStart + 28 }, cam);
      if (!p1 || !p2) continue;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = clamp(240 / p1.z, 1.5, 5);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    const lightCol = state.clearedToLand ? '#5cf29c' : '#ffaa3b';
    for (let i = 0; i <= 8; i += 1) {
      const lz = lerp(zStart, zEnd, i / 8);
      const lcx = canyonCenterX(lz);
      const ly = terrainHeight(lcx, lz) + 1.2;
      for (const side of [-1, 1]) {
        const pl = projectWorld({ x: lcx + side * (hw + 1.5), y: ly, z: lz }, cam);
        if (!pl) continue;
        const r = clamp(420 / pl.z, 2, 8);
        const col = i === 0 ? '#5cf29c' : i === 8 ? '#ff5040' : lightCol;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(pl.x, pl.y, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(pl.x, pl.y, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // PAPI 4-light visual glide-slope indicator left of threshold
    const dzRunway = Math.max(40, zStart + 80 - state.plane.pos.z);
    const glideSlope = (state.plane.pos.y - y0) / dzRunway;
    for (let p = 0; p < 4; p += 1) {
      const papiPt = projectWorld({ x: cx0 - hw - 10 - p * 4.5, y: y0 + 1.6, z: zStart + 85 }, cam);
      if (!papiPt) continue;
      const thresholdSlope = 0.03 + p * 0.025;
      const isWhite = glideSlope > thresholdSlope;
      const pr = clamp(380 / papiPt.z, 2, 6);
      ctx.fillStyle = isWhite ? '#fff9e6' : '#ff4638';
      ctx.beginPath();
      ctx.arc(papiPt.x, papiPt.y, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    drawTowerAndHangar(ctx, cam, cx0 + hw + 32, zStart + 180, state.timeSec);
  }
}

function drawTowerAndHangar(ctx, cam, x, z, timeSec = 0) {
  const y = terrainHeight(x, z);
  if (z < cam.pos.z - 60 || z > cam.pos.z + VIEW.farZ) return;

  const hw = 18;
  const hd = 24;
  const hh = 13;
  const hangarFaces = [
    [{ x: x - hw, y, z: z - hd }, { x: x + hw, y, z: z - hd }, { x: x + hw, y: y + hh, z: z - hd }, { x: x - hw, y: y + hh, z: z - hd }],
    [{ x: x - hw, y, z: z - hd }, { x: x - hw, y, z: z + hd }, { x: x - hw, y: y + hh, z: z + hd }, { x: x - hw, y: y + hh, z: z - hd }],
    [{ x: x - hw, y: y + hh, z: z - hd }, { x: x + hw, y: y + hh, z: z - hd }, { x: x + hw, y: y + hh, z: z + hd }, { x: x - hw, y: y + hh, z: z + hd }],
  ];
  const cols = ['#8a4b38', '#b86846', '#d89c6a'];
  for (let i = 0; i < hangarFaces.length; i += 1) {
    const p = clipAndProjectPoly(hangarFaces[i], cam);
    if (!p) continue;
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(p.pts[0].x, p.pts[0].y);
    for (let k = 1; k < p.pts.length; k += 1) ctx.lineTo(p.pts[k].x, p.pts[k].y);
    ctx.closePath();
    ctx.fill();
  }

  const base = projectWorld({ x: x - 16, y, z: z - 38 }, cam);
  const top = projectWorld({ x: x - 16, y: y + 26, z: z - 38 }, cam);
  if (base && top) {
    ctx.strokeStyle = '#c8aa8a';
    ctx.lineWidth = clamp(240 / base.z, 2, 6);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    const cabR = clamp(540 / top.z, 3, 13);
    ctx.fillStyle = '#5cf29c';
    ctx.beginPath();
    ctx.arc(top.x, top.y, cabR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Animated orange/white windsock beside the runway threshold
  const wsX = x - 48;
  const wsZ = z - 125;
  const wsY = terrainHeight(wsX, wsZ);
  const wsBase = projectWorld({ x: wsX, y: wsY, z: wsZ }, cam);
  const wsTop = projectWorld({ x: wsX, y: wsY + 11, z: wsZ }, cam);
  const wsTip = projectWorld({ x: wsX + 6 + Math.sin(timeSec * 4) * 1.2, y: wsY + 10.2, z: wsZ + 1.5 }, cam);
  if (wsBase && wsTop && wsTip) {
    ctx.strokeStyle = '#d8c8b8';
    ctx.lineWidth = clamp(140 / wsBase.z, 1.5, 3);
    ctx.beginPath();
    ctx.moveTo(wsBase.x, wsBase.y);
    ctx.lineTo(wsTop.x, wsTop.y);
    ctx.stroke();
    ctx.strokeStyle = '#ff6d30';
    ctx.lineWidth = clamp(320 / wsTop.z, 2, 6);
    ctx.beginPath();
    ctx.moveTo(wsTop.x, wsTop.y);
    ctx.lineTo(wsTip.x, wsTip.y);
    ctx.stroke();
  }
}

function drawSingleMesa(ctx, cam, m) {
  const dz = m.z - cam.pos.z;
  const dist = Math.hypot(m.x - cam.pos.x, dz);
  const fog = clamp(1 - Math.exp(-Math.max(0, dist - 240) / 860), 0, 0.88);
  const sides = m.sides;
  const yBot = m.baseY;
  const yMid = m.baseY + m.height * 0.52;
  const yTop = m.baseY + m.height;
  const rMid = lerp(m.radiusBot, m.radiusTop, 0.58);

  const faces = [];
  const topPts = [];
  for (let s = 0; s < sides; s += 1) {
    const a0 = (s / sides) * Math.PI * 2 + 0.35;
    const a1 = ((s + 1) / sides) * Math.PI * 2 + 0.35;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);

    topPts.push({ x: m.x + c0 * m.radiusTop, y: yTop, z: m.z + s0 * m.radiusTop });

    const qLow = [
      { x: m.x + c0 * m.radiusBot, y: yBot, z: m.z + s0 * m.radiusBot },
      { x: m.x + c1 * m.radiusBot, y: yBot, z: m.z + s1 * m.radiusBot },
      { x: m.x + c1 * rMid, y: yMid, z: m.z + s1 * rMid },
      { x: m.x + c0 * rMid, y: yMid, z: m.z + s0 * rMid },
    ];
    const qHigh = [
      { x: m.x + c0 * rMid, y: yMid, z: m.z + s0 * rMid },
      { x: m.x + c1 * rMid, y: yMid, z: m.z + s1 * rMid },
      { x: m.x + c1 * m.radiusTop, y: yTop, z: m.z + s1 * m.radiusTop },
      { x: m.x + c0 * m.radiusTop, y: yTop, z: m.z + s0 * m.radiusTop },
    ];

    const n = norm({ x: c0 + c1, y: 0.35, z: s0 + s1 });
    const ndl = clamp(dot(n, SUN_NORM), -0.4, 1);

    for (let tier = 0; tier < 2; tier += 1) {
      const quad = tier === 0 ? qLow : qHigh;
      const proj = clipAndProjectPoly(quad, cam);
      if (!proj) continue;
      const shade = (tier === 0 ? 0.5 : 0.62) + Math.max(0, ndl) * 0.48;
      const r = lerp((176 + Math.max(0, ndl) * 40) * shade, PALETTE.hazeColor[0], fog);
      const g = lerp((68 + Math.max(0, ndl) * 18) * shade, PALETTE.hazeColor[1], fog);
      const b = lerp((44 + (ndl < 0 ? 22 : 0)) * shade, PALETTE.hazeColor[2], fog);
      faces.push({ pts: proj.pts, depth: proj.depth, fill: rgbStr(r, g, b) });
    }
  }

  const topProj = clipAndProjectPoly(topPts, cam);
  if (topProj) {
    const r = lerp(214 * 0.72, PALETTE.hazeColor[0], fog);
    const g = lerp(112 * 0.72, PALETTE.hazeColor[1], fog);
    const b = lerp(64 * 0.72, PALETTE.hazeColor[2], fog);
    faces.push({ pts: topProj.pts, depth: topProj.depth, fill: rgbStr(r, g, b) });
  }

  faces.sort((a, b) => b.depth - a.depth);
  for (let f = 0; f < faces.length; f += 1) {
    const face = faces[f];
    ctx.fillStyle = face.fill;
    ctx.beginPath();
    ctx.moveTo(face.pts[0].x, face.pts[0].y);
    for (let k = 1; k < face.pts.length; k += 1) ctx.lineTo(face.pts[k].x, face.pts[k].y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSceneryProps(ctx, cam, props) {
  for (let i = 0; i < props.length; i += 1) {
    const p = props[i];
    const dz = p.z - cam.pos.z;
    if (dz < 4 || dz > 720) continue;
    const sp = projectWorld({ x: p.x, y: p.y, z: p.z }, cam);
    if (!sp) continue;

    const h = clamp((p.scale * cam.fov) / sp.z, 2, 34);
    const fog = clamp(1 - sp.z / 720, 0.15, 1);
    ctx.save();
    ctx.globalAlpha = fog;
    if (p.kind === 'scrub') {
      ctx.fillStyle = '#4e5d38';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y - h * 0.3, h * 0.65, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'cactus') {
      ctx.strokeStyle = '#384c2e';
      ctx.lineWidth = Math.max(1.5, h * 0.22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sp.x, sp.y - h * 1.6);
      ctx.moveTo(sp.x, sp.y - h * 0.85);
      ctx.lineTo(sp.x - h * 0.45, sp.y - h * 0.95);
      ctx.lineTo(sp.x - h * 0.45, sp.y - h * 1.35);
      ctx.moveTo(sp.x, sp.y - h * 0.65);
      ctx.lineTo(sp.x + h * 0.45, sp.y - h * 0.75);
      ctx.lineTo(sp.x + h * 0.45, sp.y - h * 1.15);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#8b3e28';
      ctx.beginPath();
      ctx.moveTo(sp.x - h * 0.9, sp.y);
      ctx.lineTo(sp.x - h * 0.45, sp.y - h * 0.8);
      ctx.lineTo(sp.x + h * 0.55, sp.y - h * 0.65);
      ctx.lineTo(sp.x + h * 0.95, sp.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawRingPathGuides(ctx, cam, rings) {
  let activeIdx = -1;
  for (let i = 0; i < rings.length; i += 1) {
    if (!rings[i].passed && !rings[i].missed) {
      activeIdx = i;
      break;
    }
  }
  if (activeIdx < 0 || activeIdx >= rings.length - 1) return;

  const a = rings[activeIdx];
  const b = rings[activeIdx + 1];
  for (let s = 1; s <= 5; s += 1) {
    const t = s / 6;
    const p = projectWorld({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) }, cam);
    if (!p) continue;
    const r = clamp(900 / p.z, 1.5, 5);
    ctx.fillStyle = 'rgba(255, 212, 108, 0.5)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTargetRings(ctx, cam, rings, timeSec) {
  let nextIdx = -1;
  for (let i = 0; i < rings.length; i += 1) {
    if (!rings[i].passed && !rings[i].missed) {
      nextIdx = i;
      break;
    }
  }

  for (let i = rings.length - 1; i >= 0; i -= 1) {
    const r = rings[i];
    if (r.missed) continue;
    if (r.passed && r.flash <= 0) continue;

    const dz = r.z - cam.pos.z;
    if (dz < 2 || dz > VIEW.farZ) continue;

    const isNext = i === nextIdx;
    const isPassed = r.passed;
    const isBonus = !!r.isBonus;
    const fog = clamp(1 - dz / VIEW.farZ, 0.15, 1);

    const segs = 24;
    const cosY = Math.cos(r.yaw);
    const sinY = Math.sin(r.yaw);
    const screenPts = [];
    const outerPts = [];
    for (let k = 0; k <= segs; k += 1) {
      const a = (k / segs) * Math.PI * 2;
      const lx = Math.cos(a) * r.radius;
      const ly = Math.sin(a) * r.radius;
      const sp = projectWorld({ x: r.x + lx * cosY, y: r.y + ly, z: r.z - lx * sinY }, cam);
      if (sp) screenPts.push(sp);
      if (isBonus) {
        const ox = Math.cos(a) * (r.radius * 1.13);
        const oy = Math.sin(a) * (r.radius * 1.13);
        const osp = projectWorld({ x: r.x + ox * cosY, y: r.y + oy, z: r.z - ox * sinY }, cam);
        if (osp) outerPts.push(osp);
      }
    }
    if (screenPts.length < 4) continue;

    const pulse = isNext ? 0.8 + 0.2 * Math.sin(timeSec * 5) : isBonus ? 0.85 : 0.65;
    const alpha = (isPassed ? r.flash : fog) * pulse;
    const coreColor = isPassed ? '#5cf29c' : isBonus ? '#ffd700' : isNext ? '#ff9e3d' : '#5ee7ff';
    const glowColor = isPassed
      ? 'rgba(92,242,156,0.34)'
      : isBonus
        ? 'rgba(255,215,0,0.54)'
        : isNext
          ? 'rgba(255,150,52,0.36)'
          : 'rgba(94,231,255,0.22)';
    const baseThick = clamp((2600 / dz), 2.5, 13.5);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.globalAlpha = alpha * 0.48;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = baseThick * (isBonus ? 3.5 : 3.2);
    ctx.beginPath();
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    for (let k = 1; k < screenPts.length; k += 1) ctx.lineTo(screenPts[k].x, screenPts[k].y);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.96;
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = baseThick;
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.88;
    ctx.strokeStyle = isBonus ? '#fff7b2' : '#fffbe8';
    ctx.lineWidth = Math.max(1, baseThick * 0.34);
    ctx.stroke();

    if (isBonus && !isPassed && outerPts.length >= 4) {
      ctx.globalAlpha = alpha * 0.72;
      ctx.strokeStyle = '#ffe566';
      ctx.lineWidth = Math.max(1.5, baseThick * 0.28);
      ctx.beginPath();
      ctx.moveTo(outerPts[0].x, outerPts[0].y);
      for (let k = 1; k < outerPts.length; k += 1) ctx.lineTo(outerPts[k].x, outerPts[k].y);
      ctx.stroke();
    }

    if ((isNext || isBonus) && dz < 950) {
      const rot = timeSec * (isBonus ? 2.1 : 1.5);
      const orbCount = isBonus ? 8 : 4;
      for (let t = 0; t < orbCount; t += 1) {
        const a = rot + (t * Math.PI * 2) / orbCount;
        const orbRad = r.radius + (isBonus ? 4.5 : 4);
        const wx = r.x + Math.cos(a) * orbRad * cosY;
        const wy = r.y + Math.sin(a) * orbRad;
        const wz = r.z - Math.cos(a) * orbRad * sinY;
        const pt = projectWorld({ x: wx, y: wy, z: wz }, cam);
        if (!pt) continue;
        ctx.globalAlpha = fog;
        ctx.fillStyle = isBonus ? '#ffe978' : '#fff5cc';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, clamp(1200 / pt.z, 2, 7.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (!isPassed && dz < 750) {
      const tag = projectWorld({ x: r.x, y: r.y + r.radius + 7.5, z: r.z }, cam);
      if (tag) {
        ctx.globalAlpha = clamp(fog * 1.1, 0, 0.96);
        ctx.font = isBonus ? 'bold 16px monospace' : isNext ? 'bold 14px monospace' : 'bold 12px monospace';
        ctx.textAlign = 'center';
        const txt = isBonus ? (isNext ? '★ BONUS GATE 3x ▾' : '★ BONUS') : (isNext ? `GATE ${i + 1} ▾` : `${i + 1}`);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(12, 8, 18, 0.72)';
        ctx.strokeText(txt, tag.x, tag.y);
        ctx.fillStyle = isBonus ? '#ffd700' : isNext ? '#ffc878' : '#9eeeff';
        ctx.fillText(txt, tag.x, tag.y);
      }
    }
    ctx.restore();
  }
}

function drawWingTrails(ctx, cam, trails) {
  ctx.save();
  for (let i = 0; i < trails.length; i += 1) {
    const tr = trails[i];
    const sp = projectWorld(tr, cam);
    if (!sp) continue;
    const a = clamp(tr.life / tr.maxLife, 0, 1);
    const r = clamp(240 / sp.z, 1, 3.5);
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = '#fff4dc';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx, cam, particles) {
  ctx.save();
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const sp = projectWorld(p, cam);
    if (!sp) continue;
    const a = clamp(p.life / p.maxLife, 0, 1);
    const r = clamp((p.size * cam.fov) / sp.z, 1.5, 11);
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
