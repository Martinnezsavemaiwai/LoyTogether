/**
 * Deterministic float parameters. Every client derives the same lane, speed and
 * phase from the krathong id and float time, so nothing is streamed over the network.
 */

export interface FloatParams {
  /** 0 = far bank (top of the water), 1 = near bank (bottom). */
  lane: number;
  /** Seconds to cross the river once. */
  duration: number;
  /** Seconds for one bob cycle. */
  bobDuration: number;
  /** Fraction of a crossing already travelled at the moment of floating. */
  startOffset: number;
  /** Slight tilt in degrees. */
  tilt: number;
}

/** FNV-1a 32-bit hash. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small seeded PRNG (mulberry32) so one id yields several independent numbers. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function floatParams(id: string): FloatParams {
  const rand = seededRandom(hashString(id));
  const lane = rand();
  return {
    lane,
    // Far krathongs look slower, like real perspective.
    duration: 70 + rand() * 40 + (1 - lane) * 30,
    bobDuration: 3.2 + rand() * 2.4,
    // New krathongs enter already in view, a little in from the left bank.
    startOffset: 0.18 + rand() * 0.12,
    tilt: (rand() - 0.5) * 8,
  };
}

/**
 * Where along the crossing (0..1) a krathong is at `now`. Krathongs loop so the
 * river stays full on a quiet night; a new one starts near the near-left bank.
 */
export function crossingProgress(params: FloatParams, floatedAtMs: number, nowMs: number): number {
  const elapsed = Math.max(0, (nowMs - floatedAtMs) / 1000);
  const progress = params.startOffset + elapsed / params.duration;
  return progress - Math.floor(progress);
}

/** CSS negative delay that puts the drift animation at the right point for every viewer. */
export function driftDelaySeconds(params: FloatParams, floatedAtMs: number, nowMs: number): number {
  return -crossingProgress(params, floatedAtMs, nowMs) * params.duration;
}
