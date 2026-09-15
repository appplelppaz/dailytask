// ─────────────────────────────────────────────────────────────
// Sound engine. Every cue in the app is synthesised from the same
// primitives — no audio files. A cue is data (SoundCueDefinition),
// so 200 different cues cost nothing but a table.
// ─────────────────────────────────────────────────────────────

let ctx = null, master = null, noiseBuf = null, ready = false;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    } catch { ctx = null; return null; }
  }
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch { /* ignore */ } }
  return ctx;
}

function noise() {
  const c = ac(); if (!c) return null;
  if (!noiseBuf) {
    const len = Math.floor(c.sampleRate * 1.2);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {           // gently brown-ish: softer than white
      last = (last + (Math.random() * 2 - 1) * 0.28) * 0.96;
      d[i] = last;
    }
  }
  return noiseBuf;
}

export const audio = {
  get unlocked() { return ready; },

  /** Must be called from a user gesture (iOS/Safari). Safe to call repeatedly. */
  unlock() {
    const c = ac();
    if (!c) return false;
    try {
      const o = c.createOscillator(), g = c.createGain();
      g.gain.value = 0.00008;
      o.connect(g); g.connect(master);
      o.start(); o.stop(c.currentTime + 0.02);
    } catch { /* ignore */ }
    ready = c.state === 'running';
    return ready;
  },

  setVolume(v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); },

  /**
   * Play one cue. Failures are swallowed on purpose: sound must never be
   * able to take the visuals down with it.
   * @param {object} cue SoundCueDefinition
   * @param {number} volume 0..1
   */
  play(cue, volume = 1) {
    const c = ac();
    if (!c || !cue || volume <= 0) return;
    try {
      const t0 = c.currentTime + 0.02;
      const dur = (cue.durationMs || 320) / 1000;
      const atk = Math.max(0.008, (cue.attackMs ?? 40) / 1000);
      const rel = Math.max(0.04, (cue.releaseMs ?? 160) / 1000);
      const gainLvl = (cue.gain ?? 0.18) * volume;

      // Shared voice bus: one filter + optional short tail for the whole cue,
      // so a cue reads as a single object rather than separate beeps.
      const bus = c.createGain();
      bus.gain.value = 1;
      const filter = c.createBiquadFilter();
      filter.type = cue.filterType || 'lowpass';
      filter.frequency.value = cue.filterFrequency ?? 4200;
      filter.Q.value = cue.resonance ?? 0.8;
      bus.connect(filter);
      filter.connect(master);

      if (cue.reverbAmount) {                  // very short ambience, never a wash
        const dly = c.createDelay(0.25);
        dly.delayTime.value = 0.055 + (cue.reverbAmount * 0.08);
        const fb = c.createGain(); fb.gain.value = Math.min(0.32, cue.reverbAmount * 0.38);
        const wet = c.createGain(); wet.gain.value = Math.min(0.5, cue.reverbAmount * 0.5);
        filter.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(master);
      }

      const freqs = cue.frequencies || [440];
      const offs = cue.noteOffsetsMs || freqs.map(() => 0);

      freqs.forEach((f, i) => {
        const start = t0 + (offs[i] ?? 0) / 1000;
        const noteDur = dur;
        const osc = c.createOscillator();
        osc.type = cue.waveform || 'sine';
        osc.frequency.setValueAtTime(f, start);
        if (cue.glide) osc.frequency.exponentialRampToValueAtTime(f * cue.glide, start + noteDur);
        if (cue.detune) osc.detune.setValueAtTime(cue.detune * (i % 2 ? -1 : 1), start);

        const g = c.createGain();
        const peak = gainLvl * (cue.noteGains ? (cue.noteGains[i] ?? 1) : 1);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(peak, start + atk);          // never a hard edge
        g.gain.setValueAtTime(peak, start + Math.max(atk, noteDur - rel));
        g.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);

        osc.connect(g); g.connect(bus);
        osc.start(start); osc.stop(start + noteDur + 0.06);

        if (cue.partials) {                     // metallic / resonant bodies
          cue.partials.forEach((mult, pi) => {
            const po = c.createOscillator(), pg = c.createGain();
            po.type = 'sine';
            po.frequency.setValueAtTime(f * mult, start);
            const pp = peak * (0.16 / (pi + 1));
            pg.gain.setValueAtTime(0.0001, start);
            pg.gain.linearRampToValueAtTime(pp, start + atk);
            pg.gain.exponentialRampToValueAtTime(0.0001, start + noteDur * 0.8);
            po.connect(pg); pg.connect(bus);
            po.start(start); po.stop(start + noteDur + 0.06);
          });
        }
      });

      if (cue.noiseAmount) {                    // air, sand, fabric, brush, water
        const buf = noise();
        if (buf) {
          const src = c.createBufferSource();
          src.buffer = buf; src.loop = true;
          const nf = c.createBiquadFilter();
          nf.type = cue.noiseFilterType || 'bandpass';
          nf.frequency.value = cue.noiseFrequency ?? (cue.filterFrequency ?? 1800);
          nf.Q.value = cue.noiseQ ?? 0.7;
          const ng = c.createGain();
          const nStart = t0 + (cue.noiseOffsetMs ?? 0) / 1000;
          const nDur = (cue.noiseDurationMs ?? cue.durationMs ?? 260) / 1000;
          const np = gainLvl * cue.noiseAmount;
          ng.gain.setValueAtTime(0.0001, nStart);
          ng.gain.linearRampToValueAtTime(np, nStart + Math.max(0.01, atk * 1.4));
          ng.gain.exponentialRampToValueAtTime(0.0001, nStart + nDur);
          src.connect(nf); nf.connect(ng); ng.connect(bus);
          src.start(nStart); src.stop(nStart + nDur + 0.05);
        }
      }
    } catch { /* audio must never break the scene */ }
  }
};
