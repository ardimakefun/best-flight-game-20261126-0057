// Procedural WebAudio soundscape: piston engine rumble, wind rush, gate chimes, warnings, touchdown, and fanfare.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let propOsc = null;
  let engineFilter = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();

    // Piston engine drone + prop harmonic
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 54;

    propOsc = ctx.createOscillator();
    propOsc.type = 'triangle';
    propOsc.frequency.value = 108;

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 260;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0;

    engineOsc.connect(engineFilter);
    propOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    propOsc.start();

    // Filtered noise for canopy airspeed wind rush
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;

    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;

    windGain = ctx.createGain();
    windGain.gain.value = 0;

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();
  }

  function playTone(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function playNoiseBurst(dur, cutoff, vol) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.28));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(flt);
    flt.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  function update(state) {
    if (!ctx) return;
    const active = state.screen === 'play' && !state.muted;
    const t = ctx.currentTime;
    const thr = state.plane.fuel > 0 ? state.plane.throttle : 0;

    if (!active) {
      engineGain.gain.setTargetAtTime(0, t, 0.08);
      windGain.gain.setTargetAtTime(0, t, 0.08);
    } else {
      const rpmFreq = 46 + thr * 68 + state.plane.speed * 0.22;
      engineOsc.frequency.setTargetAtTime(rpmFreq, t, 0.08);
      propOsc.frequency.setTargetAtTime(rpmFreq * 2.02, t, 0.08);
      engineFilter.frequency.setTargetAtTime(180 + thr * 420, t, 0.1);
      engineGain.gain.setTargetAtTime(0.03 + thr * 0.09, t, 0.08);

      windFilter.frequency.setTargetAtTime(300 + state.plane.speed * 6, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.06, state.plane.speed * 0.00055), t, 0.1);
    }

    if (state.muted) return;

    if (state.events.ringBullseye) {
      const base = 587.33 * (1 + Math.min(state.streak, 6) * 0.05);
      playTone(base, 0.18, 'triangle', 0.22, 0);
      playTone(base * 1.25, 0.22, 'sine', 0.22, 0.06);
      playTone(base * 1.5, 0.34, 'sine', 0.24, 0.12);
    } else if (state.events.ringHit) {
      const base = 523.25 * (1 + Math.min(state.streak, 6) * 0.04);
      playTone(base, 0.18, 'triangle', 0.18, 0);
      playTone(base * 1.5, 0.26, 'sine', 0.2, 0.07);
    } else if (state.events.ringMiss) {
      playTone(210, 0.18, 'sawtooth', 0.14, 0);
      playTone(155, 0.26, 'sawtooth', 0.14, 0.12);
    }

    if (state.events.touchdown) {
      playNoiseBurst(0.24, 520, 0.26);
    }

    if (state.events.crash) {
      playNoiseBurst(0.75, 760, 0.48);
      playTone(110, 0.45, 'sawtooth', 0.22, 0);
    }

    if (state.events.win) {
      playTone(523.25, 0.18, 'triangle', 0.2, 0);
      playTone(659.25, 0.18, 'triangle', 0.2, 0.11);
      playTone(783.99, 0.22, 'triangle', 0.22, 0.22);
      playTone(1046.5, 0.55, 'sine', 0.26, 0.34);
    }
  }

  return { init, update };
}
