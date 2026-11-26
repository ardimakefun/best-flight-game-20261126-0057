import * as THREE from 'three';
import { SORTIE_MODES, SUPPLY_BUOY_POS, computeSortieRank, readSortieBest } from './missions.js';
import { DEST_RUNWAY_X, WORLD_BOUNDS, canyonCenterX } from './world.js';

const CR_KEY = 'canyon_dawn_patrol_cr_v3';
const BRIEFS = [
  'Thread ten illuminated gates down Red Rock Gorge, skim past the stone viaduct, and touch down cleanly on Outpost Runway 36.',
  'Hug the emerald river bends at low altitude and thread the ancient 3D red-rock natural arch in a steady 9 KT breeze.',
  'Maintain tight fuel economy through 18 KT crosswind shears along the gorge ridge before crab-landing into Runway 36.',
  'Fly mid-canyon and release a parachute relief crate [V] directly onto the orange river supply buoy, then recover north.',
  'Navigate dark storm squalls and 20 KT ridge gusts under canopy rain using your PAPI lights and cockpit MFD ILS crosshairs.',
];

function loadCredits() {
  try { const v = Number.parseInt(window.localStorage.getItem(CR_KEY) ?? '', 10); return Number.isFinite(v) ? v : 680; } catch { return 680; }
}
function saveCredits(v) {
  try { window.localStorage.setItem(CR_KEY, String(Math.max(0, Math.round(v)))); } catch { /* ignore */ }
}

/** Manage editorial HUD, circular RNAV radar, artificial horizon, Station ledger credits & Touchdown trace graph. */
export function createAviationHud() {
  const $ = (id) => document.getElementById(id);
  const hudEl = $('hud'); const topEl = $('top-strip'); const startEl = $('start-screen'); const fleetEl = $('fleet-caption'); const ledgerEl = $('station-ledger'); const pauseEl = $('pause-screen'); const debriefEl = $('debrief-screen');
  const statusEl = $('status'); const flightStatusEl = $('flight-status'); const fpvEl = $('fpv-marker'); const ilsEl = $('ils-box'); const ilsLocEl = $('ils-loc'); const ilsGsEl = $('ils-gs');
  const streaksEl = $('speed-streaks'); const yokeIndEl = $('yoke-indicator'); const gatePillEl = $('gate-pill'); const gateTxtEl = $('gate-pill-text');
  const sortieNumEl = $('sortie-num'); const titleEl = $('mission-title'); const objEl = $('mission-obj'); const fillEl = $('mission-fill');
  const timeEl = $('hud-time'); const scoreEl = $('hud-score'); const loggedEl = $('dispatch-logged'); const briefEl = $('sortie-brief');
  const windCardEl = $('wind-card'); const windMainEl = $('wind-main'); const windBadgeEl = $('wind-badge'); const alertEl = $('alert-banner');
  const spdEl = $('dial-spd'); const altEl = $('dial-alt'); const vsiEl = $('dial-vsi'); const hdgEl = $('dial-hdg'); const brgEl = $('dial-brg');
  const thrEl = $('val-thr'); const fuelEl = $('val-fuel'); const hullEl = $('val-hull'); const gatesEl = $('radar-gates'); const modeEl = $('telem-mode');
  const flapsCh = $('flaps-chip'); const brkCh = $('brk-chip'); const trimCh = $('trim-chip'); const gearCh = $('gear-chip');
  const camP = $('cam-pill'); const flapsP = $('flaps-pill'); const dropP = $('drop-pill'); const trimP = $('trim-pill'); const audioP = $('audio-pill');
  const hdgCtx = $('hdg-canvas').getContext('2d'); const ahCtx = $('ah-canvas').getContext('2d'); const mapCtx = $('map-canvas').getContext('2d'); const traceCtx = $('trace-canvas').getContext('2d');
  const dTitleEl = $('debrief-title'); const dRankEl = $('debrief-rank'); const dSubEl = $('debrief-sub'); const dTagEl = $('deb-status-tag');
  const dScoreEl = $('deb-score'); const dVsiEl = $('deb-vsi'); const dOffEl = $('deb-offset'); const dThrEl = $('deb-thr');
  const dFuelEl = $('deb-fuel'); const dHullEl = $('deb-hull'); const dGatesEl = $('deb-gates-info'); const dCrEl = $('deb-cr-earned');
  const lFuelEl = $('ledger-fuel'); const lHullEl = $('ledger-hull'); const lCrEl = $('ledger-cr');
  const refuelBtn = $('refuel-btn'); const repairBtn = $('repair-btn'); const invertBtn = $('invert-btn'); const yokeBtn = $('yoke-btn');

  let credits = loadCredits(); let lastFuelPct = 100; let lastHullPct = 100; let queuedFuelBonus = 0; let currentSortieIdx = 0;
  const fmtClk = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s * 10) % 10)}`;
  const ln = (c, x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };

  function syncLedgerDom() {
    const base = SORTIE_MODES[currentSortieIdx]?.initialFuel ?? 100;
    const fuel = startEl.classList.contains('hidden') ? lastFuelPct : Math.min(100, base + queuedFuelBonus);
    lFuelEl.textContent = `${Math.round(fuel)}%`; lHullEl.textContent = `${Math.round(lastHullPct)}%`; lCrEl.textContent = credits.toLocaleString('en-US');
    refuelBtn.disabled = credits < 120 || fuel >= 100; repairBtn.disabled = credits < 90 || lastHullPct >= 100;
  }

  function drawHdg(hdg, brg) {
    const w = 320; const h = 28; const px = 3.1; const c = 160; hdgCtx.clearRect(0, 0, w, h); hdgCtx.font = 'bold 10px Consolas, monospace'; hdgCtx.textAlign = 'center';
    for (let d = Math.floor((hdg - 52) / 5) * 5; d <= hdg + 52; d += 5) {
      const x = c + (d - hdg) * px; if (x < 6 || x > w - 6) continue; const maj = d % 10 === 0;
      hdgCtx.strokeStyle = maj ? 'rgba(241,245,248,.85)' : 'rgba(155,176,192,.45)'; hdgCtx.lineWidth = maj ? 1.4 : 1; ln(hdgCtx, x, h - 2, x, h - (maj ? 10 : 6));
      if (maj) { const n = ((d % 360) + 360) % 360; hdgCtx.fillStyle = n % 90 === 0 ? '#ffd978' : '#e0ebf2'; hdgCtx.fillText(String(n).padStart(3, '0'), x, 11); }
    }
    const bx = THREE.MathUtils.clamp(c + (((brg - hdg + 540) % 360) - 180) * px, 12, w - 12);
    hdgCtx.fillStyle = '#f4b63d'; hdgCtx.beginPath(); hdgCtx.moveTo(bx, h - 13); hdgCtx.lineTo(bx + 4, h - 7); hdgCtx.lineTo(bx, h - 1); hdgCtx.lineTo(bx - 4, h - 7); hdgCtx.closePath(); hdgCtx.fill();
  }

  function drawAH(pitch, roll) {
    const r = 28; ahCtx.clearRect(0, 0, 56, 56); ahCtx.save(); ahCtx.beginPath(); ahCtx.arc(r, r, r - 1, 0, Math.PI * 2); ahCtx.clip(); ahCtx.translate(r, r);
    ahCtx.rotate(-THREE.MathUtils.degToRad(roll)); const py = pitch * 0.85;
    ahCtx.fillStyle = '#3b7399'; ahCtx.fillRect(-60, -60 + py, 120, 60); ahCtx.fillStyle = '#7e5534'; ahCtx.fillRect(-60, py, 120, 60);
    ahCtx.strokeStyle = '#fff'; ahCtx.lineWidth = 1.5; ln(ahCtx, -48, py, 48, py); ahCtx.restore();
    ahCtx.strokeStyle = '#ffd978'; ahCtx.lineWidth = 2; ln(ahCtx, r - 12, r, r - 4, r); ln(ahCtx, r + 12, r, r + 4, r);
    ahCtx.fillStyle = '#ffd978'; ahCtx.fillRect(r - 1.5, r - 1.5, 3, 3);
  }

  function drawRadar(st, mission, target) {
    const s = 134; const r = 67; const ctx = mapCtx; ctx.clearRect(0, 0, s, s); ctx.save();
    ctx.beginPath(); ctx.arc(r, r, r - 2, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#11222b'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(155,195,210,.16)'; ctx.lineWidth = 1;
    for (const rad of [24, 46]) { ctx.beginPath(); ctx.arc(r, r, rad, 0, Math.PI * 2); ctx.stroke(); }
    ln(ctx, r, 4, r, s - 4); ln(ctx, 4, r, s - 4, r);
    const sc = 0.048; const tx = (wx) => r + (wx - st.pos.x) * sc; const ty = (wz) => r + 14 + (wz - st.pos.z) * sc;
    ctx.beginPath();
    for (let i = -18; i <= 18; i++) { const wz = st.pos.z + i * 115; i === -18 ? ctx.moveTo(tx(canyonCenterX(wz) - 60), ty(wz)) : ctx.lineTo(tx(canyonCenterX(wz) - 60), ty(wz)); }
    for (let i = 18; i >= -18; i--) { const wz = st.pos.z + i * 115; ctx.lineTo(tx(canyonCenterX(wz) + 60), ty(wz)); }
    ctx.closePath(); ctx.fillStyle = 'rgba(42,108,128,.45)'; ctx.fill();
    ctx.strokeStyle = '#9db4c4'; ctx.lineWidth = 2.5; ln(ctx, tx(0), ty(WORLD_BOUNDS.startRunwayZ + 170), tx(0), ty(WORLD_BOUNDS.startRunwayZ - 170));
    ln(ctx, tx(DEST_RUNWAY_X), ty(WORLD_BOUNDS.destRunwayZ + 200), tx(DEST_RUNWAY_X), ty(WORLD_BOUNDS.destRunwayZ - 200));
    ctx.strokeStyle = 'rgba(244,182,61,.52)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ln(ctx, r, r + 14, tx(target.pos.x), ty(target.pos.z)); ctx.setLineDash([]);
    for (let i = mission.activeIndex; i < mission.gates.length; i++) {
      const g = mission.gates[i]; ctx.beginPath(); ctx.arc(tx(g.pos.x), ty(g.pos.z), i === mission.activeIndex ? 3.8 : 2.1, 0, Math.PI * 2);
      ctx.fillStyle = i === mission.activeIndex ? '#ffd978' : '#6ee2ff'; ctx.fill();
    }
    if (mission.mode.supplyDropMode && !mission.supplyDelivered) { ctx.fillStyle = '#6be6aa'; ctx.fillRect(tx(SUPPLY_BUOY_POS.x) - 3, ty(SUPPLY_BUOY_POS.z) - 3, 6, 6); }
    ctx.save(); ctx.translate(r, r + 14); ctx.rotate(THREE.MathUtils.degToRad(st.headingDeg));
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-15, -34); ctx.lineTo(15, -34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd978'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 4.5); ctx.lineTo(-4, 4.5); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.restore();
  }

  function drawTrace(trace) {
    const w = 356; const h = 114; const ctx = traceCtx; ctx.fillStyle = 'rgba(13,22,29,.88)'; ctx.fillRect(0, 0, w, h);
    const pL = 34; const pR = 14; const pT = 12; const gw = w - pL - pR; const gh = h - 32;
    const toX = (d) => pL + ((650 - d) / 835) * gw; const maxFt = Math.max(185, ...trace.map((p) => p.aglFt + 20));
    const toY = (ft) => pT + gh - (THREE.MathUtils.clamp(ft, 0, maxFt) / maxFt) * gh; const xThr = toX(0);
    ctx.fillStyle = 'rgba(107,230,170,.08)'; ctx.fillRect(xThr, pT, pL + gw - xThr, gh);
    ctx.strokeStyle = 'rgba(186,208,224,.12)'; ctx.lineWidth = 1; ctx.font = '10px Consolas, monospace'; ctx.fillStyle = '#8fa4b4'; ctx.textAlign = 'right';
    for (let k = 0; k <= 3; k++) { const ft = Math.round((maxFt / 3) * k); const y = toY(ft); ln(ctx, pL, y, w - pR, y); ctx.fillText(String(ft), pL - 5, y + 3); }
    ctx.strokeStyle = 'rgba(255,217,120,.45)'; ctx.setLineDash([3, 3]); ln(ctx, xThr, pT, xThr, pT + gh); ctx.setLineDash([]);
    ctx.fillStyle = '#8fa4b4'; ctx.textAlign = 'left'; ctx.fillText('650 M', pL, h - 5); ctx.textAlign = 'center'; ctx.fillText('THR', xThr, h - 5); ctx.textAlign = 'right'; ctx.fillText('CONTACT', w - pR, h - 5);
    ctx.strokeStyle = 'rgba(244,182,61,.72)'; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(toX(650), toY(140)); ctx.lineTo(xThr, toY(6)); ctx.lineTo(toX(-80), toY(0)); ctx.stroke(); ctx.setLineDash([]);
    if (trace.length >= 2) {
      ctx.strokeStyle = '#6be6aa'; ctx.lineWidth = 2.2; ctx.beginPath(); trace.forEach((p, idx) => { const x = toX(p.d); const y = toY(p.aglFt); idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke(); const last = trace[trace.length - 1]; ctx.fillStyle = '#ffd978'; ctx.beginPath(); ctx.arc(toX(last.d), toY(last.aglFt), 3.2, 0, Math.PI * 2); ctx.fill();
    } else { ctx.fillStyle = '#8fa4b4'; ctx.textAlign = 'center'; ctx.fillText('NO APPROACH TRACE LOGGED', pL + gw * 0.5, pT + gh * 0.52); }
  }

  const tmpVec = new THREE.Vector3(); let mapFrame = 0;

  return {
    announce(msg) { statusEl.textContent = msg; },
    consumeQueuedFuel() { const b = queuedFuelBonus; queuedFuelBonus = 0; return b; },
    tryRefuel() {
      const baseFuel = startEl.classList.contains('hidden') ? lastFuelPct : Math.min(100, (SORTIE_MODES[currentSortieIdx]?.initialFuel ?? 100) + queuedFuelBonus);
      if (credits < 120 || baseFuel >= 100) return false;
      credits -= 120; saveCredits(credits);
      if (!startEl.classList.contains('hidden')) queuedFuelBonus = Math.min(100 - (SORTIE_MODES[currentSortieIdx]?.initialFuel ?? 100), queuedFuelBonus + 8);
      else lastFuelPct = Math.min(100, lastFuelPct + 12);
      syncLedgerDom(); return true;
    },
    tryRepair() {
      if (credits < 90 || lastHullPct >= 100) return false;
      credits -= 90; saveCredits(credits); lastHullPct = 100; dHullEl.textContent = '100%'; syncLedgerDom(); return true;
    },
    refreshBestScores() {
      let logged = 0;
      document.querySelectorAll('.sortie-best').forEach((el) => {
        const mode = SORTIE_MODES[Number.parseInt(el.dataset.best ?? '0', 10)];
        const best = mode ? readSortieBest(mode.id) : 0; if (best > 0) logged++;
        el.textContent = best > 0 ? `BEST ${best}` : 'READY';
      });
      loggedEl.textContent = `${String(logged).padStart(2, '0')} / 0${SORTIE_MODES.length} LOGGED`;
    },
    setScreen(screen) {
      const menu = screen === 'start' || screen === 'debrief';
      topEl.classList.toggle('hidden', !menu); ledgerEl.classList.toggle('hidden', !menu);
      fleetEl.classList.toggle('hidden', screen !== 'start'); startEl.classList.toggle('hidden', screen !== 'start');
      hudEl.classList.toggle('hidden', menu); pauseEl.classList.toggle('hidden', screen !== 'paused'); debriefEl.classList.toggle('hidden', screen !== 'debrief');
      if (screen !== 'playing') { alertEl.className = ''; fpvEl.style.display = 'none'; ilsEl.style.display = 'none'; gatePillEl.style.display = 'none'; streaksEl.style.opacity = '0'; }
      if (screen === 'start') { flightStatusEl.textContent = '• ON STATION'; lastHullPct = 100; syncLedgerDom(); this.refreshBestScores(); }
    },
    setSelectedSortie(idx) {
      currentSortieIdx = idx; queuedFuelBonus = 0;
      document.querySelectorAll('.sortie-card').forEach((c, i) => c.classList.toggle('selected', i === idx));
      briefEl.textContent = BRIEFS[idx] ?? BRIEFS[0];
      syncLedgerDom();
    },
    updateOptionsButtons(inv, yoke) { invertBtn.textContent = `Invert Y: ${inv ? 'ON' : 'OFF'} [I]`; yokeBtn.textContent = `Mouse Yoke: ${yoke ? 'ON' : 'OFF'} [G]`; },
    setMuted(m) { audioP.classList.toggle('muted', m); },
    showDebrief(st, mission) {
      const ok = st.landedComplete;
      flightStatusEl.textContent = ok ? '• ON STATION' : '• MAYDAY';
      dTitleEl.textContent = ok ? 'Touchdown.' : 'Aircraft lost.'; dTitleEl.classList.toggle('crash', !ok);
      dRankEl.textContent = computeSortieRank(mission.score, ok, st.hull);
      dTagEl.textContent = ok ? `RWY 36 · ${st.touchdownQuality.toUpperCase()}` : 'AIRFRAME IMPACT';
      dSubEl.textContent = ok ? `${st.touchdownQuality} · ${mission.mode.title}` : st.crashReason;
      dScoreEl.textContent = `${mission.score.toLocaleString('en-US')}${mission.isNewBest ? ' ★' : ''}`;
      dVsiEl.textContent = ok ? `${st.touchdownVsiFpm}` : 'IMPACT';
      const offAbs = Math.abs(st.touchdownSignedOffsetM || 0).toFixed(1);
      dOffEl.textContent = ok ? `${offAbs} ${st.touchdownSignedOffsetM < -0.1 ? 'L' : st.touchdownSignedOffsetM > 0.1 ? 'R' : 'C'}` : '—';
      dThrEl.textContent = ok ? `${st.touchdownThresholdM >= 0 ? '+' : ''}${st.touchdownThresholdM}` : '—';
      lastFuelPct = Math.round(st.fuel); lastHullPct = Math.round(st.hull);
      dFuelEl.textContent = `${lastFuelPct}%`; dHullEl.textContent = `${lastHullPct}%`;
      dGatesEl.textContent = `${mission.activeIndex} / ${mission.gates.length} GATES · ${mission.mode.scoreMultiplier}x`;
      const crEarned = Math.round(mission.score * (ok ? 0.16 : 0.05));
      credits += crEarned; saveCredits(credits); dCrEl.textContent = `+${crEarned} CR`;
      syncLedgerDom(); drawTrace(mission.approachTrace);
    },
    update(st, mission, isCockpit, cam, yokeSt, sortieIdx = 0) {
      hudEl.classList.toggle('cockpit-mode', isCockpit);
      const t = mission.getActiveTarget(); const dM = Math.round(st.pos.distanceTo(t.pos));
      const brg = Math.round(((THREE.MathUtils.radToDeg(Math.atan2(t.pos.x - st.pos.x, -(t.pos.z - st.pos.z))) % 360) + 360) % 360);
      flightStatusEl.textContent = !st.airborne ? (st.onDestRunway ? 'TOUCHDOWN' : 'TAXI / ROLL') : t.type === 'runway' ? 'FINAL APP' : 'AIRBORNE';
      sortieNumEl.textContent = `0${sortieIdx + 1} / 0${SORTIE_MODES.length}`; titleEl.textContent = mission.mode.title;
      objEl.textContent = t.type === 'buoy' ? `BUOY DROP [V] · ${dM} M` : t.type === 'runway' ? `RWY 36 · ${dM} M` : `${t.label} · ${dM} M`;
      fillEl.style.width = `${((mission.activeIndex + (mission.supplyDelivered ? 1 : 0)) / (mission.gates.length + (mission.mode.supplyDropMode ? 1 : 0))) * 100}%`;
      timeEl.textContent = fmtClk(mission.elapsedSec); scoreEl.textContent = `PTS ${mission.score.toLocaleString('en-US')}`;
      gatesEl.innerHTML = `${mission.activeIndex} <small>/ ${mission.gates.length} gates</small>`;
      brgEl.textContent = `${t.type === 'runway' ? 'RWY 36' : 'WPT'} · BRG ${String(brg).padStart(3, '0')}°`;

      const wKt = Math.round(st.windSpeedKt); windCardEl.classList.toggle('crosswind', wKt >= 12 || mission.mode.stormMode);
      windMainEl.textContent = mission.mode.stormMode ? 'SQUALL LINE' : wKt >= 12 ? 'RIDGE GUST' : 'GOLDEN HOUR';
      windBadgeEl.textContent = `WIND ${String(wKt).padStart(2, '0')} KT / ${mission.mode.stormMode ? 'IFR' : 'CANYON'}`;
      hdgEl.textContent = `${String(Math.round(st.headingDeg) % 360).padStart(3, '0')}°`; drawHdg(st.headingDeg, brg);
      spdEl.textContent = String(Math.round(st.airspeedKt)).padStart(3, '0'); altEl.textContent = String(Math.round(st.altitudeFt));
      const vsiR = Math.round(st.vsiFpm / 10) * 10; vsiEl.textContent = `${vsiR >= 0 ? '+' : ''}${vsiR}`;
      modeEl.textContent = `${st.autoLevel ? 'AUTO LEVEL' : 'HAND FLOWN'} · ${mission.mode.scoreMultiplier}x`;
      thrEl.textContent = `${Math.round(st.throttle * 100)}%`; fuelEl.textContent = `${Math.round(st.fuel)}%`; fuelEl.className = st.lowFuelWarning ? 'warn' : '';
      hullEl.textContent = `${Math.round(st.hull)}%`; hullEl.className = st.hull <= 45 ? 'warn' : '';

      flapsCh.textContent = st.flapsDeployed ? 'FLP DN' : 'F0°'; flapsCh.className = st.flapsDeployed ? 'on' : '';
      brkCh.className = st.brakesActive ? 'on' : ''; trimCh.textContent = st.autoLevel ? 'LVL ON' : 'LVL'; trimCh.className = st.autoLevel ? 'on' : '';
      const gDn = !st.airborne || st.flapsDeployed || st.altitudeAglFt < 28; gearCh.textContent = gDn ? 'GEAR DN' : 'GEAR UP'; gearCh.className = gDn ? 'on' : '';
      camP.classList.toggle('active', isCockpit); flapsP.classList.toggle('active', st.flapsDeployed);
      dropP.classList.toggle('active', Boolean(mission.mode.supplyDropMode && !mission.supplyDelivered)); trimP.classList.toggle('active', Boolean(st.autoLevel));
      streaksEl.style.opacity = st.airborne && st.airspeedKt > 135 ? String(THREE.MathUtils.clamp((st.airspeedKt - 135) / 45, 0, 1)) : '0';

      if (!isCockpit && st.approachActive && t.type === 'runway' && dM < 1100) { ilsEl.style.display = 'block'; ilsLocEl.style.left = `${50 + THREE.MathUtils.clamp(st.locDev, -1, 1) * 44}%`; ilsGsEl.style.top = `${50 + THREE.MathUtils.clamp(st.gsDev, -1, 1) * 44}%`; }
      else ilsEl.style.display = 'none';
      if (!isCockpit && (++mapFrame % 2 === 0 || st.forcePanelRedraw)) { drawAH(st.pitchDeg, st.rollDeg); drawRadar(st, mission, t); }

      const showProj = (el, vec, ok) => { if (ok && vec.z < 1 && Math.abs(vec.x) < 0.86 && Math.abs(vec.y) < 0.76) { el.style.display = 'block'; el.style.left = `${(vec.x * 0.5 + 0.5) * window.innerWidth}px`; el.style.top = `${(-vec.y * 0.5 + 0.5) * window.innerHeight}px`; return true; } el.style.display = 'none'; return false; };
      if (cam && st.airborne && st.airspeedKt > 35) showProj(fpvEl, tmpVec.copy(st.vel).normalize().multiplyScalar(220).add(st.pos).project(cam), true); else fpvEl.style.display = 'none';
      if (!isCockpit && cam && t && showProj(gatePillEl, tmpVec.set(t.pos.x, t.pos.y + (t.type === 'gate' ? -30 : 2), t.pos.z).project(cam), true)) gateTxtEl.textContent = `${t.label} · ${dM} M`; else gatePillEl.style.display = 'none';

      if (yokeSt?.enabled) { yokeIndEl.style.display = 'block'; yokeIndEl.style.left = `${(0.5 + yokeSt.x * 0.25) * window.innerWidth}px`; yokeIndEl.style.top = `${(0.5 + yokeSt.y * 0.25) * window.innerHeight}px`; } else yokeIndEl.style.display = 'none';

      const msg = st.terrainWarning ? ['TERRAIN — PULL UP NOW', 0] : st.stallWarning ? ['STALL WARNING — LOWER NOSE / ADD THROTTLE', 0]
        : st.overheatWarning ? ['ENGINE OVERHEAT — REDUCE THROTTLE', 0] : st.lowFuelWarning ? ['LOW FUEL — THROTTLE BACK FOR CRUISE', 0]
        : mission.gateMissedBehind ? ['GATE BEHIND — BANK AROUND TO RE-ENTER', 0]
        : t.type === 'buoy' && dM < 340 && st.airborne ? ['SUPPLY ZONE AHEAD — PRESS [V] TO DROP CARGO', 1]
        : st.inThermal ? ['CANYON THERMAL UPDRAFT — GAINING LIFT', 1]
        : mission.bannerTimer > 0 && mission.lastBannerText ? [mission.lastBannerText, mission.lastBannerBonus]
        : t.type === 'runway' && dM < 850 && st.airborne ? ['FINAL APPROACH RWY 36 — FLAPS [F] & FLARE', 1] : null;
      alertEl.textContent = msg ? msg[0] : ''; alertEl.className = msg ? (msg[1] ? 'visible bonus' : 'visible') : '';
    },
  };
}
