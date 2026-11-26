/** Procedural WebAudio engine, propeller hum, wind rush, storm rain hiss, stall buzzer, and chimes. */
export function createProceduralAudio() {
  let ctx = null; let unlocked = false; let muted = false; let masterGain = null;
  let engineOscA = null; let engineOscB = null; let engineFilter = null; let engineGain = null;
  let windFilter = null; let windGain = null; let rainFilter = null; let rainGain = null; let stallCooldown = 0;

  function ensureContext() {
    if (ctx || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) return;
    try {
      ctx = new AudioCtx(); masterGain = ctx.createGain(); masterGain.gain.value = muted ? 0 : 0.35; masterGain.connect(ctx.destination);
      engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 180;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOscA = ctx.createOscillator(); engineOscA.type = 'sawtooth'; engineOscA.frequency.value = 46;
      engineOscB = ctx.createOscillator(); engineOscB.type = 'triangle'; engineOscB.frequency.value = 92;
      engineOscA.connect(engineFilter); engineOscB.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(masterGain);
      engineOscA.start(); engineOscB.start();
      const bufSize = ctx.sampleRate * 2; const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate); const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noiseBuf; noiseSrc.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 520; windFilter.Q.value = 0.9;
      windGain = ctx.createGain(); windGain.gain.value = 0; noiseSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(masterGain);
      rainFilter = ctx.createBiquadFilter(); rainFilter.type = 'highpass'; rainFilter.frequency.value = 1850;
      rainGain = ctx.createGain(); rainGain.gain.value = 0; noiseSrc.connect(rainFilter); rainFilter.connect(rainGain); rainGain.connect(masterGain);
      noiseSrc.start();
    } catch { ctx = null; }
  }

  function unlock() { ensureContext(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume().catch(() => {}); unlocked = true; }

  function playTone(freq, duration, type = 'sine', peak = 0.22, slideTo = null) {
    if (!ctx || !unlocked || muted) return;
    const now = ctx.currentTime; const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    g.gain.setValueAtTime(0.001, now); g.gain.linearRampToValueAtTime(peak, now + 0.015); g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g); g.connect(masterGain); osc.start(now); osc.stop(now + duration + 0.02);
  }

  return {
    unlock,
    toggleMute() { muted = !muted; if (masterGain && ctx) masterGain.gain.setTargetAtTime(muted ? 0 : 0.35, ctx.currentTime, 0.04); return muted; },
    playGateChime(isBonus) {
      if (isBonus) { playTone(587.3, 0.22, 'triangle', 0.24); setTimeout(() => playTone(880, 0.28, 'sine', 0.22), 70); setTimeout(() => playTone(1174.6, 0.35, 'sine', 0.20), 140); }
      else { playTone(523.25, 0.18, 'triangle', 0.20); setTimeout(() => playTone(783.99, 0.24, 'sine', 0.18), 65); }
    },
    playTouchdown() { playTone(135, 0.22, 'sawtooth', 0.24, 52); },
    playToggle(active) { playTone(active ? 640 : 420, 0.075, 'triangle', 0.14, active ? 760 : 340); },
    playCargoDrop() { playTone(320, 0.18, 'triangle', 0.20, 140); setTimeout(() => playTone(740, 0.24, 'sine', 0.14, 980), 80); },
    playCrash() { playTone(92, 0.55, 'sawtooth', 0.36, 30); },
    update(flightState, isCockpit, activePlay, dt) {
      if (!ctx || !unlocked) return;
      const now = ctx.currentTime;
      if (!activePlay || flightState.crashed) {
        engineGain.gain.setTargetAtTime(0, now, 0.08);
        windGain.gain.setTargetAtTime(0, now, 0.08);
        if (rainGain) rainGain.gain.setTargetAtTime(0, now, 0.08);
        return;
      }

      const baseFreq = 44 + flightState.rpm * 64;
      engineOscA.frequency.setTargetAtTime(baseFreq, now, 0.05);
      engineOscB.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.05);
      engineFilter.frequency.setTargetAtTime(isCockpit ? 210 + flightState.rpm * 240 : 320 + flightState.rpm * 340, now, 0.06);
      engineGain.gain.setTargetAtTime(flightState.fuel > 0 ? 0.14 + flightState.rpm * 0.16 : 0.02, now, 0.06);

      const speedFrac = Math.min(1, flightState.airspeedKt / 180);
      windFilter.frequency.setTargetAtTime(340 + speedFrac * 780, now, 0.06);
      windGain.gain.setTargetAtTime((isCockpit ? 0.06 : 0.13) * speedFrac, now, 0.06);
      if (rainGain) rainGain.gain.setTargetAtTime(flightState.isStorm ? (isCockpit ? 0.095 : 0.055) : 0, now, 0.1);

      stallCooldown = Math.max(0, stallCooldown - dt);
      if ((flightState.stallWarning || flightState.terrainWarning) && stallCooldown <= 0) {
        playTone(flightState.terrainWarning ? 820 : 690, 0.12, 'square', 0.12, flightState.terrainWarning ? 980 : 650);
        stallCooldown = flightState.terrainWarning ? 0.34 : 0.42;
      }
    },
  };
}
