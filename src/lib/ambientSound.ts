/**
 * Generated ambience: filtered noise for water plus a soft, slow chime.
 * No audio files and nothing starts until the visitor turns it on.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let chimeTimer: number | null = null;

function makeWater(audio: AudioContext, out: AudioNode) {
  const length = audio.sampleRate * 4;
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    // Brown noise
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.2;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  const lfo = audio.createOscillator();
  const lfoGain = audio.createGain();
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(filter.frequency);
  source.connect(filter).connect(out);
  source.start();
  lfo.start();
}

function chime(audio: AudioContext, out: AudioNode) {
  const notes = [523.25, 587.33, 659.25, 783.99, 880];
  const freq = notes[Math.floor(Math.random() * notes.length)] as number;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = audio.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.05, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 3.6);
}

export async function startAmbient(): Promise<boolean> {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      makeWater(ctx, master);
    }
    await ctx.resume();
    master?.gain.setTargetAtTime(0.35, ctx.currentTime, 0.8);
    if (chimeTimer === null) {
      chimeTimer = window.setInterval(() => {
        if (ctx && master) chime(ctx, master);
      }, 6500);
    }
    return true;
  } catch {
    return false;
  }
}

export function stopAmbient() {
  if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  if (chimeTimer !== null) {
    window.clearInterval(chimeTimer);
    chimeTimer = null;
  }
}
