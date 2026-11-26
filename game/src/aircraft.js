import * as THREE from 'three';
import { getTerrainHeight } from './world.js';

export const AIRCRAFT_DIMENSIONS = Object.freeze({ wingspan: 11.8, length: 8.6, gearHeight: 1.48 });

function softCircleTex(r, g, b, aMax = 0.65) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, `rgba(${r},${g},${b},${aMax})`); grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function createPropBlurTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0, 'rgba(240,244,250,0.05)'); grad.addColorStop(0.5, 'rgba(235,222,200,0.28)');
  grad.addColorStop(0.86, 'rgba(255,212,148,0.36)'); grad.addColorStop(1, 'rgba(255,168,76,0)');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function createLiveryTex(code, bg, accent) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = accent; ctx.fillRect(0, 92, 256, 16);
  ctx.fillStyle = '#f4ede0'; ctx.font = 'bold 54px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(code, 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function createRoundel(radius) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const ctx = c.getContext('2d');
  for (const [r, col] of [[60, '#1a2a3e'], [42, '#f0ebe0'], [22, '#d94826']]) {
    ctx.beginPath(); ctx.arc(64, 64, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.rotation.x = -Math.PI / 2; return m;
}

/** Build twin-boom Kestrel S-4X aircraft with high-visibility patrol livery, gear, lighting & river wake spray. */
export function createScoutAircraft(scene) {
  const root = new THREE.Group(); scene.add(root);
  const body = new THREE.Group(); root.add(body);

  const mk = (c, r = 0.36, mt = 0.16) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
  const addBox = (parent, w, h, d, m, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); parent.add(k); return k; };
  const cream = mk(0xf1ece1); const red = mk(0xd94b26, 0.38, 0.18); const navy = mk(0x162536, 0.42, 0.28);
  const gold = mk(0xf4b63d, 0.36, 0.35); const metal = mk(0x222933, 0.48, 0.72); const chrome = mk(0xd9e1ea, 0.22, 0.86); const tire = mk(0x14171c, 0.92, 0);

  const fGeo = new THREE.LatheGeometry([[0.01,-3.75],[0.34,-3.55],[0.58,-2.85],[0.72,-1.65],[0.76,-0.30],[0.68,1.15],[0.54,2.25],[0.46,2.75]].map(([r, z]) => new THREE.Vector2(r, z)), 22);
  fGeo.rotateX(Math.PI / 2); fGeo.scale(0.95, 0.92, 1.0);
  const fuselage = new THREE.Mesh(fGeo, cream); fuselage.castShadow = true; fuselage.receiveShadow = true; body.add(fuselage);

  const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.56, 3.6, 12, 1, false, Math.PI * 0.65, Math.PI * 0.7), navy);
  keel.rotation.x = Math.PI / 2; keel.position.set(0, -0.22, -0.4); body.add(keel);
  const cowl = addBox(body, 0.52, 0.10, 1.75, navy, 0, 0.62, -2.05);
  for (const s of [-1, 1]) {
    addBox(body, 0.06, 0.12, 4.6, red, s * 0.68, -0.02, -0.35); addBox(body, 0.065, 0.05, 4.4, gold, s * 0.685, 0.07, -0.35);
    for (let k = 0; k < 3; k++) addBox(body, 0.05, 0.19, 0.08, metal, s * 0.69, 0.14, 0.82 + k * 0.18).rotation.y = s * -0.18;
  }

  const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.50, 0.45, 20, 1, true), metal); noz.rotation.x = Math.PI / 2; noz.position.set(0, 0.02, 2.82); body.add(noz);
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const thrMat = new THREE.MeshStandardMaterial({ color: 0xffd275, emissive: 0xff7b1f, emissiveIntensity: 2.2, roughness: 0.2 });
  body.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), thrMat), 0, 0.02, 2.88));
  const plumeGroup = at(new THREE.Group(), 0, 0.02, 2.90);
  const outerPlumeGeo = new THREE.ConeGeometry(0.32, 1.15, 14, 1, true); outerPlumeGeo.rotateX(Math.PI / 2); outerPlumeGeo.translate(0, 0, 0.57);
  const outerPlumeMat = new THREE.MeshBasicMaterial({ color: 0xff6b1c, transparent: true, opacity: 0.44, depthWrite: false, side: THREE.DoubleSide });
  const innerPlumeGeo = new THREE.ConeGeometry(0.18, 0.72, 12, 1, true); innerPlumeGeo.rotateX(Math.PI / 2); innerPlumeGeo.translate(0, 0, 0.36);
  const innerPlumeMat = new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
  plumeGroup.add(new THREE.Mesh(outerPlumeGeo, outerPlumeMat), new THREE.Mesh(innerPlumeGeo, innerPlumeMat)); body.add(plumeGroup);
  const canopyGroup = new THREE.Group();
  const glass = at(new THREE.Mesh(new THREE.SphereGeometry(0.58, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), new THREE.MeshPhysicalMaterial({ color: 0x2d5878, roughness: 0.07, metalness: 0.18, transparent: true, opacity: 0.78, clearcoat: 1.0 })), 0, 0.52, -0.45);
  glass.scale.set(0.84, 0.86, 2.25); canopyGroup.add(glass, at(new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.032, 8, 18, Math.PI), navy), 0, 0.52, -0.45)); body.add(canopyGroup);

  const tailCodeMat = new THREE.MeshBasicMaterial({ map: createLiveryTex('K-04', '#162536', '#d94b26'), side: THREE.DoubleSide });
  const ailerons = { left: new THREE.Group(), right: new THREE.Group() };
  const flaps = { left: new THREE.Group(), right: new THREE.Group() };
  const twinRudders = []; const wingMeshes = [];

  for (const side of [-1, 1]) {
    const wp = new THREE.Group(); wp.position.set(side * 0.42, -0.14, -0.45); wp.rotation.z = side * THREE.MathUtils.degToRad(3.8);
    const wSh = new THREE.Shape(); wSh.moveTo(0, -1.05); wSh.lineTo(side * 5.35, -0.12); wSh.lineTo(side * 5.35, 0.85); wSh.lineTo(0, 1.05); wSh.closePath();
    const wGeo = new THREE.ExtrudeGeometry(wSh, { depth: 0.13, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }); wGeo.rotateX(Math.PI / 2);
    const wMesh = new THREE.Mesh(wGeo, cream); wMesh.castShadow = true; wMesh.receiveShadow = true; wp.add(wMesh);
    const oSh = new THREE.Shape(); oSh.moveTo(side * 3.15, -0.48); oSh.lineTo(side * 5.42, -0.10); oSh.lineTo(side * 5.42, 0.87); oSh.lineTo(side * 3.15, 0.92); oSh.closePath();
    const oGeo = new THREE.ExtrudeGeometry(oSh, { depth: 0.15, bevelEnabled: false }); oGeo.rotateX(Math.PI / 2); oGeo.translate(0, 0.01, 0); wp.add(new THREE.Mesh(oGeo, red));
    addBox(wp, 0.32, 0.17, 1.44, navy, side * 2.95, -0.05, 0.20).rotation.y = side * -0.12;
    addBox(wp, 0.14, 0.175, 1.48, gold, side * 2.70, -0.05, 0.18).rotation.y = side * -0.12;
    const rnd = createRoundel(0.46); rnd.position.set(side * 4.05, 0.04, 0.35); wp.add(rnd);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1.18, 10), navy); pod.rotation.x = Math.PI / 2; pod.position.set(side * 5.42, -0.04, 0.36); wp.add(pod);
    const fPiv = side < 0 ? flaps.left : flaps.right; fPiv.position.set(side * 1.45, -0.05, 0.95); addBox(fPiv, 1.45, 0.075, 0.32, navy, 0, 0, 0.14); wp.add(fPiv);
    const aPiv = side < 0 ? ailerons.left : ailerons.right; aPiv.position.set(side * 3.85, -0.05, 0.85); addBox(aPiv, 1.95, 0.075, 0.28, red, 0, 0, 0.13); wp.add(aPiv);
    body.add(wp); wingMeshes.push(wp);
    const bx = side * 1.46;
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 4.15, 12), cream); boom.rotation.x = Math.PI / 2; boom.position.set(bx, -0.02, 1.45); boom.castShadow = true; body.add(boom);
    addBox(body, 0.05, 0.06, 3.4, navy, bx + side * 0.21, 0.02, 1.45);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.45, 12), red); intake.rotation.x = Math.PI / 2; intake.position.set(bx, -0.02, -0.68); body.add(intake);
    const iHole = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), metal); iHole.rotation.y = Math.PI; iHole.position.set(bx, -0.02, -0.91); body.add(iHole);
    const fg = new THREE.Group(); fg.position.set(bx, 0.08, 3.15); fg.rotation.z = side * -0.22;
    const fSh = new THREE.Shape(); fSh.moveTo(0, 0); fSh.lineTo(1.25, 0); fSh.lineTo(0.95, 1.42); fSh.lineTo(0.45, 1.42); fSh.closePath();
    const finGeo = new THREE.ExtrudeGeometry(fSh, { depth: 0.10, bevelEnabled: false }); finGeo.rotateY(-Math.PI / 2); finGeo.translate(0.05, 0, -0.5);
    const finMesh = new THREE.Mesh(finGeo, navy); finMesh.castShadow = true; fg.add(finMesh);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.36), tailCodeMat); plaque.rotation.y = side * Math.PI / 2; plaque.position.set(side * 0.06, 0.72, 0.08); fg.add(plaque);
    addBox(fg, 0.11, 0.26, 0.56, red, 0, 1.32, 0.22);
    const rPiv = new THREE.Group(); rPiv.position.set(0, 0.65, 0.56); addBox(rPiv, 0.08, 1.15, 0.34, red, 0, 0, 0.16); fg.add(rPiv); twinRudders.push(rPiv); body.add(fg);
  }

  const hStab = new THREE.Mesh(new THREE.BoxGeometry(2.96, 0.10, 0.72), cream); hStab.position.set(0, 0.08, 3.32); hStab.castShadow = true; body.add(hStab);
  const elPiv = new THREE.Group(); elPiv.position.set(0, 0.08, 3.68);
  const elMesh = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.075, 0.32), cream); elMesh.position.set(0, 0, 0.15); elPiv.add(elMesh); body.add(elPiv);

  const gearGroup = new THREE.Group();
  const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
  const put = (p, g, mt, x = 0, y = 0, z = 0, rx = 0, rz = 0, sh = false) => { const k = new THREE.Mesh(g, mt); k.position.set(x, y, z); k.rotation.set(rx, 0, rz); k.castShadow = sh; p.add(k); return k; };
  put(gearGroup, cyl(0.06, 0.05, 1.08, 8), chrome, 0, -0.78, -2.25, -0.14);
  put(gearGroup, cyl(0.28, 0.28, 0.18, 14), tire, 0, -1.20, -2.32, 0, Math.PI / 2, true);
  put(gearGroup, cyl(0.14, 0.14, 0.19, 10), chrome, 0, -1.20, -2.32, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    put(gearGroup, cyl(0.065, 0.052, 1.30, 8), metal, s * 1.24, -0.74, -0.35, 0, s * 0.32, true);
    put(gearGroup, cyl(0.34, 0.34, 0.22, 14), tire, s * 1.54, -1.14, -0.35, 0, Math.PI / 2, true);
    put(gearGroup, cyl(0.16, 0.16, 0.23, 10), chrome, s * 1.54, -1.14, -0.35, 0, Math.PI / 2);
  }
  body.add(gearGroup);

  const beamMat = new THREE.MeshBasicMaterial({ map: softCircleTex(255, 240, 198, 0.34), transparent: true, opacity: 0.0, depthWrite: false });
  put(body, new THREE.PlaneGeometry(5.6, 11.5), beamMat, 0, -1.32, -8.2, -Math.PI / 2);

  const propGroup = new THREE.Group(); propGroup.position.set(0, 0, -3.76);
  put(propGroup, new THREE.ConeGeometry(0.24, 0.56, 14), red, 0, 0, -0.18, -Math.PI / 2);
  const propBlades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI * 2) / 3;
    const b = addBox(arm, 0.11, 0.88, 0.025, metal, 0, 0.50, 0); b.rotation.y = 0.36;
    const bTip = addBox(arm, 0.112, 0.12, 0.028, gold, 0, 0.88, 0); bTip.rotation.y = 0.36; propBlades.add(arm);
  }
  propGroup.add(propBlades);
  const propBlurMat = new THREE.MeshBasicMaterial({ map: createPropBlurTex(), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  put(propGroup, new THREE.PlaneGeometry(2.05, 2.05), propBlurMat, 0, 0, -0.02); body.add(propGroup);

  for (const [xPos, cHex, sCol] of [[-5.86, 0xff3b3b, 0xff4444], [5.86, 0x3cff8e, 0x44ff99]]) {
    put(body, new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: cHex }), xPos, 0.18, -0.08);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircleTex(255, 255, 255, 0.7), color: sCol, transparent: true, opacity: 0.75, depthWrite: false }));
    spr.position.set(xPos, 0.18, -0.08); spr.scale.set(0.9, 0.9, 1); body.add(spr);
  }
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tailStrobe = put(body, new THREE.SphereGeometry(0.065, 8, 8), strobeMat, -1.77, 1.48, 3.37);

  const shadowMat = new THREE.MeshBasicMaterial({ map: softCircleTex(10, 8, 12, 0.58), transparent: true, depthWrite: false, opacity: 0.6 });
  const dropShadow = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 11.5), shadowMat); dropShadow.rotation.x = -Math.PI / 2; scene.add(dropShadow);

  const trailLen = 38;
  const trails = [-1, 1].map(() => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailLen * 6), 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0xe6f4ff, transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh); return { history: [], mesh, mat };
  });

  const dustTex = softCircleTex(235, 240, 248, 0.55);
  const puffs = Array.from({ length: 32 }, () => {
    const mat = new THREE.SpriteMaterial({ map: dustTex, transparent: true, opacity: 0, depthWrite: false });
    const spr = new THREE.Sprite(mat); spr.visible = false; scene.add(spr);
    return { spr, mat, vel: new THREE.Vector3(), age: 99, maxAge: 1, baseOpacity: 0.5 };
  });
  let pIdx = 0; let flapAngle = 0; let gearDeploy = 1; let isCockpitHidden = false; let dmgTimer = 0; let sprayTimer = 0;
  const tmpV = new THREE.Vector3();

  return {
    root,
    setCockpitMode(isC) {
      isCockpitHidden = isC; canopyGroup.visible = !isC; fuselage.visible = !isC; plumeGroup.visible = !isC;
      gearGroup.visible = !isC && gearDeploy > 0.05; propGroup.visible = !isC; cowl.visible = !isC;
      for (const w of wingMeshes) w.visible = !isC;
    },
    spawnTouchdownDust(worldPos, intensity = 1) {
      for (const side of [-1.52, 1.52]) {
        const p = puffs[pIdx++ % puffs.length]; p.spr.visible = true; p.mat.color.setHex(intensity > 1.3 ? 0xffbb66 : 0xe8d5be);
        p.spr.position.set(worldPos.x + side, worldPos.y - 1.28, worldPos.z + 0.9); p.spr.scale.set(1.25 * intensity, 1.05 * intensity, 1);
        p.vel.set((Math.random() - 0.5) * 2.2, 0.8 + Math.random() * 1.1, 4.2 + Math.random() * 2.0); p.age = 0; p.maxAge = 0.65; p.baseOpacity = 0.44;
      }
    },
    spawnCrashSmoke(worldPos) {
      for (let i = 0; i < 14; i++) {
        const p = puffs[pIdx++ % puffs.length]; p.spr.visible = true; p.mat.color.setHex(i < 4 ? 0xff7b29 : 0x262124);
        p.spr.position.set(worldPos.x + (Math.random() - 0.5) * 3.5, worldPos.y + Math.random() * 1.4, worldPos.z + (Math.random() - 0.5) * 3.5);
        p.spr.scale.set(3.8 + Math.random() * 2.2, 3.8 + Math.random() * 2.2, 1); p.vel.set((Math.random() - 0.5) * 4.5, 4.2 + Math.random() * 5.0, (Math.random() - 0.5) * 4.5);
        p.age = 0; p.maxAge = 2.4 + Math.random() * 1.2; p.baseOpacity = i < 4 ? 0.85 : 0.72;
      }
    },
    resetTrails() {
      for (const t of trails) { t.history.length = 0; t.mesh.visible = false; }
      for (const p of puffs) { p.spr.visible = false; p.age = 99; }
    },
    updateVisuals(st, dt, sec) {
      root.position.copy(st.pos); root.quaternion.copy(st.quat);
      ailerons.left.rotation.x = st.controls.roll * 0.42; ailerons.right.rotation.x = -st.controls.roll * 0.42;
      flapAngle = THREE.MathUtils.lerp(flapAngle, st.flapsDeployed ? 0.46 : 0, Math.min(1, dt * 6));
      flaps.left.rotation.x = flapAngle; flaps.right.rotation.x = flapAngle;
      elPiv.rotation.x = -st.controls.pitch * 0.38;
      for (const r of twinRudders) r.rotation.y = st.controls.yaw * 0.42;

      const wantGear = !st.airborne || st.flapsDeployed || st.altitudeAglFt < 28;
      gearDeploy = THREE.MathUtils.lerp(gearDeploy, wantGear ? 1 : 0, Math.min(1, dt * 4.5));
      gearGroup.scale.set(1, gearDeploy, 1); gearGroup.visible = !isCockpitHidden && gearDeploy > 0.05;
      beamMat.opacity = !isCockpitHidden && gearDeploy > 0.75 && st.altitudeAglFt < 12 && !st.crashed ? 0.75 : 0;

      if (!st.airborne && st.onDestRunway && st.groundSpeedKt > 32 && Math.random() < 0.35) this.spawnTouchdownDust(st.pos, 0.75);
      if (!st.crashed && st.hull < 78 && (dmgTimer += dt) > 0.12) {
        dmgTimer = 0; const p = puffs[pIdx++ % puffs.length]; p.spr.visible = true; p.mat.color.setHex(0x3b3d42);
        p.spr.position.set(st.pos.x, st.pos.y, st.pos.z + 2.5); p.spr.scale.set(1.8, 1.8, 1);
        p.vel.set((Math.random() - 0.5) * 1.5, 1.4, 3.0); p.age = 0; p.maxAge = 1.1; p.baseOpacity = 0.48;
      }

      propBlades.rotation.z += (18 + st.rpm * 78) * dt; propBlurMat.opacity = THREE.MathUtils.clamp((st.rpm - 0.14) * 0.8, 0.1, 0.6);
      thrMat.emissiveIntensity = st.fuel > 0 ? 1.1 + st.rpm * 3.0 + 0.25 * Math.sin(sec * 18) : 0.15;
      const flameOn = st.fuel > 0 && st.rpm > 0.30; plumeGroup.visible = !isCockpitHidden && flameOn;
      if (flameOn) {
        const sc = 0.45 + st.rpm * 0.85 + 0.08 * Math.sin(sec * 24); plumeGroup.scale.set(0.85 + st.rpm * 0.25, 0.85 + st.rpm * 0.25, sc);
        outerPlumeMat.opacity = 0.22 + st.rpm * 0.34; innerPlumeMat.opacity = 0.45 + st.rpm * 0.45;
      }

      const flash = (sec % 1.2) < 0.1; strobeMat.color.setHex(flash ? 0xffffff : 0x444b55); tailStrobe.scale.setScalar(flash ? 1.55 : 0.95);

      const terrainRaw = getTerrainHeight(st.pos.x, st.pos.z);
      const groundY = Math.max(0, terrainRaw); const agl = Math.max(0, st.pos.y - groundY);
      // Low-pass river water spray plume when skimming close over water (< 12 m)
      if (st.airborne && !st.crashed && terrainRaw < 0.3 && agl < 12.5 && (sprayTimer += dt) > 0.055) {
        sprayTimer = 0;
        for (const s of [-1.8, 1.8]) {
          const p = puffs[pIdx++ % puffs.length]; p.spr.visible = true; p.mat.color.setHex(0xdff4ff);
          p.spr.position.set(st.pos.x + s, 0.8, st.pos.z + 2.2); p.spr.scale.set(1.6, 1.1, 1);
          p.vel.set(s * 1.4, 2.2 + Math.random() * 1.4, 3.0); p.age = 0; p.maxAge = 0.72; p.baseOpacity = 0.42;
        }
      }

      dropShadow.visible = st.airborne && agl > 1.5; dropShadow.position.set(st.pos.x, groundY + 0.22, st.pos.z);
      dropShadow.rotation.y = THREE.MathUtils.degToRad(-st.headingDeg); dropShadow.scale.setScalar(1 + Math.min(2.2, agl * 0.025));
      shadowMat.opacity = THREE.MathUtils.clamp(0.62 - agl * 0.0055, 0.05, 0.62);

      const showT = st.airborne && st.airspeedKt > 68;
      const tOp = THREE.MathUtils.clamp((Math.abs(st.rollDeg) / 48 + Math.abs(st.controls.pitch) * 0.6) * 0.36, 0.08, 0.36);
      for (let i = 0; i < 2; i++) {
        const t = trails[i]; t.mat.opacity = showT ? tOp : 0; t.mesh.visible = showT;
        if (!showT) continue;
        tmpV.set(i === 0 ? -5.84 : 5.84, 0.18, -0.05).applyQuaternion(st.quat).add(st.pos);
        t.history.unshift(tmpV.clone()); if (t.history.length > trailLen) t.history.pop();
        if (t.history.length >= 2) {
          const arr = t.mesh.geometry.attributes.position.array; let ptr = 0;
          const tri = (x, y, z) => { arr[ptr++] = x; arr[ptr++] = y; arr[ptr++] = z; };
          for (let j = 0; j < t.history.length - 1; j++) {
            const p0 = t.history[j]; const p1 = t.history[j + 1]; const w = 0.14 * (1 - j / trailLen);
            tri(p0.x - w, p0.y, p0.z); tri(p0.x + w, p0.y, p0.z); tri(p1.x - w, p1.y, p1.z);
            tri(p0.x + w, p0.y, p0.z); tri(p1.x + w, p1.y, p1.z); tri(p1.x - w, p1.y, p1.z);
          }
          t.mesh.geometry.setDrawRange(0, (t.history.length - 1) * 6); t.mesh.geometry.attributes.position.needsUpdate = true;
        }
      }

      for (const p of puffs) {
        if (!p.spr.visible) continue;
        p.age += dt; if (p.age >= p.maxAge) { p.spr.visible = false; continue; }
        p.spr.position.addScaledVector(p.vel, dt); p.spr.scale.multiplyScalar(1 + dt * 0.9); p.mat.opacity = p.baseOpacity * (1 - p.age / p.maxAge);
      }
    },
  };
}
