// Procedural 3D patrol aircraft builder & depth-sorted renderer (+Z = nose, -Z = tail, +X = right, +Y = up).

import { SUN_DIR } from './config.js';
import { add, buildBasis, clamp, clipAndProjectPoly, cross, dot, norm, projectWorld, sub } from './math3d.js';
import { terrainHeight } from './terrain.js';

const SUN_NORM = norm(SUN_DIR);

function shadeColor(rgb, n, glow = 0) {
  const ndl = clamp(dot(n, SUN_NORM), -0.35, 1);
  const light = 0.56 + ndl * 0.44 + glow;
  const r = clamp(Math.round(rgb[0] * light + Math.max(0, ndl) * 28), 0, 255);
  const g = clamp(Math.round(rgb[1] * light + Math.max(0, ndl) * 14), 0, 255);
  const b = clamp(Math.round(rgb[2] * light + (ndl < 0 ? 18 : 0)), 0, 255);
  return `rgb(${r},${g},${b})`;
}

// Project aircraft ground shadow directly onto sculpted canyon terrain below
export function drawAircraftShadow(ctx, plane, cam) {
  const groundY = terrainHeight(plane.pos.x, plane.pos.z);
  const agl = Math.max(0, plane.pos.y - groundY);
  if (agl > 180) return;

  const fade = clamp(1 - agl / 180, 0, 1);
  const sunShiftX = -agl * 0.65;
  const sunShiftZ = -agl * 0.35;
  const scx = plane.pos.x + sunShiftX;
  const scz = plane.pos.z + sunShiftZ;
  const sy = terrainHeight(scx, scz) + 0.6;
  const span = 12 + agl * 0.04;
  const len = 7 + agl * 0.025;

  const cy = Math.cos(plane.yaw);
  const syw = Math.sin(plane.yaw);
  const pts = [
    { x: scx - cy * span, y: sy, z: scz + syw * span },
    { x: scx + syw * len, y: sy, z: scz + cy * len },
    { x: scx + cy * span, y: sy, z: scz - syw * span },
    { x: scx - syw * len, y: sy, z: scz - cy * len },
  ];
  const poly = clipAndProjectPoly(pts, cam);
  if (!poly) return;

  ctx.save();
  ctx.globalAlpha = 0.42 * fade;
  ctx.fillStyle = '#18080a';
  ctx.beginPath();
  ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
  for (let i = 1; i < poly.pts.length; i += 1) ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawAircraft(ctx, plane, cam, timeSec, camMode) {
  // In cockpit mode, render minimal cowl & lit glare shield instead of external fuselage
  if (camMode === 'cockpit') {
    drawCockpitFrame(ctx, plane, timeSec);
    return;
  }

  const basis = buildBasis(plane.yaw, plane.pitch, plane.roll);
  const p0 = plane.pos;
  const toW = (lx, ly, lz) => ({
    x: p0.x + basis.right.x * lx + basis.up.x * ly + basis.fwd.x * lz,
    y: p0.y + basis.right.y * lx + basis.up.y * ly + basis.fwd.y * lz,
    z: p0.z + basis.right.z * lx + basis.up.z * ly + basis.fwd.z * lz,
  });

  const faces = [];
  const pushFace = (localVerts, baseRgb, stroke = null, alpha = 1, glow = 0) => {
    const wPts = localVerts.map((v) => toW(v[0], v[1], v[2]));
    const proj = clipAndProjectPoly(wPts, cam);
    if (!proj) return;
    const e1 = sub(wPts[1], wPts[0]);
    const e2 = sub(wPts[2], wPts[0]);
    const n = norm(cross(e1, e2));
    faces.push({
      pts: proj.pts,
      depth: proj.depth,
      fill: shadeColor(baseRgb, n, glow),
      stroke,
      alpha,
    });
  };

  // Color scheme: Desert Cream fuselage, Vermilion patrol nose/wingtips, Charcoal canopy frame
  const CREAM = [242, 224, 186];
  const CREAM_DARK = [188, 166, 134];
  const VERMILION = [228, 72, 38];
  const COWL = [72, 64, 70];
  const CANOPY = [92, 168, 225];
  const STRIPE = [245, 168, 45];

  // ── Fuselage (forward nose +8.5, cabin +4..-1.5, tapered tail -8.5) ──
  // Top deck
  pushFace([[-1.0, 0.9, 5.0], [1.0, 0.9, 5.0], [0.55, 0.75, -8.2], [-0.55, 0.75, -8.2]], CREAM, 'rgba(30,15,10,0.28)');
  // Left & right fuselage sides
  pushFace([[-1.0, 0.9, 5.0], [-0.55, 0.75, -8.2], [-0.45, -0.55, -8.2], [-1.05, -0.8, 5.0]], CREAM, 'rgba(30,15,10,0.25)');
  pushFace([[1.0, 0.9, 5.0], [1.05, -0.8, 5.0], [0.45, -0.55, -8.2], [0.55, 0.75, -8.2]], CREAM, 'rgba(30,15,10,0.25)');
  // Belly
  pushFace([[-1.05, -0.8, 5.0], [-0.45, -0.55, -8.2], [0.45, -0.55, -8.2], [1.05, -0.8, 5.0]], CREAM_DARK);
  // Patrol accent stripe on sides
  pushFace([[-1.04, 0.25, 4.6], [-0.54, 0.25, -7.8], [-0.52, -0.05, -7.8], [-1.05, -0.05, 4.6]], VERMILION);
  pushFace([[1.04, 0.25, 4.6], [1.05, -0.05, 4.6], [0.52, -0.05, -7.8], [0.54, 0.25, -7.8]], VERMILION);

  // ── Radial Engine Cowling at Nose (+5.0 to +8.4) ──
  pushFace([[-1.0, 0.9, 5.0], [1.0, 0.9, 5.0], [0.82, 0.68, 8.2], [-0.82, 0.68, 8.2]], VERMILION);
  pushFace([[-1.0, 0.9, 5.0], [-0.82, 0.68, 8.2], [-0.82, -0.62, 8.2], [-1.05, -0.8, 5.0]], VERMILION);
  pushFace([[1.0, 0.9, 5.0], [1.05, -0.8, 5.0], [0.82, -0.62, 8.2], [0.82, 0.68, 8.2]], VERMILION);
  pushFace([[-0.82, 0.68, 8.2], [0.82, 0.68, 8.2], [0.82, -0.62, 8.2], [-0.82, -0.62, 8.2]], COWL);

  // ── Cockpit Canopy + Lit Instrument Glow inside ──
  // Rear slanted glass visible to chase cam
  pushFace([[-0.76, 1.9, 1.5], [0.76, 1.9, 1.5], [0.62, 0.85, -3.0], [-0.62, 0.85, -3.0]], CANOPY, 'rgba(20,30,45,0.65)', 0.76, 0.15);
  pushFace([[-0.76, 1.9, 1.5], [-0.62, 0.85, -3.0], [-0.88, 0.88, 1.8]], CANOPY, 'rgba(20,30,45,0.55)', 0.72);
  pushFace([[0.76, 1.9, 1.5], [0.88, 0.88, 1.8], [0.62, 0.85, -3.0]], CANOPY, 'rgba(20,30,45,0.55)', 0.72);
  // Front windshield
  pushFace([[-0.84, 0.9, 4.2], [0.84, 0.9, 4.2], [0.76, 1.9, 1.5], [-0.76, 1.9, 1.5]], CANOPY, 'rgba(20,30,45,0.6)', 0.78, 0.25);

  // ── Main Wings (High-set shoulder wing with slight dihedral & vermilion tips) ──
  const ail = clamp(plane.aileronInput || 0, -1, 1) * 0.35;
  // Left wing inner + outer + red wingtip
  pushFace([[-0.9, 0.65, 3.6], [-10.5, 1.15, 2.7], [-10.5, 1.15, -0.4], [-0.9, 0.65, -0.8]], CREAM, 'rgba(40,20,10,0.32)');
  pushFace([[-10.5, 1.15, 2.7], [-14.2, 1.38, 2.0], [-14.2, 1.38, 0.0], [-10.5, 1.15, -0.4]], VERMILION, 'rgba(40,20,10,0.35)');
  // Left wing underside
  pushFace([[-0.9, 0.45, 3.6], [-0.9, 0.45, -0.8], [-14.2, 1.22, 0.0], [-14.2, 1.22, 2.0]], CREAM_DARK);
  // Left aileron (deflects visibly on roll!)
  pushFace([[-6.0, 0.9 + ail * 0.4, -0.55], [-11.5, 1.18 + ail * 0.4, -0.42], [-11.5, 1.18 - ail * 0.45, -1.15], [-6.0, 0.9 - ail * 0.45, -1.25]], STRIPE);

  // Right wing inner + outer + red wingtip
  pushFace([[0.9, 0.65, 3.6], [0.9, 0.65, -0.8], [10.5, 1.15, -0.4], [10.5, 1.15, 2.7]], CREAM, 'rgba(40,20,10,0.32)');
  pushFace([[10.5, 1.15, 2.7], [10.5, 1.15, -0.4], [14.2, 1.38, 0.0], [14.2, 1.38, 2.0]], VERMILION, 'rgba(40,20,10,0.35)');
  // Right wing underside
  pushFace([[0.9, 0.45, 3.6], [14.2, 1.22, 2.0], [14.2, 1.22, 0.0], [0.9, 0.45, -0.8]], CREAM_DARK);
  // Right aileron
  pushFace([[6.0, 0.9 - ail * 0.4, -0.55], [6.0, 0.9 + ail * 0.45, -1.25], [11.5, 1.18 + ail * 0.45, -1.15], [11.5, 1.18 - ail * 0.4, -0.42]], STRIPE);

  // ── Horizontal Stabilizer + Elevator ──
  const elev = clamp(plane.elevatorInput || 0, -1, 1) * 0.38;
  pushFace([[-0.5, 0.65, -6.2], [-5.2, 0.72, -7.0], [-5.2, 0.72 - elev * 0.5, -8.7], [-0.5, 0.65 - elev * 0.5, -8.5]], VERMILION, 'rgba(40,20,10,0.3)');
  pushFace([[0.5, 0.65, -6.2], [0.5, 0.65 - elev * 0.5, -8.5], [5.2, 0.72 - elev * 0.5, -8.7], [5.2, 0.72, -7.0]], VERMILION, 'rgba(40,20,10,0.3)');

  // ── Vertical Tail Fin + Rudder (both sides so never culled) ──
  const rud = clamp(plane.aileronInput || 0, -1, 1) * 0.35;
  pushFace([[0, 0.72, -5.2], [0, 3.85, -7.6], [rud * 0.5, 3.65, -8.9], [rud * 0.5, 0.65, -8.6]], VERMILION, 'rgba(40,20,10,0.45)');
  pushFace([[0, 3.85, -7.6], [0, 0.72, -5.2], [rud * 0.5, 0.65, -8.6], [rud * 0.5, 3.65, -8.9]], VERMILION, 'rgba(40,20,10,0.45)');
  // Tail racing stripe
  pushFace([[0.05, 2.3, -6.4], [0.05, 3.1, -7.1], [rud * 0.45 + 0.05, 3.0, -8.7], [rud * 0.45 + 0.05, 2.2, -8.6]], CREAM);

  const drawItems = [];
  for (let i = 0; i < faces.length; i += 1) {
    const f = faces[i];
    drawItems.push({
      depth: f.depth,
      draw: () => {
        ctx.save();
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = f.fill;
        ctx.beginPath();
        ctx.moveTo(f.pts[0].x, f.pts[0].y);
        for (let k = 1; k < f.pts.length; k += 1) ctx.lineTo(f.pts[k].x, f.pts[k].y);
        ctx.closePath();
        ctx.fill();
        if (f.stroke) {
          ctx.strokeStyle = f.stroke;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  // Push wing struts & landing gear into the exact same depth-sorted queue so wheels never bleed over tail!
  const queueStrut = (a, b, col, w) => {
    const pa = projectWorld(toW(a[0], a[1], a[2]), cam);
    const pb = projectWorld(toW(b[0], b[1], b[2]), cam);
    if (!pa || !pb) return;
    drawItems.push({
      depth: (pa.z + pb.z) * 0.5,
      draw: () => {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      },
    });
  };
  queueStrut([-1.0, -0.5, 1.8], [-6.2, 0.85, 1.6], '#524036', 2);
  queueStrut([1.0, -0.5, 1.8], [6.2, 0.85, 1.6], '#524036', 2);
  queueStrut([-0.8, -0.7, 2.6], [-2.2, -2.35, 2.9], '#3d332d', 2.4);
  queueStrut([0.8, -0.7, 2.6], [2.2, -2.35, 2.9], '#3d332d', 2.4);

  const queueWheel = (lx, ly, lz, rad) => {
    const pw = projectWorld(toW(lx, ly, lz), cam);
    if (!pw) return;
    const sr = clamp((rad * cam.fov) / pw.z, 2, 14);
    drawItems.push({
      depth: pw.z,
      draw: () => {
        ctx.fillStyle = '#1b1a1e';
        ctx.beginPath();
        ctx.arc(pw.x, pw.y, sr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c8b89a';
        ctx.beginPath();
        ctx.arc(pw.x, pw.y, sr * 0.42, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  };
  queueWheel(-2.2, -2.4, 2.9, 0.65);
  queueWheel(2.2, -2.4, 2.9, 0.65);

  drawItems.sort((a, b) => b.depth - a.depth);
  for (let i = 0; i < drawItems.length; i += 1) {
    drawItems[i].draw();
  }

  // ── Lit Cockpit Avionics Glow (visible inside rear canopy!) ──
  const dashGlow = projectWorld(toW(0, 1.15, 2.4), cam);
  if (dashGlow) {
    const gr = clamp(420 / dashGlow.z, 3, 18);
    const g = ctx.createRadialGradient(dashGlow.x, dashGlow.y, 0, dashGlow.x, dashGlow.y, gr);
    g.addColorStop(0, 'rgba(110, 255, 195, 0.75)');
    g.addColorStop(0.5, 'rgba(255, 180, 70, 0.35)');
    g.addColorStop(1, 'rgba(255, 180, 70, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(dashGlow.x, dashGlow.y, gr, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Wingtip Navigation Lights + Tail Beacon Strobe ──
  const drawNavLight = (lx, ly, lz, color, radius) => {
    const p = projectWorld(toW(lx, ly, lz), cam);
    if (!p) return;
    const r = clamp((radius * cam.fov) / p.z, 2.5, 18);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.28, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  drawNavLight(-14.2, 1.4, 1.0, 'rgba(255, 65, 55, 0.95)', 1.5);
  drawNavLight(14.2, 1.4, 1.0, 'rgba(65, 255, 130, 0.95)', 1.5);
  const strobeOn = Math.sin(timeSec * 8.5) > 0.65;
  if (strobeOn) drawNavLight(0, 3.9, -7.8, 'rgba(255, 240, 190, 0.95)', 2.1);

  // ── Spinning Propeller Blur Disc at Nose (+8.7) ──
  const pHub = projectWorld(toW(0, 0.05, 8.7), cam);
  if (pHub) {
    const discR = clamp((4.2 * cam.fov) / pHub.z, 6, 48);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#ffd99a';
    ctx.lineWidth = Math.max(1.5, discR * 0.12);
    ctx.beginPath();
    ctx.arc(pHub.x, pHub.y, discR * 0.9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#d8c4a0';
    ctx.beginPath();
    ctx.arc(pHub.x, pHub.y, discR, 0, Math.PI * 2);
    ctx.fill();

    // Two spinning propeller blades
    ctx.globalAlpha = 0.52;
    for (let b = 0; b < 2; b += 1) {
      const a = plane.propAngle + b * Math.PI;
      ctx.strokeStyle = '#332822';
      ctx.lineWidth = Math.max(1.8, discR * 0.15);
      ctx.beginPath();
      ctx.moveTo(pHub.x, pHub.y);
      ctx.lineTo(pHub.x + Math.cos(a) * discR, pHub.y + Math.sin(a) * discR);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCockpitFrame(ctx, plane, timeSec) {
  const w = 1280;
  const h = 720;
  // Subtle cowling silhouette at lower nose + propeller blur arc + canopy pillars
  ctx.save();
  ctx.fillStyle = 'rgba(135, 42, 26, 0.9)';
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h);
  ctx.lineTo(w * 0.42, h * 0.72);
  ctx.quadraticCurveTo(w * 0.5, h * 0.68, w * 0.58, h * 0.72);
  ctx.lineTo(w * 0.66, h);
  ctx.closePath();
  ctx.fill();

  // Spinning nose propeller faint arc in cockpit view
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#ffe2b0';
  ctx.lineWidth = 6;
  const spin = Math.sin(plane.propAngle * 2) * 0.12;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.71, 145, Math.PI + spin, Math.PI * 2 + spin);
  ctx.stroke();

  // Windshield frame struts
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = '#241b1e';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, 0);
  ctx.lineTo(w * 0.28, h * 0.75);
  ctx.moveTo(w * 0.82, 0);
  ctx.lineTo(w * 0.72, h * 0.75);
  ctx.stroke();

  // Gentle engine vibration glint on cowling
  const glint = 0.25 + 0.1 * Math.sin(timeSec * 6);
  ctx.globalAlpha = glint;
  ctx.strokeStyle = '#ffb35c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.43, h * 0.72);
  ctx.quadraticCurveTo(w * 0.5, h * 0.685, w * 0.57, h * 0.72);
  ctx.stroke();
  ctx.restore();
}
