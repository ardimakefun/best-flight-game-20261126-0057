// Procedural sound only: a WebAudio engine hum whose pitch follows the
// throttle, a two-note chime for each ring, a thud for a crash and a short
// arpeggio for a good landing. No audio files, nothing fetched. Everything
// is guarded: with no audio device, or before the first gesture, the game
// simply stays silent.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter).connect(engineGain).connect(context.destination);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function note(frequency, at, duration, type, volume) {
    if (!context) return;
    try {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + duration + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    /** Call on the first gesture; also (re)starts the engine hum. */
    unlock() {
      if (!ensure()) return;
      try {
        if (context.state === 'suspended') void context.resume();
      } catch {
        // Ignore.
      }
    },
    /** Engine pitch and loudness follow throttle 0..1 and speed. */
    engine(throttle, speedNorm) {
      if (!context || !engineOsc || !engineGain || muted) return;
      try {
        engineOsc.frequency.value = 48 + throttle * 70 + speedNorm * 30;
        engineGain.gain.value = 0.015 + throttle * 0.035;
      } catch {
        // Ignore.
      }
    },
    ring() {
      if (!ensure()) return;
      const at = context.currentTime;
      note(880, at, 0.35, 'sine', 0.16);
      note(1318, at + 0.09, 0.45, 'sine', 0.14);
    },
    crash() {
      if (!ensure()) return;
      const at = context.currentTime;
      note(90, at, 0.5, 'triangle', 0.25);
      note(55, at + 0.05, 0.6, 'sine', 0.22);
    },
    land() {
      if (!ensure()) return;
      const at = context.currentTime;
      [523, 659, 784, 1046].forEach((frequency, index) => {
        note(frequency, at + index * 0.11, 0.4, 'sine', 0.15);
      });
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      return muted;
    },
  };
}
