// Minimal story template — rewrite per short. Pure functions of the frame.
// Character is ALWAYS the reference stick man (engine/stickman.js).

export const SHOTS = [
  { n: 90, backdrop: "room",   cam: { x: 540, y: 880, z: 1.30 }, ease: "out" },  // hook
  { n: 120, backdrop: "street", cam: { x: 540, y: 900, z: 1.15 }, ease: "lin" },  // beat 2
  { n: 90,  backdrop: "rooftop", cam: { x: 540, y: 860, z: 1.20 }, ease: "in" },   // payoff
];

export const camAt = (f) => {
  let acc = 0;
  for (const s of SHOTS) { if (f < acc + s.n) return s.cam; acc += s.n; }
  return SHOTS[SHOTS.length - 1].cam;
};

export const actorsAt = (f, T) => {
  // one line per actor; poses: hang walksw(explore climb pull reach point up hip cross chin open
  // see engine/stickman.js. gear: "backpack"|"flashlight"|"notebook"|"bottle" | [..] | null
  return [{
    x: 540, y: 1560, scale: 1, facing: 0.45, expr: "neutral",
    step: 0.28, L: "walksw", R: "walksw", gear: ["backpack", "flashlight"], cone: f > 120 ? 1 : 0,
  }];
};

export const fxAt = (f, T) => (f > 240 && f < 260 ? [{ kind: "flash", k: 1 - (f - 240) / 20 }] : []);

export const CAPTIONS = null;      // e.g. [{ t0: 0.4, t1: 1.6, text: "THREE KNOCKS." }]
export const TAG = "DAY 11";       // corner tag, or null
