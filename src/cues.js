// ─────────────────────────────────────────────────────────────
// Sound families and the cue builder. Each design names a family and
// a handful of notes; the family supplies the timbre so that a
// design's start cue and its last-minute cue always belong to the
// same world.
// ─────────────────────────────────────────────────────────────

/** @typedef {'air'|'water'|'wood'|'glass'|'ceramic'|'fabric'|'metal'|'celestial'|'digital'|'string'|'underwater'|'resonant'} SoundFamily */

export const FAMILIES = {
  air:        { waveform: 'sine',     filterFrequency: 2600, resonance: 0.6, gain: 0.15, attackMs: 70, releaseMs: 200, noiseAmount: 0.5, noiseFrequency: 1500, noiseQ: 0.5, reverbAmount: 0.3 },
  water:      { waveform: 'sine',     filterFrequency: 2100, resonance: 2.2, gain: 0.17, attackMs: 8,  releaseMs: 180, noiseAmount: 0.18, noiseFrequency: 2600, noiseDurationMs: 90, reverbAmount: 0.35 },
  wood:       { waveform: 'triangle', filterFrequency: 2400, resonance: 1.6, gain: 0.18, attackMs: 4,  releaseMs: 120, noiseAmount: 0.22, noiseFrequency: 900, noiseDurationMs: 60, partials: [2.7] },
  glass:      { waveform: 'sine',     filterFrequency: 6200, resonance: 1.1, gain: 0.13, attackMs: 6,  releaseMs: 260, partials: [2.76, 5.4], reverbAmount: 0.4 },
  ceramic:    { waveform: 'triangle', filterFrequency: 3400, resonance: 1.4, gain: 0.16, attackMs: 4,  releaseMs: 150, partials: [2.1, 3.6] },
  fabric:     { waveform: 'sine',     filterFrequency: 1200, resonance: 0.5, gain: 0.14, attackMs: 40, releaseMs: 160, noiseAmount: 0.85, noiseFrequency: 700, noiseQ: 0.4 },
  metal:      { waveform: 'sine',     filterFrequency: 5200, resonance: 1.8, gain: 0.12, attackMs: 3,  releaseMs: 280, partials: [2.4, 3.9, 5.9], reverbAmount: 0.45 },
  celestial:  { waveform: 'sine',     filterFrequency: 7000, resonance: 0.8, gain: 0.12, attackMs: 90, releaseMs: 300, partials: [3.0], reverbAmount: 0.5 },
  digital:    { waveform: 'square',   filterFrequency: 2200, resonance: 2.4, gain: 0.07, attackMs: 3,  releaseMs: 90 },
  string:     { waveform: 'sawtooth', filterFrequency: 1900, resonance: 1.2, gain: 0.08, attackMs: 3,  releaseMs: 220, noiseAmount: 0.12, noiseDurationMs: 40 },
  underwater: { waveform: 'sine',     filterFrequency: 700,  resonance: 3.0, gain: 0.2,  attackMs: 50, releaseMs: 300, reverbAmount: 0.4 },
  resonant:   { waveform: 'sine',     filterFrequency: 3000, resonance: 1.0, gain: 0.16, attackMs: 20, releaseMs: 340, partials: [2.0, 3.01], reverbAmount: 0.4 }
};

/**
 * Build a cue from a family plus the notes a design asks for.
 * `spread` is the gap in ms between notes.
 */
export function cue(family, frequencies, opts = {}) {
  const base = FAMILIES[family] || FAMILIES.air;
  const n = frequencies.length;
  const spread = opts.spread ?? 130;
  const offsets = opts.offsets || frequencies.map((_, i) => Math.round(i * spread));
  const span = offsets[n - 1] || 0;
  // Keep every cue inside its window: a one- or two-note opening stays under
  // half a second, a three-note phrase under two thirds of one.
  const maxTotal = opts.maxTotalMs ?? (n >= 3 ? 640 : 480);
  const durationMs = opts.durationMs ?? Math.max(150, Math.min(520, maxTotal - span, 260 - span * 0.25 + 120));
  return {
    family,
    ...base,
    ...opts,
    frequencies,
    noteOffsetsMs: offsets,
    durationMs,
    // total audible span stays inside the spec: start 180–500ms, warning 300–700ms
    totalMs: span + durationMs
  };
}

// Note helper: equal temperament from A4=440.
export const N = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);
