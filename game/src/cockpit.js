import * as THREE from 'three';
import { DEST_RUNWAY_X, WORLD_BOUNDS, canyonCenterX } from './world.js';

/** Build Flight-Sim 3D Cockpit: trapezoidal canopy frame, whiskey compass, moving yoke, 3-lever quadrant, annunciators, 6 dials & Radar/ILS MFD. */
export function createCockpitRig(aircraftRoot) {
  const g = new THREE.Group(); g.visible = false; aircraftRoot.add(g);
  const fMat = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.6, metalness: 0.48 });
  const cMat = new THREE.MeshStandardMaterial({ color: 0x182029, roughness: 0.85, metalness: 0.16 });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x222c37, roughness: 0.5, metalness: 0.55 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.8 });

  const glare = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.024, 0.13), cMat); glare.position.set(0, 0.834, -1.175); glare.rotation.x = 0.03; g.add(glare);
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.036, 0.05), fMat); header.position.set(0, 1.24, -0.98); g.add(header);
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.45, 8), fMat); pil.position.set(s * 0.58, 1.02, -1.01); pil.rotation.z = s * 0.22; pil.rotation.x = 0.14; g.add(pil);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 1.15), fMat); rail.position.set(s * 0.67, 0.68, -0.80); g.add(rail);
  }

  const wCanvas = document.createElement('canvas'); wCanvas.width = 128; wCanvas.height = 48; const wCtx = wCanvas.getContext('2d');
  const wTex = new THREE.CanvasTexture(wCanvas); wTex.colorSpace = THREE.SRGBColorSpace;
  const wBlock = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.042, 0.045), fMat); wBlock.position.set(0.22, 0.864, -1.125); g.add(wBlock);
  const wFace = new THREE.Mesh(new THREE.PlaneGeometry(0.098, 0.034), new THREE.MeshBasicMaterial({ map: wTex })); wFace.position.set(0.22, 0.864, -1.101); g.add(wFace);

  const rainCanvas = document.createElement('canvas'); rainCanvas.width = 512; rainCanvas.height = 512; const rCtx = rainCanvas.getContext('2d');
  rCtx.strokeStyle = 'rgba(225,240,255,0.44)'; rCtx.lineWidth = 0.9;
  for (let i = 0; i < 210; i++) { const rx = (i * 79) % 506; const ry = (i * 137) % 496; rCtx.beginPath(); rCtx.moveTo(rx, ry); rCtx.lineTo(rx - 3, ry + 14 + (i % 12)); rCtx.stroke(); }
  const rainTex = new THREE.CanvasTexture(rainCanvas); rainTex.wrapS = rainTex.wrapT = THREE.RepeatWrapping;
  const rainMat = new THREE.MeshBasicMaterial({ map: rainTex, transparent: true, opacity: 0.0, depthWrite: false });
  const rainPane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.65), rainMat); rainPane.position.set(0, 0.98, -1.04); rainPane.rotation.x = 0.25; g.add(rainPane);

  const yokeRig = new THREE.Group(); yokeRig.position.set(-0.375, 0.578, -0.92); yokeRig.scale.setScalar(0.76);
  const yokeCol = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.28, 10), darkM); yokeCol.rotation.x = Math.PI / 2; yokeCol.position.z = -0.12; yokeRig.add(yokeCol);
  const yokeHead = new THREE.Group(); yokeHead.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.036, 0.028), fMat));
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.12, 8), gripMat); horn.position.set(s * 0.115, 0.045, 0); horn.rotation.z = s * -0.15; yokeHead.add(horn);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshStandardMaterial({ color: s < 0 ? 0xe2542b : 0x3b4856 })); tip.position.set(s * 0.124, 0.105, 0); yokeHead.add(tip);
  }
  yokeRig.add(yokeHead); g.add(yokeRig);

  const quad = new THREE.Group(); quad.position.set(0.49, 0.568, -0.92); quad.scale.setScalar(0.78); quad.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.16), cMat));
  const levers = [[-0.055, 0x1e252c], [0, 0x4ca3d8], [0.055, 0xe0582c]].map(([lx, col]) => {
    const p = new THREE.Group(); p.position.set(lx, 0.025, 0);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.115, 0.014), darkM); rod.position.y = 0.055; p.add(rod);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.042, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }));
    cap.rotation.z = Math.PI / 2; cap.position.y = 0.112; p.add(cap); quad.add(p); return p;
  });
  g.add(quad);

  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 320; const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.33), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.set(0, 0.665, -1.085); panel.rotation.x = -0.10; g.add(panel);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.58, 0.24), cMat); housing.position.set(0, 0.519, -1.21); housing.rotation.x = -0.10; g.add(housing);
  let tick = 0;

  const ln = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  function drawDial(cx, cy, r, lbl, valStr, min, max, val, hex, sub = '') {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#0c1116'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#3c4c5c'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#6d8296'; ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.stroke();
    const a0 = Math.PI * 0.75; const sw = Math.PI * 1.5;
    for (let i = 0; i <= 10; i++) { const a = a0 + (i / 10) * sw; const inn = i % 2 === 0 ? r - 11 : r - 7; ctx.strokeStyle = i % 2 === 0 ? '#dce5ee' : '#586d80'; ctx.lineWidth = i % 2 === 0 ? 1.8 : 1; ln(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn, cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); }
    const na = a0 + Math.max(0, Math.min(1, (val - min) / (max - min))) * sw; ctx.strokeStyle = hex; ctx.lineWidth = 2.6; ln(cx, cy, cx + Math.cos(na) * (r - 12), cy + Math.sin(na) * (r - 12));
    ctx.fillStyle = '#8fa3b5'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText(lbl, cx, cy - 12);
    ctx.fillStyle = '#f5f8fb'; ctx.font = 'bold 15px monospace'; ctx.fillText(valStr, cx, cy + 16);
    if (sub) { ctx.fillStyle = '#6f859c'; ctx.font = 'bold 9px monospace'; ctx.fillText(sub, cx, cy + 30); }
  }

  function redrawInstruments(st) {
    ctx.fillStyle = '#1d2732'; ctx.fillRect(0, 0, 1024, 320);
    [['GEAR DN', !st.airborne || st.flapsDeployed || st.altitudeAglFt < 28, '#387e5a', '#b6ffd5'], [st.flapsDeployed ? 'FLAPS 20°' : 'FLAPS UP', st.flapsDeployed, '#387e5a', '#b6ffd5'], ['STALL', st.stallWarning, '#8f2929', '#ffd1d1'], ['X-WIND', st.windSpeedKt >= 9, '#855822', '#ffe0a8'], ['LOW FUEL', st.lowFuelWarning, '#8f2929', '#ffd1d1'], ['BRAKE', st.brakesActive, '#855822', '#ffe0a8'], ['DROP [V]', st.supplyModeActive, '#24667a', '#b8f3ff']].forEach(([txt, on, bg, fg], i) => {
      const ax = 22 + i * 141; ctx.fillStyle = on ? bg : '#222c37'; ctx.fillRect(ax, 10, 132, 26); ctx.strokeStyle = on ? fg : '#354556'; ctx.lineWidth = 1.5; ctx.strokeRect(ax, 10, 132, 26);
      ctx.fillStyle = on ? fg : '#5c6e80'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText(txt, ax + 66, 27);
    });

    drawDial(84, 114, 52, 'IAS KTS', String(Math.round(st.airspeedKt)), 0, 180, st.airspeedKt, '#f6b945');
    const ax = 152; const ay = 62;
    ctx.save(); ctx.beginPath(); ctx.arc(ax + 52, ay + 52, 50, 0, Math.PI * 2); ctx.clip();
    ctx.translate(ax + 52, ay + 52); ctx.rotate(THREE.MathUtils.degToRad(-st.rollDeg));
    const py = THREE.MathUtils.clamp(st.pitchDeg * 1.9, -38, 38);
    ctx.fillStyle = '#2d6d99'; ctx.fillRect(-90, -90 + py, 180, 90); ctx.fillStyle = '#7b5333'; ctx.fillRect(-90, py, 180, 90);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-80, py); ctx.lineTo(80, py); ctx.stroke();
    ctx.lineWidth = 1.2; for (const d of [-10, -5, 5, 10]) { const ly = py - d * 1.9; ctx.beginPath(); ctx.moveTo(-16, ly); ctx.lineTo(16, ly); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(ax + 52, ay + 52, 51, 0, Math.PI * 2); ctx.strokeStyle = '#4c6072'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax + 34, ay + 52); ctx.lineTo(ax + 70, ay + 52); ctx.stroke();

    drawDial(324, 114, 52, 'ALT FT', String(Math.round(st.altitudeFt)), 0, 1200, st.altitudeFt, '#66e0ff', '1013 QNH');
    const vsi = Math.round(st.vsiFpm / 100);
    drawDial(84, 240, 52, 'V/S x100', `${vsi >= 0 ? '+' : ''}${vsi}`, -15, 15, st.vsiFpm / 100, '#5ae6a0');

    ctx.fillStyle = '#0c1116'; ctx.beginPath(); ctx.arc(204, 240, 52, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4c6072'; ctx.lineWidth = 4; ctx.stroke();
    ctx.save(); ctx.translate(204, 240); ctx.rotate(THREE.MathUtils.degToRad(-st.headingDeg));
    ctx.fillStyle = '#cdd9e5'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ['N', 'E', 'S', 'W'].forEach((c, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 2; ctx.fillText(c, Math.cos(a) * 39, Math.sin(a) * 39); });
    ctx.restore();
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.fillText(`${String(Math.round(st.headingDeg) % 360).padStart(3, '0')}°`, 204, 245);
    drawDial(324, 240, 52, 'FUEL %', `${Math.round(st.fuel)}%`, 0, 100, st.fuel, st.lowFuelWarning ? '#ff5b5b' : '#58b8c8', '% TOTAL');

    ctx.fillStyle = '#0d1519'; ctx.fillRect(408, 56, 338, 238); ctx.strokeStyle = '#384b5c'; ctx.lineWidth = 2.5; ctx.strokeRect(408, 56, 338, 238);
    ctx.fillStyle = '#8fa8b5'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.fillText('RNAV  /  SECTOR MAP', 420, 76);
    ctx.textAlign = 'right'; ctx.fillText(st.approachActive ? 'ILS LOCK' : 'VFR NAV', 734, 76);
    const rx = 500; const ry = 178; const rr = 76; ctx.save(); ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#12252c'; ctx.fillRect(424, 102, 152, 152);
    const sc = 0.048; const camZ = st.pos.z - 520; const camX = canyonCenterX(camZ) * 0.5 + st.pos.x * 0.5;
    const tx = (x) => rx + (x - camX) * sc; const ty = (z) => ry + (z - camZ) * sc; ctx.beginPath();
    for (let i = 0; i <= 16; i++) { const z = camZ + 1200 - i * 140; i === 0 ? ctx.moveTo(tx(canyonCenterX(z) - 65), ty(z)) : ctx.lineTo(tx(canyonCenterX(z) - 65), ty(z)); }
    for (let i = 16; i >= 0; i--) { const z = camZ + 1200 - i * 140; ctx.lineTo(tx(canyonCenterX(z) + 65), ty(z)); }
    ctx.closePath(); ctx.fillStyle = '#1f4f5c'; ctx.fill(); ctx.strokeStyle = '#e8eff5'; ctx.lineWidth = 2.5; ln(tx(DEST_RUNWAY_X), ty(WORLD_BOUNDS.destRunwayZ + 220), tx(DEST_RUNWAY_X), ty(WORLD_BOUNDS.destRunwayZ - 220));
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(tx(st.pos.x), ty(st.pos.z), 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.strokeStyle = '#4c707d'; ctx.lineWidth = 1.5; ctx.stroke();
    const ix = 666; const iy = 178; const ir = 52; ctx.strokeStyle = '#2d454e'; ctx.lineWidth = 1; ctx.strokeRect(ix - ir, iy - ir, 104, 104);
    const locX = ix + THREE.MathUtils.clamp(st.locDev || 0, -1, 1) * 42; const gsY = iy + THREE.MathUtils.clamp(st.gsDev || 0, -1, 1) * 42;
    ctx.strokeStyle = st.approachActive ? '#ffd166' : '#58828e'; ctx.lineWidth = 2.2; ln(locX, iy - ir + 6, locX, iy + ir - 6); ln(ix - ir + 6, gsY, ix + ir - 6, gsY);
    ctx.fillStyle = '#9cb0c0'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('LOC        GS', ix, iy - ir - 10);
    ctx.fillStyle = '#ffd166'; ctx.fillText('RWY 36 · 110.30', ix, iy + ir + 18); ctx.fillStyle = '#9cb0c0'; ctx.font = 'bold 10px monospace'; ctx.fillText('CANYON NAV  /  PAPI 2W 2R', 577, 282);

    ctx.fillStyle = '#cdd9e5'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText('KESTREL S-4X  |  TWIN TURBINE', 884, 72);
    ctx.fillStyle = st.hull > 45 ? '#66e0a3' : '#ff5b5b'; ctx.font = 'bold 13px monospace'; ctx.fillText(`HULL INTEGRITY ${Math.round(st.hull)}%`, 884, 96);
    drawDial(820, 176, 54, 'RPM %', `${Math.round(st.rpm * 100)}%`, 0, 100, st.rpm * 100, '#f6a83b');
    drawDial(948, 176, 54, 'EGT °C', `${Math.round(st.engineTemp)}°`, 40, 120, st.engineTemp, st.overheatWarning ? '#ff5b5b' : '#5ae6a0');

    tex.needsUpdate = true;
    wCtx.fillStyle = '#121820'; wCtx.fillRect(0, 0, 128, 48); wCtx.fillStyle = '#f2f5f8'; wCtx.font = 'bold 24px monospace'; wCtx.textAlign = 'center'; wCtx.textBaseline = 'middle';
    wCtx.fillText(`I ${String(Math.round(st.headingDeg) % 360).padStart(3, '0')} I`, 64, 24); wTex.needsUpdate = true;
  }

  return {
    eyeLocalOffset: new THREE.Vector3(0, 0.985, -0.32),
    setActive(v) { g.visible = v; },
    update(st) {
      if (!g.visible) return;
      yokeHead.rotation.z = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(-st.controls.roll * 32, -35, 35));
      yokeRig.position.z = -0.92 - st.controls.pitch * 0.04;
      levers[0].rotation.x = -0.45 + st.throttle * 0.9; levers[1].rotation.x = st.flapsDeployed ? 0.35 : -0.35; levers[2].rotation.x = st.brakesActive ? 0.40 : -0.35;
      rainMat.opacity = st.isStorm ? 0.52 : 0.0; if (st.isStorm) { rainTex.offset.y -= 0.048; rainTex.offset.x -= 0.008; }
      if (++tick % 2 !== 0 && !st.forcePanelRedraw) return;
      redrawInstruments(st);
    },
  };
}
