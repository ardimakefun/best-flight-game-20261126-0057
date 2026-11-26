import * as THREE from 'three';

export const WORLD_BOUNDS = Object.freeze({
  zStartPlateau: 520, zEndNorth: -4550, riverStartZ: -195, riverEndZ: -3630,
  archZ: -1860, viaductZ: -1720, startRunwayZ: 100, startRunwayElevation: 26,
  destRunwayZ: -3960, destRunwayElevation: 22, sunDirection: new THREE.Vector3(-0.56, 0.24, -0.79).normalize(),
});

const FOG_COLOR = 0xcbbda8;
const FOG_DENSITY = 0.00024;
const canyonRaw = (z) => 155 * Math.sin((z + 160) * 0.0021) + 65 * Math.sin((z + 160) * 0.0052 + 0.7);
export const DEST_RUNWAY_X = canyonRaw(-3620);

/** Deterministic centerline X coordinate of the winding canyon river. */
export function canyonCenterX(z) {
  if (z > -160) return 0;
  const t = Math.min(1, (-160 - z) / 260); const s = t * t * (3 - 2 * t);
  if (z < -3500) {
    const e = Math.min(1, (-3500 - z) / 260); const es = e * e * (3 - 2 * e);
    return canyonRaw(z) * (1 - es) + DEST_RUNWAY_X * es;
  }
  return canyonRaw(z) * s;
}

const hash2 = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
const vn2 = (x, z) => {
  const ix = Math.floor(x); const iz = Math.floor(z); const fx = x - ix; const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx); const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz); const b = hash2(ix + 1, iz); const c = hash2(ix, iz + 1); const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
};
const fbm2 = (x, z) => 0.55 * vn2(x, z) + 0.30 * vn2(x * 2.07 + 13.4, z * 2.07 + 7.1) + 0.15 * vn2(x * 4.31 + 29.8, z * 4.31 + 19.2);
const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function canyonH(x, z) {
  const dx = Math.abs(x - canyonCenterX(z));
  const nL = fbm2(x * 0.0042, z * 0.0042); const nF = fbm2(x * 0.015 + 4.1, z * 0.015 + 9.7);
  return (-5.5 + 5.5 * ss(28, 66, dx)) + 12 * ss(64, 115, dx) * (0.7 + 0.6 * nF) +
    92 * ss(105, 195, dx) + 28 * ss(235, 290, dx) + 78 * ss(310, 440, dx) +
    (nL - 0.45) * 95 * ss(190, 520, dx) + (nF - 0.5) * 26 * ss(75, 220, dx);
}

/** Analytical + multi-octave canyon elevation at world (x, z). */
export function getTerrainHeight(x, z) {
  if (z >= -210) {
    const ef = ss(-210, -100, z); const pad = 1 - ss(42, 130, Math.abs(x));
    const h = WORLD_BOUNDS.startRunwayElevation + ss(130, 420, Math.abs(x)) * (35 + 48 * fbm2(x * 0.005, z * 0.005)) * (1 - 0.85 * pad) + ss(370, 560, z) * 45;
    return z >= -100 ? h : h * ef + canyonH(x, z) * (1 - ef);
  }
  if (z <= -3540) {
    const bl = ss(-3540, -3700, z); const dx = Math.abs(x - DEST_RUNWAY_X);
    const fh = WORLD_BOUNDS.destRunwayElevation + ss(135, 480, dx) * (44 + 66 * fbm2(x * 0.0045, z * 0.0045)) * (1 - 0.85 * (1 - ss(44, 135, dx))) + ss(-4220, -4550, z) * (85 + 50 * fbm2(x * 0.004, z * 0.004));
    return z <= -3700 ? fh : canyonH(x, z) * (1 - bl) + fh * bl;
  }
  return canyonH(x, z);
}

/** Check whether world position intersects the sculpted 3D natural rock arch. */
export function getArchDistanceInfo(pos) {
  const lx = pos.x - canyonCenterX(WORLD_BOUNDS.archZ); const lz = pos.z - WORLD_BOUNDS.archZ;
  if (Math.abs(lz) > 34 || Math.abs(lx) > 190) return { insideOpening: false, hitRock: false };
  const ay = 110 * (1 - Math.pow(Math.min(1, Math.abs(lx) / 186), 2.35) * 0.88) + 4;
  return { insideOpening: Math.abs(lz) < 20 && Math.abs(lx) < 132 && pos.y > 4 && pos.y < ay - 14.5, hitRock: Math.abs(lz) < 14.5 && Math.abs(pos.y - ay) < 13.0 };
}

const THERMALS = [{ z: -820, r: 72, s: 2.4 }, { z: -2150, r: 78, s: 2.6 }, { z: -3120, r: 74, s: 2.5 }];
/** Return upward thermal lift (m/s) at world position inside rising canyon updrafts. */
export function getThermalLiftAt(pos) {
  for (const th of THERMALS) {
    const dx = pos.x - canyonCenterX(th.z); const dz = pos.z - th.z; const d2 = dx * dx + dz * dz;
    if (d2 < th.r * th.r && pos.y > 8 && pos.y < 140) return th.s * (1 - Math.sqrt(d2) / th.r);
  }
  return 0;
}

/** Build the Canyon Dawn Patrol 3D scene: FBM clouds, storm transition, jagged Alpine peaks, river, corrugated hangars & stair tower. */
export function createCanyonWorld(scene) {
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
  const ws = {
    waterUniforms: null, skyUniforms: null, fallUniforms: null, sunLight: null, hemiLight: null,
    thermals: [], strobes: [], windsocks: [], radars: [], rotors: [], papi: { start: [], dest: [] },
    update(sec, windKt, windRad, pos, storm = 0) {
      if (this.sunLight) { const off = WORLD_BOUNDS.sunDirection.clone().multiplyScalar(1100); this.sunLight.position.set(pos.x + off.x, Math.max(280, pos.y + off.y), pos.z - 250 + off.z * 0.45); this.sunLight.target.position.set(pos.x, 40, pos.z - 250); this.sunLight.target.updateMatrixWorld(); this.sunLight.intensity = THREE.MathUtils.lerp(2.3, 0.85, storm); }
      if (this.hemiLight) this.hemiLight.intensity = THREE.MathUtils.lerp(0.92, 0.42, storm);
      scene.fog.color.setHex(storm > 0.4 ? 0x4b5862 : FOG_COLOR); scene.fog.density = THREE.MathUtils.lerp(FOG_DENSITY, 0.00048, storm);
      if (this.waterUniforms) { this.waterUniforms.uTime.value = sec; this.waterUniforms.uCameraPos.value.copy(pos); this.waterUniforms.uFogColor.value.copy(scene.fog.color); this.waterUniforms.uFogDensity.value = scene.fog.density; }
      if (this.skyUniforms) { this.skyUniforms.uTime.value = sec; this.skyUniforms.uStorm.value = storm; }
      if (this.fallUniforms) this.fallUniforms.uTime.value = sec;
      for (const th of this.thermals) { th.ring.rotation.y = sec * 1.1; th.ring.position.y = 14 + ((sec * 16 + th.phase) % 72); }
      const on = (sec % 1.4) < 0.14; for (const s of this.strobes) s.material.emissiveIntensity = on ? 3.8 : 0.25;
      for (const s of this.windsocks) { s.p.rotation.y = windRad; s.c.rotation.z = THREE.MathUtils.lerp(0.68, 0.06, Math.min(1, windKt / 20)) + Math.sin(sec * 6.5) * 0.05; }
      for (const r of this.radars) r.rotation.y = sec * 1.45; for (const w of this.rotors) w.rotation.z = sec * (1.6 + windKt * 0.22);
    },
    updatePapi(pos, rwyZ, elev) {
      const d = pos.z - rwyZ; const g = d > 20 ? (pos.y - elev) / d : 0.055;
      for (const b of this.papi.dest) { const w = g > 0.068 + b.offset; b.mat.color.setHex(w ? 0xfff8ea : 0xff3b30); b.mat.emissive.setHex(w ? 0xffefd0 : 0xff281c); }
    },
  };

  ws.skyUniforms = { uSunDir: { value: WORLD_BOUNDS.sunDirection.clone() }, uTime: { value: 0 }, uStorm: { value: 0 } };
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(7600, 44, 28), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: ws.skyUniforms,
    vertexShader: `varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*viewMatrix*(modelMatrix*vec4(position,1.));}`,
    fragmentShader: `varying vec3 vD;uniform vec3 uSunDir;uniform float uTime;uniform float uStorm;float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float vn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),u.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),u.x),u.y);}float fbm(vec2 p){float v=0.,a=.52;for(int i=0;i<5;i++){v+=a*vn(p);p=p*2.04+vec2(11.3,7.7);a*=.5;}return v;}void main(){vec3 d=normalize(vD);float h=clamp(d.y,-.15,1.),c1,c2,cloud,sunDot=max(dot(d,normalize(uSunDir)),0.);vec3 zen=mix(vec3(.15,.29,.46),vec3(.08,.11,.15),uStorm),mid=mix(vec3(.42,.56,.66),vec3(.18,.23,.28),uStorm),hor=mix(vec3(.88,.74,.55),vec3(.29,.34,.38),uStorm),col=mix(mix(hor,mid,smoothstep(-.02,.22,h)),zen,smoothstep(.18,.75,h));vec2 uv=d.xz/max(.065,abs(d.y)+.055);c1=fbm(uv*.44+vec2(uTime*.008,-uTime*.004));c2=fbm(uv*1.1+vec2(3.2-uTime*.006,1.4));cloud=smoothstep(mix(.45,.20,uStorm),.80,c1*.68+c2*.32)*smoothstep(mix(.01,-.04,uStorm),.08,h)*(1.-smoothstep(.32,.85,h));vec3 cShade=mix(vec3(.52,.58,.65),vec3(.12,.15,.19),uStorm),cLit=mix(vec3(.98,.90,.78),vec3(.38,.43,.47),uStorm)+vec3(.38,.22,.10)*pow(sunDot,4.)*(1.-uStorm);col=mix(col,mix(cShade,cLit,smoothstep(.32,.78,c1)),cloud*.88);col+=vec3(.96,.72,.38)*pow(sunDot,7.)*(.26*(1.-.85*uStorm))+vec3(1.,.92,.76)*pow(sunDot,96.)*(.44*(1.-.92*uStorm));col=mix(col,vec3(1.,.97,.90),smoothstep(.9990,.9995,sunDot)*(1.-.94*uStorm));gl_FragColor=vec4(col,1.);}`,
  })));

  ws.hemiLight = new THREE.HemisphereLight(0xdcebff, 0x5c5141, 0.92); scene.add(ws.hemiLight);
  const sun = new THREE.DirectionalLight(0xffdfb0, 2.3); sun.position.copy(WORLD_BOUNDS.sunDirection).multiplyScalar(1100);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 60; sun.shadow.camera.far = 2000;
  Object.assign(sun.shadow.camera, { left: -280, right: 280, top: 280, bottom: -280 }); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.08;
  scene.add(sun, sun.target); ws.sunLight = sun;
  const bounce = new THREE.DirectionalLight(0x88b4e6, 0.52); bounce.position.set(420, 260, 560); scene.add(bounce);

  buildCanyonTerrain(scene); buildCanyonRiver(scene, ws); buildNaturalRockArch(scene);
  buildViaduct(scene); buildMountains(scene); buildFloraAndProps(scene, ws);
  buildAirfield(scene, ws, { name: 'start', cx: 0, cz: WORLD_BOUNDS.startRunwayZ, elev: WORLD_BOUNDS.startRunwayElevation, len: 390, w: 34, side: 1 });
  buildAirfield(scene, ws, { name: 'dest', cx: DEST_RUNWAY_X, cz: WORLD_BOUNDS.destRunwayZ, elev: WORLD_BOUNDS.destRunwayElevation, len: 440, w: 36, side: -1 });
  return ws;
}

const mGeo = (pos, idx, attrName, attr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute(attrName, attr); g.setIndex(idx); g.computeVertexNormals(); return g; };

function buildCanyonTerrain(scene) {
  const nx = 112; const nz = 240; const vc = (nx + 1) * (nz + 1);
  const pos = new Float32Array(vc * 3); const col = new Float32Array(vc * 3); const idx = [];
  const [cSilt, cOasis, cTerra, cOchre, cCrest, tmp] = [0x9a886b, 0x5b743c, 0xb85a39, 0xd18a55, 0x7c8a69, 0].map((h) => new THREE.Color(h));
  let ptr = 0;
  for (let iz = 0; iz <= nz; iz++) {
    const z = THREE.MathUtils.lerp(WORLD_BOUNDS.zStartPlateau, WORLD_BOUNDS.zEndNorth, iz / nz); const cx = canyonCenterX(z);
    for (let ix = 0; ix <= nx; ix++) {
      const u = (ix / nx) * 2 - 1; const au = Math.abs(u);
      const x = cx + Math.sign(u || 1) * (au * 220 + au * au * au * 1050); const y = getTerrainHeight(x, z);
      pos[ptr * 3] = x; pos[ptr * 3 + 1] = y; pos[ptr * 3 + 2] = z;
      const pn = fbm2(x * 0.009 + 2.3, z * 0.009 + 6.1); const st = 0.5 + 0.5 * Math.sin(y * 0.22 + pn * 3.6);
      if (y < 6.5) tmp.copy(cSilt).lerp(cOasis, ss(1.5, 6.5, y) * pn);
      else if (y < 34) tmp.copy(cOasis).lerp(cTerra, ss(0.32, 0.72, st));
      else if (y < 125) tmp.copy(cTerra).lerp(cOchre, st);
      else tmp.copy(cOchre).lerp(cCrest, ss(125, 200, y) * pn);
      if ((z > -130 && z < 320 && Math.abs(x) < 34) || (z < -3700 && z > -4220 && Math.abs(x - DEST_RUNWAY_X) < 34)) tmp.setHex(0x525d40);
      col[ptr * 3] = tmp.r; col[ptr * 3 + 1] = tmp.g; col[ptr * 3 + 2] = tmp.b; ptr++;
    }
  }
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const a = iz * (nx + 1) + ix; const c = a + nx + 1; idx.push(a, a + 1, c, a + 1, c + 1, c); }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91, metalness: 0.03 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW=(modelMatrix*vec4(transformed,1.)).xyz;\nvN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN;').replace('#include <color_fragment>', `#include <color_fragment>\nfloat st=sin(vW.y*.42+sin(vW.x*.025+vW.z*.02)*1.6),sl=1.-clamp(vN.y,0.,1.),gr=sin(vW.x*.16)*cos(vW.z*.16)*.06+sin(vW.x*.52+vW.z*.41)*.035;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.76,.66,.50),(1.-smoothstep(.4,5.2,vW.y))*.72);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.32,.44,.22),smoothstep(.66,.92,vN.y)*.68*step(14.,vW.y));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.42,.25,.19),smoothstep(.42,.94,st)*sl*.24);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.82,.68,.52),smoothstep(.68,.99,sin(vW.y*1.2))*sl*.12);diffuseColor.rgb*=(1.+gr);`);
  };
  const m = new THREE.Mesh(mGeo(pos, idx, 'color', new THREE.BufferAttribute(col, 3)), mat); m.receiveShadow = true; m.castShadow = true; scene.add(m);
}

function buildCanyonRiver(scene, ws) {
  const sZ = 180; const sX = 16; const hw = 70; const v = (sZ + 1) * (sX + 1);
  const pos = new Float32Array(v * 3); const uvs = new Float32Array(v * 2); const idx = [];
  let p = 0;
  for (let iz = 0; iz <= sZ; iz++) {
    const t = iz / sZ; const z = THREE.MathUtils.lerp(WORLD_BOUNDS.riverStartZ, WORLD_BOUNDS.riverEndZ, t); const cx = canyonCenterX(z);
    for (let ix = 0; ix <= sX; ix++) { const u = ix / sX; pos[p * 3] = cx + (u * 2 - 1) * hw; pos[p * 3 + 1] = 0; pos[p * 3 + 2] = z; uvs[p * 2] = u; uvs[p * 2 + 1] = t * 48; p++; }
  }
  for (let iz = 0; iz < sZ; iz++) for (let ix = 0; ix < sX; ix++) { const a = iz * (sX + 1) + ix; const c = a + sX + 1; idx.push(a, a + 1, c, a + 1, c + 1, c); }
  ws.waterUniforms = { uTime: { value: 0 }, uSunDir: { value: WORLD_BOUNDS.sunDirection.clone() }, uCameraPos: { value: new THREE.Vector3(0, 80, 200) }, uFogColor: { value: new THREE.Color(FOG_COLOR) }, uFogDensity: { value: FOG_DENSITY } };
  scene.add(new THREE.Mesh(mGeo(pos, idx, 'uv', new THREE.BufferAttribute(uvs, 2)), new THREE.ShaderMaterial({
    uniforms: ws.waterUniforms, vertexShader: `varying vec3 vW;varying vec2 vU;void main(){vU=uv;vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `varying vec3 vW;varying vec2 vU;uniform float uTime;uniform vec3 uSunDir;uniform vec3 uCameraPos;uniform vec3 uFogColor;uniform float uFogDensity;void main(){vec2 p=vW.xz;float t=uTime,w1=sin(p.x*.35+p.y*.24-t*2.2),w2=cos(p.x*.28-p.y*.41+t*1.7),w3=sin((p.x*.88+p.y*.76)-t*3.6)*.5;vec3 n=normalize(vec3((w1*.22+w2*.20+w3*.42)*.16,1.,(w1*.18-w2*.26-w3*.38)*.16)),vd=normalize(uCameraPos-vW);float fr=pow(1.-max(dot(vd,n),0.),3.4),bank=abs(vU.x*2.-1.)+.05*sin(p.y*.13+p.x*.09);vec3 base=mix(vec3(.03,.28,.44),vec3(.11,.56,.68),smoothstep(.28,.96,bank)*.78),col=mix(base,vec3(.32,.64,.82),clamp(fr*.64+.12,0.,.64)),hv=normalize(normalize(uSunDir)+vd);float ndh=max(dot(n,hv),0.);col+=vec3(1.,.96,.86)*(pow(ndh,160.)*2.4*(.5+.5*sin(p.x*1.4-p.y*1.2+t*4.5))+pow(ndh,28.)*.18);float foam=max(smoothstep(.8,.98,bank)*(.55+.45*sin(p.y*.36-t*2.4)),exp(-abs(vW.z+1720.)*.055)*(.45+.55*sin(vW.x*.42+t*2.6))*.65);col=mix(col,vec3(.92,.96,.98),foam*.48);float d=length(uCameraPos-vW);gl_FragColor=vec4(mix(col,uFogColor,clamp(1.-exp(-uFogDensity*uFogDensity*d*d),0.,1.)),1.);}`,
  })));
}

const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); return k; };

function buildNaturalRockArch(scene) {
  const g = new THREE.Group(); g.position.set(canyonCenterX(WORLD_BOUNDS.archZ), 0, WORLD_BOUNDS.archZ);
  const pts = []; for (let i = 0; i <= 28; i++) { const t = (i / 28) * 2 - 1; pts.push(new THREE.Vector3(t * 186, 110 * (1 - Math.pow(Math.abs(t), 2.35) * 0.88) + 4, Math.sin(i * 1.1) * 2.4)); }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 56, 13.5, 10, false);
  const pa = geo.attributes.position; const cols = new Float32Array(pa.count * 3);
  const c0 = new THREE.Color(0x9f4a32); const c1 = new THREE.Color(0xd5774a); const c2 = new THREE.Color(0xeec08c); const tmp = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    const vx = pa.getX(i); const vy = pa.getY(i); const vz = pa.getZ(i); const xf = Math.min(1, Math.abs(vx) / 186);
    pa.setXYZ(i, vx, vy + (Math.sin(vy * 0.46) * 1.8 + Math.cos(vx * 0.12) * 1.4) * 0.65, vz * (1.25 + 0.22 * Math.sin(vy * 0.25)) * (1 + xf * xf * 0.95));
    tmp.copy(c0).lerp(c1, 0.5 + 0.5 * Math.sin(vy * 0.42 + vx * 0.04)).lerp(c2, Math.max(0, (vy - 55) / 65));
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, emissive: 0x522616, emissiveIntensity: 0.34 })); m.castShadow = true; m.receiveShadow = true; g.add(m); scene.add(g);
}

function buildViaduct(scene) {
  const g = new THREE.Group(); g.position.set(canyonCenterX(WORLD_BOUNDS.viaductZ), 0, WORLD_BOUNDS.viaductZ); g.rotation.y = 0.08;
  const st = new THREE.MeshStandardMaterial({ color: 0x9b8268, roughness: 0.88 }); const tr = new THREE.MeshStandardMaterial({ color: 0xc2ab8e, roughness: 0.82 });
  const dk = box(252, 2.2, 8.6, st, 0, 15.8, 0); dk.castShadow = true; dk.receiveShadow = true; g.add(dk);
  for (const s of [-3.9, 3.9]) g.add(box(252, 1.3, 0.7, tr, 0, 17.4, s));
  for (let i = -3; i <= 3; i++) {
    const pr = box(5.2, 19.5, 9.2, st, i * 34, 6.2, 0); pr.castShadow = true; pr.receiveShadow = true; g.add(pr);
    if (i < 3) { const a = new THREE.Mesh(new THREE.TorusGeometry(14.6, 2.1, 6, 14, Math.PI), st); a.scale.set(1, 0.72, 1.85); a.position.set(i * 34 + 17, 5.5, 0); g.add(a); }
  }
  scene.add(g);
}

function buildMountains(scene) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.90, metalness: 0.04, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vAlt; varying vec3 vWN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlt=(modelMatrix*vec4(transformed,1.)).y;\nvWN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlt; varying vec3 vWN;').replace('#include <color_fragment>', `#include <color_fragment>\nfloat sl=1.-clamp(vWN.y,0.,1.);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.95,.97,1.),smoothstep(185.,320.,vAlt)*smoothstep(.62,.18,sl)*.85);`);
  };
  const [cBase, cSlate, cCrag, tmp] = [0x4b5c3c, 0x6d6964, 0x9a9087, 0].map((h) => new THREE.Color(h));
  for (const r of [[DEST_RUNWAY_X - 80, -5020, 4200, 1150, 610, 76, 28], [560, -950, 1250, 980, 390, 30, 24], [-1220, -2300, 1120, 2800, 470, 26, 54], [1180, -2350, 1120, 2800, 460, 26, 54]]) {
    const [cx, cz, w, d, amp, sx, sz] = r; const geo = new THREE.PlaneGeometry(w, d, sx, sz); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position; const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i); const lz = p.getZ(i); const wx = cx + lx; const wz = cz + lz;
      const r1 = 1 - Math.abs(fbm2(wx * 0.0018 + 2.4, wz * 0.0018 - 1.3) * 2 - 1); const r2 = 1 - Math.abs(fbm2(wx * 0.0046 + 9.1, wz * 0.0046 + 4.7) * 2 - 1);
      const h = (Math.pow(r1, 1.45) * amp + r2 * amp * 0.34) * (1 - Math.pow(Math.min(1, Math.abs(lx) / (w * 0.5)), 2.2)) * (1 - Math.pow(Math.min(1, Math.abs(lz) / (d * 0.5)), 2.0));
      p.setY(i, h); tmp.copy(cBase).lerp(cSlate, ss(70, 210, h)).lerp(cCrag, ss(210, 420, h)); cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.position.set(cx, 0, cz); m.receiveShadow = true; scene.add(m);
  }
}

function buildFloraAndProps(scene, ws) {
  const t1 = new THREE.ConeGeometry(2.8, 10.0, 6); t1.translate(0, 6.0, 0);
  const t2 = new THREE.ConeGeometry(2.1, 8.2, 6); t2.translate(0, 10.6, 0);
  const p1 = t1.toNonIndexed().attributes.position; const p2 = t2.toNonIndexed().attributes.position;
  const arr = new Float32Array((p1.count + p2.count) * 3); arr.set(p1.array, 0); arr.set(p2.array, p1.count * 3);
  const tGeo = new THREE.BufferGeometry(); tGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3)); tGeo.computeVertexNormals();
  const mt = (o) => new THREE.MeshStandardMaterial(o); const bs = (o) => new THREE.MeshBasicMaterial(o);
  const cy = (rt, rb, h, n = 10, o = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, o);
  const mk = (c, r = 0.85, m = 0.05) => mt({ color: c, roughness: r, metalness: m }); const maxTrees = 860;
  const tInst = new THREE.InstancedMesh(tGeo, mk(0xffffff, 0.9), maxTrees); tInst.castShadow = true; tInst.receiveShadow = true;
  const dummy = new THREE.Object3D(); const shades = [0x284323, 0x33502b, 0x3d592e, 0x22371e].map((h) => new THREE.Color(h));
  let ti = 0;
  const pushTree = (x, z, s, rot) => {
    const y = getTerrainHeight(x, z); if (ti >= maxTrees || y < 2.2 || y > 152) return;
    dummy.position.set(x, y - 0.6, z); dummy.scale.set(s, s * (0.82 + hash2(x, z) * 0.48), s); dummy.rotation.y = rot; dummy.updateMatrix();
    tInst.setMatrixAt(ti, dummy.matrix); tInst.setColorAt(ti, shades[ti % 4]); ti++;
  };
  for (const vs of [{ cx: 92, cz: 35 }, { cx: canyonCenterX(-1705) - 96, cz: -1705 }, { cx: DEST_RUNWAY_X - 102, cz: -3805 }]) {
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; pushTree(vs.cx + Math.cos(a) * (18 + (k % 3) * 8), vs.cz + 12 + Math.sin(a) * (18 + (k % 2) * 8), 0.78 + hash2(vs.cx, k) * 0.4, a); }
  }
  for (let i = 0; i < 980 && ti < maxTrees; i++) {
    const z = THREE.MathUtils.lerp(360, -4500, i / 979); const cx = canyonCenterX(z);
    const x = cx + (i % 2 === 0 ? -1 : 1) * ((z > -180 || z < -3680 ? 48 : 70) + hash2(i, 9) * 265);
    if ((z > -150 && z < 340 && Math.abs(x) < 46) || (z < -3690 && z > -4260 && Math.abs(x - DEST_RUNWAY_X) < 46)) continue;
    pushTree(x, z, 0.72 + hash2(i, 17) * 0.90, hash2(i, 31) * Math.PI);
  }
  tInst.count = ti; if (tInst.instanceColor) tInst.instanceColor.needsUpdate = true; scene.add(tInst);
  const rGeo = cy(2.4, 5.2, 16, 7); rGeo.translate(0, 8, 0);
  const rInst = new THREE.InstancedMesh(rGeo, mk(0xb65536, 0.92), 28); rInst.castShadow = true;
  for (let i = 0; i < 28; i++) {
    const z = THREE.MathUtils.lerp(180, -4050, i / 27); const x = canyonCenterX(z) + (i % 2 === 0 ? -1 : 1) * (z > -180 ? 64 : 114 + hash2(i, 41) * 35);
    dummy.position.set(x, Math.max(2, getTerrainHeight(x, z)) - 0.8, z); dummy.scale.setScalar(0.8 + hash2(i, 43) * 0.65); dummy.rotation.y = i * 0.7; dummy.updateMatrix(); rInst.setMatrixAt(i, dummy.matrix);
  }
  scene.add(rInst);
  for (let i = 0; i < THERMALS.length; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(22, 0.42, 6, 28), bs({ color: 0xffd27a, transparent: true, opacity: 0.34 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(canyonCenterX(THERMALS[i].z), 20, THERMALS[i].z); scene.add(ring); ws.thermals.push({ ring, phase: i * 24 });
  }
  const wall = mk(0xe6dcc9); const roof = mk(0xb85233, 0.78);
  for (const cl of [{ cx: 92, cz: 35, n: 6 }, { cx: canyonCenterX(-1705) - 96, cz: -1705, n: 8 }, { cx: DEST_RUNWAY_X - 102, cz: -3805, n: 7 }]) {
    for (let i = 0; i < cl.n; i++) {
      const gx = cl.cx + ((i % 3) - 1) * 12 + (hash2(i, cl.cz) - 0.5) * 4; const gz = cl.cz + Math.floor(i / 3) * 14 + (hash2(cl.cx, i) - 0.5) * 4;
      const gy = getTerrainHeight(gx, gz); if (gy < 3) continue;
      const h = new THREE.Group(); const b = box(7.2, 4.4, 5.8, wall, 0, 2.2, 0); b.castShadow = true; h.add(b);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.8, 4), roof); rf.rotation.y = Math.PI / 4; rf.position.y = 5.6; h.add(rf);
      h.position.set(gx, gy - 0.4, gz); h.scale.setScalar(0.84 + hash2(gz, gx) * 0.34); h.rotation.y = hash2(gx, gz) * 0.6; scene.add(h);
    }
  }
  const lhX = canyonCenterX(WORLD_BOUNDS.viaductZ) - 108; const lhZ = WORLD_BOUNDS.viaductZ + 38;
  const lh = new THREE.Group(); lh.position.set(lhX, Math.max(12, getTerrainHeight(lhX, lhZ)) - 0.5, lhZ);
  for (let b = 0; b < 4; b++) { const m = new THREE.Mesh(cy(2.2 - b * 0.22, 2.45 - b * 0.22, 4.5, 10), b % 2 === 0 ? wall : roof); m.position.y = 2.25 + b * 4.5; m.castShadow = true; lh.add(m); }
  const lan = new THREE.Mesh(cy(1.7, 1.7, 2.4, 10), bs({ color: 0xffeba8 })); lan.position.y = 19.2; lh.add(lan); scene.add(lh);
  const wfZ = -1120; ws.fallUniforms = { uTime: { value: 0 } };
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(24, 108), new THREE.ShaderMaterial({
    uniforms: ws.fallUniforms, transparent: true, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*viewMatrix*(modelMatrix*vec4(position,1.));}`,
    fragmentShader: `varying vec2 vU;uniform float uTime;void main(){float edge=smoothstep(0.,0.22,vU.x)*(1.0-smoothstep(0.78,1.0,vU.x));float str=0.55+0.45*sin(vU.y*28.0+uTime*12.0+sin(vU.x*14.0));gl_FragColor=vec4(mix(vec3(0.55,0.82,0.95),vec3(0.95,0.98,1.0),str),edge*(0.45+0.42*str));}`,
  }));
  wf.rotation.order = 'YXZ'; wf.position.set(canyonCenterX(wfZ) + 148, 52, wfZ); wf.rotation.y = -Math.PI / 2; wf.rotation.x = -0.68; scene.add(wf);
  const mist = new THREE.Mesh(cy(16, 22, 8, 14), bs({ color: 0xecf7ff, transparent: true, opacity: 0.34, depthWrite: false })); mist.position.set(canyonCenterX(wfZ) + 108, 3.5, wfZ); scene.add(mist);
  const wtMat = mk(0xeff3f7, 0.5);
  for (let i = 0; i < 2; i++) {
    const tz = -2450 - i * 85; const tx = canyonCenterX(tz) - 185; const wg = new THREE.Group(); wg.position.set(tx, Math.max(40, getTerrainHeight(tx, tz)) - 1, tz);
    const mast = new THREE.Mesh(cy(0.9, 1.5, 42, 8), wtMat); mast.position.y = 21; mast.castShadow = true; wg.add(mast);
    const rotor = new THREE.Group(); rotor.position.set(0, 41, 2.2);
    for (let b = 0; b < 3; b++) { const arm = new THREE.Group(); arm.rotation.z = (b * Math.PI * 2) / 3; arm.add(box(1.1, 16, 0.4, wtMat, 0, 8, 0)); rotor.add(arm); }
    wg.add(rotor); ws.rotors.push(rotor); scene.add(wg);
  }
  const bMat = mk(0xede6da, 0.6); const sMat = mt({ color: 0xd96236, roughness: 0.7, side: THREE.DoubleSide });
  for (const bz of [-1520, -1775, -2450]) {
    const boat = new THREE.Group(); boat.add(box(2.6, 1.2, 6.2, bMat, 0, 0.5, 0));
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5.2, 4), sMat); sail.position.set(0, 3.4, 0.2); boat.add(sail);
    boat.position.set(canyonCenterX(bz) + (bz === -1775 ? 24 : -22), 0.1, bz); boat.rotation.y = 0.25; scene.add(boat);
  }
}

function makeRunwayTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = '#2a2f36'; x.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 4500; i++) { x.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.09)'; x.fillRect(hash2(i, 1) * 512, hash2(i, 2) * 1024, 3, 3); }
  x.fillStyle = '#eae5d8'; x.fillRect(18, 0, 10, 1024); x.fillRect(484, 0, 10, 1024);
  for (let k = 0; k < 6; k++) { x.fillRect(62 + k * 68, 22, 34, 72); x.fillRect(62 + k * 68, 930, 34, 72); }
  for (const y of [150, 804]) { x.fillRect(104, y, 40, 62); x.fillRect(368, y, 40, 62); }
  for (let y = 132; y < 890; y += 70) x.fillRect(249, y, 14, 38);
  x.save(); x.translate(256, 745); x.scale(1, .3); x.font = 'bold 148px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('36', 0, 0); x.restore();
  return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace, anisotropy: 4 });
}
function makeCorrugatedTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#aeb6be'; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 256; i += 8) { x.fillStyle = i % 16 === 0 ? 'rgba(20,30,40,.16)' : 'rgba(255,255,255,.12)'; x.fillRect(i, 0, 4, 128); }
  x.fillStyle = 'rgba(20,30,40,.22)'; x.fillRect(0, 62, 256, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeApronGlowTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(255,190,104,.42)'); g.addColorStop(1, 'rgba(255,190,104,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

function buildAirfield(scene, ws, cfg) {
  const g = new THREE.Group(); g.position.set(cfg.cx, cfg.elev + 0.16, cfg.cz);
  const pl = (w, h, m, rx = -Math.PI / 2, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); k.rotation.x = rx; k.position.set(x, y, z); return k; };
  const base = box(cfg.w, 0.34, cfg.len, new THREE.MeshStandardMaterial({ color: 0x2d3138, roughness: .88, metalness: .06 })); base.receiveShadow = true; g.add(base);
  const top = pl(cfg.w, cfg.len, new THREE.MeshStandardMaterial({ map: makeRunwayTex(), roughness: .85, metalness: .05 }), -Math.PI / 2, 0, .19, 0); top.receiveShadow = true; g.add(top);
  const apZ = cfg.name === 'start' ? 92 : -10;
  const ap = box(56, .3, 86, new THREE.MeshStandardMaterial({ color: 0x454a52, roughness: .9 }), cfg.side * (cfg.w * .5 + 26), -.02, apZ); ap.receiveShadow = true; g.add(ap);
  g.add(box(42, .32, 1.2, new THREE.MeshBasicMaterial({ color: 0xe8b948 }), cfg.side * (cfg.w * .5 + 16), .02, apZ));
  const std = (c, r = .85, mt = .05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
  const wall = new THREE.MeshStandardMaterial({ map: makeCorrugatedTex(), roughness: .72 });
  const cWall = std(0xc2c8ce, .75); const slate = std(0x344250, .6, .25); const orange = std(0xd95826, .55); const truckMat = std(0xf4b63d, .5);

  const hg = new THREE.Group(); hg.position.set(cfg.side * (cfg.w * 0.5 + 36), 0, cfg.name === 'start' ? 112 : 8);
  const hBody = box(28, 10, 42, wall, 0, 5, 0); hBody.castShadow = true; hBody.receiveShadow = true; hg.add(hBody);
  const roof = box(30, 2.2, 44, slate, 0, 11.1, 0); roof.rotation.z = cfg.side * 0.06; roof.castShadow = true; hg.add(roof, box(0.45, 0.7, 43.2, orange, -cfg.side * 14.3, 9.6, 0));
  const bayMat = std(0x161b22, 0.9, 0); const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb85c });
  const floorGlowMat = new THREE.MeshBasicMaterial({ map: makeApronGlowTex(), transparent: true, depthWrite: false });
  for (const bz of [-10, 10]) {
    hg.add(box(2.6, 7.6, 15.6, bayMat, -cfg.side * 13.3, 3.8, bz), box(0.9, 0.45, 13.8, glowMat, -cfg.side * 13.5, 7.35, bz), box(0.4, 7.8, 0.65, slate, -cfg.side * 14.4, 3.9, bz));
    const sp2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 15), floorGlowMat); sp2.rotation.x = -Math.PI / 2; sp2.position.set(-cfg.side * 19.5, 0.18, bz); hg.add(sp2);
  }
  const cG = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
  for (let d = 0; d < 6; d++) { const dr = new THREE.Mesh(cG(0.55, 0.55, 1.45), d % 2 === 0 ? orange : slate); dr.position.set(-cfg.side * (15.4 + (d % 2) * 1.3), 0.72, -19 + Math.floor(d / 2) * 1.45); dr.castShadow = true; hg.add(dr); }
  const trk = new THREE.Group(); trk.position.set(-cfg.side * 19.5, 0, -4);
  const cab = box(2.5, 2.3, 2.4, truckMat, 0, 1.5, 2.2); cab.castShadow = true; trk.add(cab);
  const tank = new THREE.Mesh(cG(1.15, 1.15, 4.4, 12), cWall); tank.rotation.x = Math.PI / 2; tank.position.set(0, 1.65, -1.2); tank.castShadow = true; trk.add(tank);
  for (const [wx, wz] of [[-1.2, 2.1], [1.2, 2.1], [-1.2, -2.0], [1.2, -2.0]]) { const w = new THREE.Mesh(cG(0.55, 0.55, 0.4), slate); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.55, wz); trk.add(w); }
  hg.add(trk);
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64; const sctx = sc.getContext('2d');
  sctx.fillStyle = '#202833'; sctx.fillRect(0, 0, 256, 64); sctx.fillStyle = '#ffd170'; sctx.font = 'bold 28px monospace'; sctx.textAlign = 'center'; sctx.textBaseline = 'middle'; sctx.fillText('OUTPOST // 36', 128, 32);
  hg.add(box(0.6, 1.8, 16, new THREE.MeshBasicMaterial({ map: Object.assign(new THREE.CanvasTexture(sc), { colorSpace: THREE.SRGBColorSpace }) }), -cfg.side * 14.5, 8.4, 0)); g.add(hg);
  const tw = new THREE.Group(); tw.position.set(cfg.side * (cfg.w * 0.5 + 22), 0, cfg.name === 'start' ? 62 : -46);
  const shaft = box(5.6, 19, 5.6, cWall, 0, 9.5, 0); shaft.castShadow = true;
  tw.add(shaft, box(10.8, 0.8, 10.8, slate, 0, 19.2, 0), box(8.6, 4.0, 8.6, new THREE.MeshStandardMaterial({ color: 0x67cff0, emissive: 0xffb357, emissiveIntensity: 0.65, roughness: 0.22, metalness: 0.4 }), 0, 21.5, 0), box(10.0, 1.0, 10.0, slate, 0, 24.0, 0));
  for (let lv = 0; lv < 4; lv++) { const ramp = box(0.4, 0.35, 6.2, slate, -cfg.side * 3.1, 3.0 + lv * 4.2, 0); ramp.rotation.x = lv % 2 === 0 ? 0.52 : -0.52; tw.add(ramp); }
  for (const mx of [-2.8, 2.8]) for (const mz of [-4.35, 4.35]) tw.add(box(0.28, 4.0, 0.28, slate, mx, 21.5, mz));
  const mast = new THREE.Mesh(cG(0.06, 0.10, 5.5, 6), slate); mast.position.set(3.2, 27.0, -3.0); tw.add(mast);
  const radar = box(5.4, 0.7, 1.0, cWall, 0, 25.1, 0); tw.add(radar); ws.radars.push(radar);
  const bcn = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff5a36, emissive: 0xff5a36, emissiveIntensity: 2.2 })); bcn.position.y = 26.0; tw.add(bcn); ws.strobes.push(bcn); g.add(tw);
  const sp = new THREE.Group(); sp.position.set(-cfg.side * (cfg.w * 0.5 + 11), 0, cfg.len * 0.26);
  const pole = new THREE.Mesh(cG(0.18, 0.24, 9.5, 8), cWall); pole.position.y = 4.75; sp.add(pole);
  const sC = document.createElement('canvas'); sC.width = 64; sC.height = 64; const sc2 = sC.getContext('2d');
  for (let i = 0; i < 4; i++) { sc2.fillStyle = i % 2 === 0 ? '#ff5722' : '#f7f3eb'; sc2.fillRect(0, i * 16, 64, 16); }
  const sPiv = new THREE.Group(); sPiv.position.y = 9.2; const sIn = new THREE.Group();
  const sCn = new THREE.Mesh(new THREE.ConeGeometry(0.88, 4.6, 10, 1, true), new THREE.MeshStandardMaterial({ map: Object.assign(new THREE.CanvasTexture(sC), { colorSpace: THREE.SRGBColorSpace }), side: THREE.DoubleSide }));
  sCn.rotation.z = Math.PI / 2; sCn.position.x = 2.3; sIn.add(sCn); sPiv.add(sIn); sp.add(sPiv); g.add(sp); ws.windsocks.push({ p: sPiv, c: sIn });
  const emMat = (c, e, i) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: i });
  const eMat = emMat(0xffe49c, 0xffbb55, 2.2); const gMat = emMat(0x62ff9e, 0x42e880, 2.4); const halfL = cfg.len * 0.5;
  for (let z = -halfL + 15; z <= halfL - 15; z += 45) for (const sx of [-1, 1]) g.add(box(0.65, 0.7, 0.65, eMat, sx * (cfg.w * 0.5 + 1.1), 0.4, z));
  for (let x = -cfg.w * 0.42; x <= cfg.w * 0.42; x += 5.5) g.add(box(0.65, 0.7, 0.65, gMat, x, 0.4, halfL - 1.5));
  for (let i = 1; i <= 4; i++) { const sm = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), emMat(0xe6f8ff, 0x9ce9ff, 2.0)); sm.position.set(0, 0.7, halfL + i * 24); g.add(sm); ws.strobes.push(sm); }
  [-0.022, -0.008, 0.008, 0.022].forEach((off, i) => {
    const iw = i < 2; const pM = emMat(iw ? 0xfff8ea : 0xff3b30, iw ? 0xffefd0 : 0xff281c, 4.0);
    const h = box(3.4, 2.1, 1.8, slate, -(cfg.w * 0.5 + 6.5 + i * 4.2), 1.15, halfL - 52); h.add(box(2.75, 1.50, 0.55, pM, 0, 0, 0.85)); g.add(h); ws.papi[cfg.name].push({ mat: pM, offset: off });
  });
  scene.add(g);
}
