import * as THREE from 'three';
import { DEST_RUNWAY_X, WORLD_BOUNDS, canyonCenterX } from './world.js';

const BEST_SCORE_PREFIX = 'canyon_dawn_patrol_best_v3_';

export const SORTIE_MODES = Object.freeze([
  { id: 'dawn-run', title: 'Dawn Canyon Run', windSpeedKt: 2, windDirRad: Math.PI * 0.5, initialFuel: 100, scoreMultiplier: 1.0, gateRadius: 28, lowSkimMode: false, supplyDropMode: false, stormMode: false },
  { id: 'gorge-skim', title: 'River Gorge Skim', windSpeedKt: 9, windDirRad: Math.PI * 0.44, initialFuel: 92, scoreMultiplier: 1.35, gateRadius: 24, lowSkimMode: true, supplyDropMode: false, stormMode: false },
  { id: 'crosswind-express', title: 'Sunrise Crosswind', windSpeedKt: 18, windDirRad: Math.PI * 0.5, initialFuel: 82, scoreMultiplier: 1.6, gateRadius: 25, lowSkimMode: false, supplyDropMode: false, stormMode: false },
  { id: 'supply-drop', title: 'Canyon Supply Drop', windSpeedKt: 7, windDirRad: Math.PI * 0.47, initialFuel: 96, scoreMultiplier: 1.45, gateRadius: 27, lowSkimMode: false, supplyDropMode: true, stormMode: false },
  { id: 'storm-squall', title: 'Rain on the Gorge', windSpeedKt: 20, windDirRad: Math.PI * 0.48, initialFuel: 86, scoreMultiplier: 1.8, gateRadius: 25, lowSkimMode: false, supplyDropMode: false, stormMode: true },
]);

export const SUPPLY_BUOY_POS = new THREE.Vector3(canyonCenterX(-1790) + 18, 0.2, -1790);
export function readSortieBest(id) { try { return Number.parseInt(window.localStorage.getItem(BEST_SCORE_PREFIX + id) ?? '0', 10) || 0; } catch { return 0; } }
export function saveSortieBest(id, score) { try { if (score > readSortieBest(id)) { window.localStorage.setItem(BEST_SCORE_PREFIX + id, String(score)); return true; } } catch {} return false; }
export function computeSortieRank(score, landed, hull) { return !landed ? 'DNF' : score >= 4200 && hull >= 95 ? 'A+' : score >= 3400 ? 'S' : score >= 2500 ? 'A' : 'B'; }

function createBadgeTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(16, 16, 224, 96, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = fg; ctx.font = '900 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function createTargetRingMesh(radius, isBonus, isArch, badgeGold, badgeArch) {
  const col = isBonus ? 0xffcb45 : 0x4be8ff; const em = isBonus ? 0xff9f1a : 0x16b8f2; const gMesh = new THREE.Group();
  const mainMat = new THREE.MeshStandardMaterial({ color: col, emissive: em, emissiveIntensity: 1.9, roughness: 0.22, metalness: 0.45, transparent: true, opacity: 0.96 });
  gMesh.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.68, 12, 48), mainMat));
  const innerMat = new THREE.MeshBasicMaterial({ color: isBonus ? 0xfff0aa : 0xb5f5ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  gMesh.add(new THREE.Mesh(new THREE.RingGeometry(radius - 1.4, radius - 0.65, 40), innerMat));
  const spinGroup = new THREE.Group(); const arcMat = new THREE.MeshBasicMaterial({ color: isBonus ? 0xffe484 : 0x8cf4ff, transparent: true, opacity: 0.80 });
  for (let a = 0; a < 4; a++) { const arc = new THREE.Mesh(new THREE.TorusGeometry(radius + 1.5, 0.25, 6, 12, 0.45), arcMat); arc.rotation.z = (a * Math.PI) / 2; spinGroup.add(arc); }
  gMesh.add(spinGroup);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(2.0, 0), new THREE.MeshBasicMaterial({ color: isBonus ? 0xffd24d : 0x5ae6ff })); diamond.position.set(0, radius + 3.8, 0); gMesh.add(diamond);
  const tickMat = new THREE.MeshBasicMaterial({ color: isBonus ? 0xffe484 : 0x8cf4ff, transparent: true, opacity: 0.62 });
  for (let p = 0; p < 4; p++) { const a = (p * Math.PI) / 2; const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.2, 0.42), tickMat); t.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0); t.rotation.z = a + Math.PI / 2; gMesh.add(t); }
  if (isBonus || isArch) { const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: isBonus ? badgeGold : badgeArch, transparent: true, depthWrite: false })); b.position.set(0, radius - 4.2, 0); b.scale.set(11.5, 5.75, 1); gMesh.add(b); }
  return { gMesh, spinGroup, mainMat, innerMat };
}

/** Build and manage canyon target rings, arch gates, parachute relief drops & approach trace telemetry. */
export function createSortieMissionManager(scene) {
  const gateGroup = new THREE.Group(); scene.add(gateGroup);
  const badgeGold = createBadgeTexture('3x', 'rgba(42,26,6,0.90)', '#ffd85c'); const badgeArch = createBadgeTexture('ARCH', 'rgba(18,32,46,0.90)', '#6beaff');
  const approachGroup = new THREE.Group(); scene.add(approachGroup); const approachMarkers = [];
  for (let i = 0; i < 4; i++) {
    const chev = new THREE.Mesh(new THREE.TorusGeometry(13, 0.55, 6, 24, Math.PI), new THREE.MeshBasicMaterial({ color: 0x62f5a5, transparent: true, opacity: 0.34 }));
    chev.rotation.z = Math.PI; chev.position.set(DEST_RUNWAY_X, WORLD_BOUNDS.destRunwayElevation + 16 + i * 11.5, WORLD_BOUNDS.destRunwayZ + 260 + i * 160);
    approachGroup.add(chev); approachMarkers.push(chev);
  }
  approachGroup.visible = false;

  const buoyGroup = new THREE.Group(); buoyGroup.position.copy(SUPPLY_BUOY_POS);
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xff6229, emissive: 0xff4512, emissiveIntensity: 1.4, roughness: 0.4 });
  const buoyCore = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 4.5, 12), buoyMat); buoyCore.position.y = 2.2; buoyGroup.add(buoyCore);
  const buoyRing = new THREE.Mesh(new THREE.RingGeometry(48, 56, 36), new THREE.MeshBasicMaterial({ color: 0x62f5a5, transparent: true, opacity: 0.52, side: THREE.DoubleSide }));
  buoyRing.rotation.x = -Math.PI / 2; buoyRing.position.y = 0.6; buoyGroup.add(buoyRing);
  const buoyPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.2, 85, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x62f5a5, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }));
  buoyPillar.position.y = 43; buoyGroup.add(buoyPillar); buoyGroup.visible = false; scene.add(buoyGroup);
  const dropCrates = []; const crateGroup = new THREE.Group(); scene.add(crateGroup);

  const session = {
    mode: SORTIE_MODES[0], gates: [], activeIndex: 0, score: 0, elapsedSec: 0, lastFlightZ: 248, supplyDelivered: false, dropCooldown: 0,
    gateMissedBehind: false, lastBannerText: '', lastBannerBonus: false, bannerTimer: 0, isNewBest: false, approachTrace: [],
    events: { gateClearedThisStep: false, lastGateBonus: false, supplyDeliveredThisStep: false },
    setup(modeIndex) {
      this.mode = SORTIE_MODES[modeIndex] ?? SORTIE_MODES[0];
      this.activeIndex = 0; this.score = 0; this.elapsedSec = 0; this.lastFlightZ = WORLD_BOUNDS.startRunwayZ + 148;
      this.supplyDelivered = false; this.dropCooldown = 0; this.gateMissedBehind = false; this.bannerTimer = 0; this.lastBannerText = ''; this.isNewBest = false; this.approachTrace.length = 0;
      this.events.gateClearedThisStep = false; this.events.lastGateBonus = false; this.events.supplyDeliveredThisStep = false;
      approachGroup.visible = false; buoyGroup.visible = Boolean(this.mode.supplyDropMode); buoyMat.color.setHex(0xff6229); buoyMat.emissive.setHex(0xff4512);
      crateGroup.clear(); dropCrates.length = 0; gateGroup.clear(); this.gates.length = 0;
      const zPos = this.mode.supplyDropMode ? [-290, -640, -1010, -1380, -2160, -2560, -2960, -3380] : [-290, -610, -940, -1280, -1600, -1940, -2290, -2640, -3010, -3380];
      if (this.mode.lowSkimMode) zPos[5] = WORLD_BOUNDS.archZ;
      for (let i = 0; i < zPos.length; i++) {
        const z = zPos[i]; const cx = canyonCenterX(z); const isBonus = i === 4 || i === 7; const isArch = this.mode.lowSkimMode && i === 5;
        let y = this.mode.lowSkimMode ? 30 + Math.sin(i * 1.1) * 5 : 48 + Math.sin(i * 0.8) * 7;
        if (i === 0) y = 48; if (i === 3) y = 46; if (i === 4) y = 43; if (isArch) y = 42;
        const nZ = i + 1 < zPos.length ? zPos[i + 1] : WORLD_BOUNDS.destRunwayZ + 220; const nX = i + 1 < zPos.length ? canyonCenterX(nZ) : DEST_RUNWAY_X;
        const radius = isBonus ? this.mode.gateRadius + 2 : this.mode.gateRadius;
        const { gMesh, spinGroup, mainMat, innerMat } = createTargetRingMesh(radius, isBonus, isArch, badgeGold, badgeArch);
        gMesh.position.set(cx, y, z); gMesh.rotation.y = Math.atan2(cx - nX, z - nZ); gateGroup.add(gMesh);
        this.gates.push({ index: i, pos: new THREE.Vector3(cx, y, z), radius, isBonus, isArchGate: isArch, cleared: false, mesh: gMesh, spinGroup, mainMat, innerMat });
      }
      this.refreshGateVisibility();
    },
    isApproachReady() { return this.activeIndex >= this.gates.length && (!this.mode.supplyDropMode || this.supplyDelivered); },
    triggerSupplyDrop(flightState) {
      if (!flightState.airborne || this.dropCooldown > 0 || flightState.crashed) return false;
      this.dropCooldown = 1.2; const cg = new THREE.Group(); cg.position.copy(flightState.pos).add(new THREE.Vector3(0, -1.6, 0));
      cg.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.6), new THREE.MeshStandardMaterial({ color: 0xf4b63d, roughness: 0.6 })));
      const chute = new THREE.Mesh(new THREE.SphereGeometry(4.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0xff6229, side: THREE.DoubleSide, roughness: 0.7 })); chute.position.y = 6.2; cg.add(chute);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5.2, 4), new THREE.MeshBasicMaterial({ color: 0xe6eef5 })); cord.position.y = 3.2; cg.add(cord);
      crateGroup.add(cg); dropCrates.push({ mesh: cg, vel: flightState.vel.clone().multiplyScalar(0.24).setY(-14), landed: false }); return true;
    },
    refreshGateVisibility() {
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i]; if (g.cleared) { g.mesh.visible = false; continue; }
        const d = i - this.activeIndex; g.mesh.visible = d >= 0 && d <= 3;
        g.mainMat.opacity = d === 0 ? 0.98 : d === 1 ? 0.62 : 0.32; g.mainMat.emissiveIntensity = d === 0 ? 1.95 : d === 1 ? 1.05 : 0.55;
        g.innerMat.opacity = d === 0 ? 0.42 : d === 1 ? 0.22 : 0.1;
      }
      approachGroup.visible = this.isApproachReady();
    },
    getActiveTarget() {
      const dropInFlight = dropCrates.some((c) => !c.landed); const beforeBuoy = this.lastFlightZ >= SUPPLY_BUOY_POS.z - 35;
      if (this.mode.supplyDropMode && !this.supplyDelivered && !dropInFlight && ((this.activeIndex === 4 && beforeBuoy) || this.activeIndex >= this.gates.length)) return { type: 'buoy', label: 'SUPPLY BUOY · [V] DROP', pos: SUPPLY_BUOY_POS.clone().setY(18) };
      if (this.activeIndex < this.gates.length) { const g = this.gates[this.activeIndex]; return { type: 'gate', label: g.isBonus ? `RING ${String(g.index + 1).padStart(2, '0')} (3x)` : g.isArchGate ? `ARCH GATE ${String(g.index + 1).padStart(2, '0')}` : `GATE ${String(g.index + 1).padStart(2, '0')}`, pos: g.pos }; }
      const past = this.lastFlightZ < WORLD_BOUNDS.destRunwayZ + 195;
      return { type: 'runway', label: past ? 'RWY 36 ROLLOUT' : 'RWY 36 APPROACH', pos: new THREE.Vector3(DEST_RUNWAY_X, WORLD_BOUNDS.destRunwayElevation + (past ? 1.5 : 6), past ? WORLD_BOUNDS.destRunwayZ - 140 : WORLD_BOUNDS.destRunwayZ + 170) };
    },
    update(flightState, dt, elapsedTotal) {
      this.events.gateClearedThisStep = false; this.events.lastGateBonus = false; this.events.supplyDeliveredThisStep = false;
      if (flightState.crashed || flightState.landedComplete) return;
      this.lastFlightZ = flightState.pos.z; this.elapsedSec += dt; if (this.dropCooldown > 0) this.dropCooldown = Math.max(0, this.dropCooldown - dt); if (this.bannerTimer > 0) this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      const distThr = flightState.pos.z - (WORLD_BOUNDS.destRunwayZ + 173);
      if (this.isApproachReady() && distThr <= 680 && distThr >= -120 && (this.approachTrace.length === 0 || Math.abs(this.approachTrace[this.approachTrace.length - 1].d - distThr) > 18)) this.approachTrace.push({ d: distThr, aglFt: flightState.altitudeAglFt });
      for (const c of dropCrates) {
        if (c.landed) continue; c.vel.x *= Math.exp(-3.5 * dt); c.vel.z *= Math.exp(-3.5 * dt); c.vel.y = THREE.MathUtils.lerp(c.vel.y, -22.0, Math.min(1, dt * 4.5)); c.mesh.position.addScaledVector(c.vel, dt);
        if (c.mesh.position.y <= 3.5) {
          c.mesh.position.y = 1.2; c.landed = true; const dB = Math.hypot(c.mesh.position.x - SUPPLY_BUOY_POS.x, c.mesh.position.z - SUPPLY_BUOY_POS.z);
          if (this.mode.supplyDropMode && !this.supplyDelivered && dB < 165) { this.supplyDelivered = true; this.events.supplyDeliveredThisStep = true; const b = Math.round(1000 * this.mode.scoreMultiplier); this.score += b; buoyMat.color.setHex(0x5ae6a0); buoyMat.emissive.setHex(0x2cd47d); this.lastBannerText = `SUPPLY DROP DELIVERED +${b}`; this.lastBannerBonus = true; this.bannerTimer = 3.0; this.refreshGateVisibility(); }
          else if (this.mode.supplyDropMode && !this.supplyDelivered) { this.lastBannerText = `MISSED BUOY (${Math.round(dB)}M) — DROP [V] CLOSER`; this.lastBannerBonus = false; this.bannerTimer = 2.4; }
        }
      }
      if (this.mode.supplyDropMode && !this.supplyDelivered) buoyRing.scale.setScalar(1 + 0.06 * Math.sin(elapsedTotal * 4));
      this.gateMissedBehind = false;
      if (this.activeIndex < this.gates.length) {
        const g = this.gates[this.activeIndex]; g.mainMat.emissiveIntensity = 1.7 + 0.55 * Math.sin(elapsedTotal * 5.2); g.spinGroup.rotation.z = elapsedTotal * 0.9;
        this.gateMissedBehind = flightState.pos.z < g.pos.z - 120; const dist = flightState.pos.distanceTo(g.pos);
        if (dist <= g.radius + 6.5 && Math.abs(flightState.pos.z - g.pos.z) < 22) {
          g.cleared = true; this.activeIndex++; this.events.gateClearedThisStep = true; this.events.lastGateBonus = g.isBonus || g.isArchGate;
          const bull = dist < g.radius * 0.44;
          const pts = Math.round(((g.isBonus ? 600 : g.isArchGate ? 450 : 200) + (bull ? 150 : 0) + (this.mode.lowSkimMode && flightState.altitudeAglFt < 145 ? 150 : 0)) * this.mode.scoreMultiplier);
          this.score += pts; this.lastBannerText = g.isBonus ? `3x BONUS RING +${pts}` : g.isArchGate ? `ROCK ARCH THREADED +${pts}` : bull ? `BULLSEYE CENTER +${pts}` : `GATE ${g.index + 1}/${this.gates.length} +${pts}`;
          this.lastBannerBonus = true; this.bannerTimer = 2.1; this.refreshGateVisibility();
        }
      } else for (let i = 0; i < approachMarkers.length; i++) approachMarkers[i].material.opacity = 0.22 + 0.16 * Math.sin(elapsedTotal * 4.5 - i * 0.9);
      if (flightState.events.touchdownThisStep && flightState.onDestRunway && flightState.hull > 0) {
        const touchBonus = flightState.touchdownVsiFpm > -240 ? 900 : flightState.touchdownVsiFpm > -460 ? 600 : 350;
        const totalPts = Math.round((touchBonus + flightState.fuel * 8) * this.mode.scoreMultiplier); this.score += totalPts;
        this.lastBannerText = `${flightState.touchdownQuality} +${totalPts}`; this.lastBannerBonus = true; this.bannerTimer = 3.0;
      }
      if (flightState.landedComplete) this.isNewBest = saveSortieBest(this.mode.id, this.score);
    },
  };
  session.setup(0); return session;
}
