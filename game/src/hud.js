// Lit cockpit instrument HUD, tactical flight strip, target brackets, and start/pause/end screens.

import { MISSIONS, PALETTE, VIEW, WORLD_BOUNDS } from './config.js';
import { clamp, projectWorld } from './math3d.js';
import { canyonCenterX, terrainHeight } from './terrain.js';
import { SCREEN_CRASH, SCREEN_FAIL, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './world.js';

function formatTime(sec) {
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const tenths = Math.floor((sec * 10) % 10);
  return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

export function drawHUD(ctx, world, cam) {
  const s = world.state;
  const p = s.plane;

  if (s.alertFlash > 0) {
    ctx.fillStyle = `rgba(255, 56, 36, ${s.alertFlash * 0.28})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  if (s.winFlash > 0) {
    ctx.fillStyle = `rgba(92, 242, 156, ${s.winFlash * 0.16})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  if (s.screen === SCREEN_PLAY || s.screen === SCREEN_TITLE || s.screen === SCREEN_PAUSED) {
    drawTargetLocator(ctx, s, cam);
  }

  drawTopStrip(ctx, s);

  if (s.bannerTimer > 0 && s.screen === SCREEN_PLAY) {
    const a = clamp(s.bannerTimer * 1.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(12, 10, 18, 0.76)';
    ctx.strokeStyle = s.bannerColor;
    ctx.lineWidth = 1.5;
    const bw = Math.min(780, Math.max(400, s.bannerText.length * 9.5 + 48));
    const bx = (VIEW.width - bw) * 0.5;
    roundRect(ctx, bx, 62, bw, 32, 8);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = s.bannerColor;
    ctx.textAlign = 'center';
    ctx.fillText(s.bannerText, VIEW.width * 0.5, 83);
    ctx.restore();
  }

  drawInstrumentDeck(ctx, s, p);

  if (s.screen === SCREEN_TITLE) {
    drawTitleHeader(ctx, s);
  } else if (s.screen === SCREEN_PAUSED) {
    drawPauseCard(ctx);
  } else if (s.screen === SCREEN_CRASH) {
    drawCrashCard(ctx, s);
  } else if (s.screen === SCREEN_WIN || s.screen === SCREEN_FAIL) {
    drawEndCard(ctx, s, s.screen === SCREEN_WIN);
  }
}

function drawTopStrip(ctx, s) {
  const mission = MISSIONS[s.missionIndex];
  ctx.save();
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.fillRect(0, 0, VIEW.width, 44);
  ctx.fillStyle = 'rgba(255, 190, 77, 0.35)';
  ctx.fillRect(0, 43, VIEW.width, 1.5);

  ctx.font = 'bold 14px monospace';
  const activeRing = s.rings.find((r) => !r.passed && !r.missed);
  ctx.fillStyle = activeRing?.isBonus && !s.clearedToLand && !s.plane.onGround ? '#ffd700' : PALETTE.hudAmber;
  ctx.textAlign = 'left';
  const phase = s.screen === SCREEN_WIN
    ? 'SORTIE COMPLETE • DESERT RUNWAY'
    : s.clearedToLand
      ? 'FINAL APPROACH • LAND ON RUNWAY'
      : s.plane.onGround
        ? 'DEPARTURE STRIP • TAKE OFF'
        : activeRing?.isBonus
          ? `★ BONUS GATE (3X) • ${Math.min(s.ringsPassed + s.ringsMissed + 1, WORLD_BOUNDS.ringCount)}/${WORLD_BOUNDS.ringCount}`
          : `GATE ${Math.min(s.ringsPassed + s.ringsMissed + 1, WORLD_BOUNDS.ringCount)} OF ${WORLD_BOUNDS.ringCount}`;
  ctx.fillText(`${mission.name.toUpperCase()}  |  ${phase}`, 20, 27);

  const startX = VIEW.width * 0.5 - 120;
  for (let i = 0; i < s.rings.length; i += 1) {
    const r = s.rings[i];
    const px = startX + i * 26;
    const py = 22;
    ctx.beginPath();
    ctx.arc(px, py, r.isBonus ? 8.8 : 7.5, 0, Math.PI * 2);
    if (r.passed) {
      ctx.fillStyle = PALETTE.hudGreen;
      ctx.fill();
    } else if (r.missed) {
      ctx.fillStyle = PALETTE.hudRed;
      ctx.fill();
    } else if (r.isBonus) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.34)';
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255, 190, 77, 0.16)';
      ctx.fill();
      ctx.strokeStyle = PALETTE.hudAmber;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  if (mission.crosswind > 0) {
    const windKt = Math.round(mission.crosswind * 1.944);
    const windDir = Math.sin(s.plane.pos.z * 0.002) >= 0 ? '→' : '←';
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = PALETTE.hudCyan;
    ctx.fillText(`WIND ${windDir} ${windKt} KT`, VIEW.width - 338, 27);
  }

  ctx.textAlign = 'right';
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = PALETTE.hudCyan;
  ctx.fillText(`TIME ${formatTime(s.flightTime)}`, VIEW.width - 210, 27);

  ctx.font = 'bold 17px monospace';
  ctx.fillStyle = PALETTE.hudCream;
  ctx.fillText(`SCORE ${String(s.score).padStart(6, '0')}`, VIEW.width - 20, 28);
  ctx.restore();
}

function drawInstrumentDeck(ctx, s, p) {
  const deckH = 142;
  const deckY = VIEW.height - deckH;

  ctx.save();
  const bg = ctx.createLinearGradient(0, deckY, 0, VIEW.height);
  bg.addColorStop(0, 'rgba(14, 15, 24, 0.90)');
  bg.addColorStop(1, 'rgba(8, 8, 14, 0.98)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, deckY, VIEW.width, deckH);

  ctx.fillStyle = 'rgba(255, 184, 72, 0.45)';
  ctx.fillRect(0, deckY, VIEW.width, 2);

  const groundY = terrainHeight(p.pos.x, p.pos.z);
  const altFt = Math.max(0, Math.round((p.pos.y - groundY) * 3.28));
  const speedKt = Math.max(0, Math.round(p.speed * 1.944));
  const hdgDeg = ((Math.round((p.yaw * 180) / Math.PI) % 360) + 360) % 360;

  const target = getNextTarget(s);
  const targetBrgDeg = target.completed
    ? hdgDeg
    : ((Math.round((Math.atan2(target.x - p.pos.x, target.z - p.pos.z) * 180) / Math.PI) % 360) + 360) % 360;
  const targetDistM = target.completed
    ? 0
    : Math.max(0, Math.round(Math.hypot(target.x - p.pos.x, target.z - p.pos.z)));

  drawDial(ctx, 58, deckY + 58, 50, 'SPD', `${speedKt}`, clamp(speedKt / 220, 0, 1), PALETTE.hudCyan, [
    { from: 0, to: 0.22, col: '#ff5247' },
    { from: 0.22, to: 0.78, col: '#5cf29c' },
    { from: 0.78, to: 1.0, col: '#ffbe4d' },
  ]);

  drawAttitudeDial(ctx, 164, deckY + 58, 50, p.pitch, p.roll);

  const lowWarn = !p.onGround && altFt < 60 && !s.clearedToLand;
  drawDial(
    ctx,
    270,
    deckY + 58,
    50,
    'ALT',
    `${altFt}`,
    clamp(altFt / 600, 0, 1),
    lowWarn ? PALETTE.hudRed : PALETTE.hudGreen,
  );

  drawCompassDial(ctx, 376, deckY + 58, 50, hdgDeg, target.completed ? null : targetBrgDeg, deckY + 129);

  drawBarGauge(ctx, 444, deckY + 32, 22, 74, 'THR', p.throttle, `${Math.round(p.throttle * 100)}%`, PALETTE.hudAmber);
  drawBarGauge(ctx, 500, deckY + 32, 22, 74, 'FUEL', p.fuel / 100, `${Math.round(p.fuel)}%`, p.fuel < 22 ? PALETTE.hudRed : PALETTE.hudGreen);
  drawBarGauge(ctx, 556, deckY + 32, 22, 74, 'HULL', p.hull / 100, `${Math.round(p.hull)}%`, p.hull < 40 ? PALETTE.hudRed : PALETTE.hudCyan);
  drawBarGauge(ctx, 612, deckY + 32, 22, 74, 'TEMP', clamp((p.engineTemp - 30) / 85, 0, 1), `${Math.round(p.engineTemp)}°`, p.engineTemp > 100 ? PALETTE.hudRed : '#ff9f43');

  const rx = 656;
  const rw = 614;
  ctx.fillStyle = 'rgba(20, 24, 36, 0.90)';
  ctx.strokeStyle = 'rgba(255, 190, 77, 0.42)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, rx, deckY + 10, rw, 122, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = target.completed ? PALETTE.hudGreen : target.isBonus ? '#ffd700' : '#a9bfd6';
  ctx.fillText(
    target.completed ? 'MISSION STATUS' : target.isBonus ? '3X BONUS TARGET' : 'NEXT WAYPOINT',
    rx + 14,
    deckY + 38,
  );

  ctx.textAlign = 'right';
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#9bb0c7';
  ctx.fillText(`[C] VIEW  [P] PAUSE  [R] RESET`, rx + rw - 14, deckY + 37);

  ctx.textAlign = 'left';
  ctx.font = 'bold 34px monospace';
  ctx.fillStyle = target.isRunway || target.completed ? PALETTE.hudGreen : target.isBonus ? '#ffd700' : PALETTE.hudAmber;
  const wpLine = target.completed
    ? target.label
    : `${target.label} • ${targetDistM}m • BRG ${String(targetBrgDeg).padStart(3, '0')}°`;
  ctx.fillText(wpLine, rx + 14, deckY + 80, rw - 28);

  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = PALETTE.hudCream;
  ctx.fillText(
    `ALT ${altFt} | SPD ${speedKt} | HDG ${String(hdgDeg).padStart(3, '0')}° | VSI ${p.vsi >= 0 ? '+' : ''}${Math.round(p.vsi)}`,
    rx + 14,
    deckY + 117,
    rw - 28,
  );

  ctx.restore();
}

function drawDial(ctx, cx, cy, r, title, valStr, frac, glowColor, arcs = null) {
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#141720';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#6f5c3e';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  const fg = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 2, cx, cy, r * 0.9);
  fg.addColorStop(0, '#1e2532');
  fg.addColorStop(1, '#090b12');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  ctx.fill();

  const startAng = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;

  if (arcs) {
    for (let i = 0; i < arcs.length; i += 1) {
      ctx.strokeStyle = arcs[i].col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.76, startAng + arcs[i].from * sweep, startAng + arcs[i].to * sweep);
      ctx.stroke();
    }
  }

  for (let i = 0; i <= 10; i += 1) {
    const a = startAng + (i / 10) * sweep;
    const r0 = r * (i % 2 === 0 ? 0.64 : 0.71);
    const r1 = r * 0.82;
    ctx.strokeStyle = i % 2 === 0 ? glowColor : 'rgba(255,240,210,0.4)';
    ctx.lineWidth = i % 2 === 0 ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  const na = startAng + clamp(frac, 0, 1) * sweep;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(na) * 8, cy - Math.sin(na) * 8);
  ctx.lineTo(cx + Math.cos(na) * (r * 0.72), cy + Math.sin(na) * (r * 0.72));
  ctx.stroke();

  ctx.fillStyle = '#e6c57a';
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = 'bold 17px monospace';
  ctx.fillStyle = 'rgba(255, 212, 130, 0.95)';
  ctx.fillText(title, cx, cy - r * 0.36);

  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(valStr, cx, cy + r * 0.56);
  ctx.restore();
}

function drawAttitudeDial(ctx, cx, cy, r, pitch, roll) {
  ctx.save();
  ctx.shadowColor = '#ffbe4d';
  ctx.shadowBlur = 9;
  ctx.fillStyle = '#141720';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#6f5c3e';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  ctx.clip();

  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const pitchPx = clamp(pitch * 48, -r * 0.75, r * 0.75);

  ctx.fillStyle = '#256099';
  ctx.fillRect(-r * 1.4, -r * 1.4 + pitchPx, r * 2.8, r * 1.4);
  ctx.fillStyle = '#8b4624';
  ctx.fillRect(-r * 1.4, pitchPx, r * 2.8, r * 1.4);
  ctx.strokeStyle = '#fff5d4';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.2;
  for (const off of [-18, -9, 9, 18]) {
    const w = Math.abs(off) === 18 ? 14 : 8;
    ctx.beginPath();
    ctx.moveTo(-w, pitchPx + off);
    ctx.lineTo(w, pitchPx + off);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#ffbe4d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.lineTo(cx, cy + 4);
  ctx.lineTo(cx + 6, cy);
  ctx.lineTo(cx + 18, cy);
  ctx.stroke();

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'center';
  ctx.fillText('ADI', cx, cy - r * 0.44);
  ctx.restore();
}

function drawCompassDial(ctx, cx, cy, r, hdgDeg, targetBrgDeg, labelY) {
  ctx.save();
  ctx.shadowColor = PALETTE.hudAmber;
  ctx.shadowBlur = 9;
  ctx.fillStyle = '#141720';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#6f5c3e';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.fillStyle = '#0c0f18';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.87, 0, Math.PI * 2);
  ctx.fill();

  const hdgRad = (hdgDeg * Math.PI) / 180;
  const labels = ['N', 'E', 'S', 'W'];
  ctx.font = 'bold 17px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 - hdgRad - Math.PI / 2;
    const r0 = r * 0.80;
    const r1 = r * 0.90;
    ctx.strokeStyle = i % 3 === 0 ? PALETTE.hudAmber : 'rgba(255, 220, 160, 0.35)';
    ctx.lineWidth = i % 3 === 0 ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
    if (i % 3 === 0) {
      ctx.fillStyle = i === 0 ? '#ff624d' : PALETTE.hudAmber;
      ctx.fillText(labels[i / 3], cx + Math.cos(a) * (r * 0.67), cy + Math.sin(a) * (r * 0.67));
    }
  }

  if (targetBrgDeg !== null) {
    const bugA = ((targetBrgDeg - hdgDeg) * Math.PI) / 180 - Math.PI / 2;
    ctx.fillStyle = PALETTE.hudGreen;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(bugA) * (r * 0.85), cy + Math.sin(bugA) * (r * 0.85), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(10, 12, 20, 0.94)';
  ctx.fillRect(cx - 27, cy - 12, 54, 24);
  ctx.strokeStyle = PALETTE.hudAmber;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx - 27, cy - 12, 54, 24);

  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 21px monospace';
  ctx.fillStyle = PALETTE.hudCream;
  ctx.fillText(`${String(hdgDeg).padStart(3, '0')}°`, cx, cy + 7);

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillText('HDG', cx, labelY);
  ctx.restore();
}

function drawBarGauge(ctx, x, y, w, h, label, frac, pctText, color) {
  ctx.save();
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c8d4e0';
  ctx.fillText(label, x + w * 0.5, y - 8);

  ctx.fillStyle = '#090b12';
  ctx.strokeStyle = '#4e4234';
  ctx.lineWidth = 1.2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  const fillH = Math.max(0, (h - 4) * clamp(frac, 0, 1));
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + h - 2 - fillH, w - 4, fillH);
  ctx.shadowBlur = 0;

  ctx.font = 'bold 19px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pctText, x + w * 0.5, y + h + 22);
  ctx.restore();
}

function getNextTarget(s) {
  if (s.screen === SCREEN_WIN) {
    return {
      x: s.plane.pos.x,
      y: s.plane.pos.y,
      z: s.plane.pos.z,
      label: 'LANDED SAFELY • RUNWAY COMPLETE',
      isRunway: true,
      completed: true,
    };
  }
  for (let i = 0; i < s.rings.length; i += 1) {
    const r = s.rings[i];
    if (!r.passed && !r.missed) {
      return {
        x: r.x,
        y: r.y,
        z: r.z,
        label: r.isBonus ? 'BONUS GATE' : `GATE ${i + 1}`,
        isBonus: !!r.isBonus,
        isRunway: false,
        completed: false,
      };
    }
  }
  const zTarget = s.plane.pos.z < WORLD_BOUNDS.runwayZStart + 100
    ? WORLD_BOUNDS.runwayZStart + 150
    : Math.min(WORLD_BOUNDS.runwayZEnd - 25, s.plane.pos.z + 220);
  return {
    x: canyonCenterX(zTarget),
    y: WORLD_BOUNDS.runwayY + 6,
    z: zTarget,
    label: 'DESERT RUNWAY',
    isRunway: true,
    completed: false,
  };
}

function drawTargetLocator(ctx, s, cam) {
  const target = getNextTarget(s);
  if (target.completed) return;
  const sp = projectWorld({ x: target.x, y: target.y, z: target.z }, cam);
  const color = target.isRunway ? PALETTE.hudGreen : target.isBonus ? '#ffd700' : PALETTE.hudAmber;

  if (sp && sp.x > 25 && sp.x < VIEW.width - 25 && sp.y > 55 && sp.y < VIEW.height - 150) {
    const bs = clamp(2400 / sp.z, 16, 36);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.8;
    const arm = 8;
    const x = sp.x;
    const y = sp.y;
    ctx.beginPath();
    ctx.moveTo(x - bs, y - bs + arm); ctx.lineTo(x - bs, y - bs); ctx.lineTo(x - bs + arm, y - bs);
    ctx.moveTo(x + bs - arm, y - bs); ctx.lineTo(x + bs, y - bs); ctx.lineTo(x + bs, y - bs + arm);
    ctx.moveTo(x - bs, y + bs - arm); ctx.lineTo(x - bs, y + bs); ctx.lineTo(x - bs + arm, y + bs);
    ctx.moveTo(x + bs - arm, y + bs); ctx.lineTo(x + bs, y + bs); ctx.lineTo(x + bs, y + bs - arm);
    ctx.stroke();
    ctx.restore();
  } else {
    const dx = target.x - s.plane.pos.x;
    const dz = target.z - s.plane.pos.z;
    const ang = Math.atan2(dx, dz) - cam.yaw;
    const ix = clamp(VIEW.width * 0.5 + Math.sin(ang) * 520, 48, VIEW.width - 48);
    const iy = clamp(VIEW.height * 0.45 - Math.cos(ang) * 240, 72, VIEW.height - 135);
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(-9, 8);
    ctx.lineTo(0, 3);
    ctx.lineTo(9, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawTitleHeader(ctx, s) {
  ctx.save();
  const cardW = 1004;
  const cardH = 136;
  const cardX = (VIEW.width - cardW) * 0.5;
  const cardY = 48;

  ctx.fillStyle = 'rgba(12, 10, 22, 0.70)';
  ctx.strokeStyle = 'rgba(255, 190, 77, 0.58)';
  ctx.lineWidth = 1.6;
  roundRect(ctx, cardX, cardY, cardW, cardH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 28px monospace';
  const tg = ctx.createLinearGradient(cardX + 200, cardY, cardX + cardW - 200, cardY + 36);
  tg.addColorStop(0, '#fff7d6');
  tg.addColorStop(0.5, '#ffbe4d');
  tg.addColorStop(1, '#ff7733');
  ctx.fillStyle = tg;
  ctx.fillText('CANYON DAWN PATROL', VIEW.width * 0.5, cardY + 30);

  const pillW = 312;
  const pillH = 58;
  const gap = 16;
  const pillsX = VIEW.width * 0.5 - (pillW * 3 + gap * 2) * 0.5;
  for (let i = 0; i < MISSIONS.length; i += 1) {
    const m = MISSIONS[i];
    const px = pillsX + i * (pillW + gap);
    const py = cardY + 40;
    const sel = i === s.missionIndex;
    ctx.fillStyle = sel ? 'rgba(255, 190, 77, 0.24)' : 'rgba(255, 255, 255, 0.06)';
    ctx.strokeStyle = sel ? PALETTE.hudAmber : 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = sel ? 1.8 : 1;
    roundRect(ctx, px, py, pillW, pillH, 7);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 19px monospace';
    ctx.fillStyle = sel ? '#ffe694' : '#e0d6cc';
    ctx.fillText(`[${i + 1}] ${m.name}`, px + pillW * 0.5, py + 23, pillW - 14);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = sel ? '#ffd89e' : '#b8c0cc';
    ctx.fillText(m.subtitle, px + pillW * 0.5, py + 46, pillW - 14);
  }

  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#e5dacb';
  ctx.textAlign = 'left';
  ctx.fillText('W/S Pitch • A/D Roll • E/Q Thr • C View • P Pause • R Reset', cardX + 20, cardY + 123);

  const pulse = 0.82 + 0.18 * Math.sin(s.timeSec * 4);
  ctx.globalAlpha = pulse;
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.hudGreen;
  ctx.fillText('▶ CLICK OR SPACE TO FLY', cardX + cardW - 20, cardY + 123);
  ctx.restore();
}

function drawPauseCard(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(10, 8, 16, 0.56)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.fillStyle = 'rgba(16, 18, 28, 0.92)';
  ctx.strokeStyle = PALETTE.hudAmber;
  ctx.lineWidth = 2;
  roundRect(ctx, VIEW.width * 0.5 - 240, 220, 480, 150, 12);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 34px monospace';
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillText('FLIGHT PAUSED', VIEW.width * 0.5, 282);
  ctx.font = '15px monospace';
  ctx.fillStyle = PALETTE.hudCream;
  ctx.fillText('Press P or Space to resume   •   R to restart', VIEW.width * 0.5, 326);
  ctx.restore();
}

function drawCrashCard(ctx, s) {
  ctx.save();
  ctx.fillStyle = 'rgba(42, 8, 8, 0.42)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px monospace';
  ctx.fillStyle = PALETTE.hudRed;
  ctx.fillText(s.crashReason || 'AIRCRAFT IMPACT!', VIEW.width * 0.5, 270);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = PALETTE.hudCream;
  ctx.fillText(
    s.plane.hull > 0
      ? `Realigning at last cleared ring...  (-500 PTS | +5.0s | Hull ${Math.round(s.plane.hull)}%)`
      : 'Airframe destroyed!',
    VIEW.width * 0.5,
    315,
  );
  ctx.restore();
}

function drawEndCard(ctx, s, isWin) {
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 18, 0.35)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  const cw = 640;
  const ch = 228;
  const cx = (VIEW.width - cw) * 0.5;
  const cy = 66;
  ctx.fillStyle = 'rgba(12, 15, 26, 0.86)';
  ctx.strokeStyle = isWin ? PALETTE.hudGreen : PALETTE.hudRed;
  ctx.lineWidth = 2.2;
  roundRect(ctx, cx, cy, cw, ch, 12);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 34px monospace';
  ctx.fillStyle = isWin ? PALETTE.hudGreen : PALETTE.hudRed;
  ctx.fillText(isWin ? 'RUNWAY LANDING COMPLETE!' : 'SORTIE FAILED', VIEW.width * 0.5, cy + 44);

  if (isWin) {
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fillText(`${s.landingGrade || 'SAFE LANDING'}  (${s.touchdownFpm} FPM)`, VIEW.width * 0.5, cy + 72);
  }

  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = PALETTE.hudCream;
  ctx.fillText(`FINAL SCORE: ${s.score.toLocaleString()}   (BEST ${s.bestScore.toLocaleString()})`, VIEW.width * 0.5, cy + 110);

  ctx.font = '14px monospace';
  ctx.fillStyle = '#c8d6e5';
  ctx.fillText(
    `Flight Time: ${formatTime(s.flightTime)}   |   Rings: ${s.ringsPassed}/${WORLD_BOUNDS.ringCount}   |   Max Streak: x${s.maxStreak}`,
    VIEW.width * 0.5,
    cy + 144,
  );
  ctx.fillText(
    `Fuel Left: ${Math.round(s.plane.fuel)}%   |   Hull Integrity: ${Math.round(s.plane.hull)}%   |   Crashes: ${s.crashes}`,
    VIEW.width * 0.5,
    cy + 170,
  );

  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillText('PRESS ENTER, SPACE OR R TO FLY AGAIN', VIEW.width * 0.5, cy + 206);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
