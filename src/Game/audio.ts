// Tiny WebAudio sfx. Unlocked on first touch only (Aigram preloads games;
// never start audio at mount). All sounds are synthesized — no asset files.

let ctx: AudioContext | null = null;
let unlocked = false;

export function unlock() {
  if (unlocked) return;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  } catch { /* no audio */ }
}

function blip(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playDrop() {
  blip(180, 0.09, 'sine', 0.18, 120);
}

// pitch rises with tier so bigger merges feel bigger
export function playMerge(tier: number) {
  const base = 320 + tier * 55;
  blip(base, 0.12, 'triangle', 0.22, base * 1.5);
  blip(base * 1.5, 0.14, 'sine', 0.12, base * 2);
}

export function playFinal() {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => blip(f, 0.25, 'triangle', 0.2), i * 90);
  });
}

export function playGameOver() {
  blip(300, 0.5, 'sawtooth', 0.16, 80);
}
