// Character reference sheet story: 18 frames -> tile with tools/sheet.py.
// Frames 0-3: views (front, side, back, 3/4).  4-11: the 8 expressions.
// 12-15: in-action (walk, run, explore, climb).  16-17: gear close-ups.
const views = [
  { facing: 0, bg: "room", lab: "FRONT" },
  { facing: 1, bg: "room", lab: "SIDE" },
  { facing: 2, bg: "room", lab: "BACK" },
  { facing: 0.45, bg: "room", lab: "3/4" },
];
const exprs = ["neutral", "happy", "angry", "surprised", "scared", "sad", "tired", "thinking"];
export const SHOTS = [];
for (let i = 0; i < 4; i++) SHOTS.push({ n: 1, backdrop: views[i].bg, ease: "lin" });
for (let i = 0; i < 8; i++) SHOTS.push({ n: 1, backdrop: "room", ease: "lin" });
for (let i = 0; i < 4; i++) SHOTS.push({ n: 1, backdrop: i === 3 ? "stairs" : "room", ease: "lin" });
SHOTS.push({ n: 1, backdrop: "room", ease: "lin" });
SHOTS.push({ n: 1, backdrop: "room", ease: "lin" });

const cams = [];
for (let i = 0; i < 4; i++) cams.push({ x: 540, y: 880, z: 1.30 });
for (let i = 0; i < 8; i++) cams.push({ x: 540, y: 690, z: 2.0 });
cams.push({ x: 540, y: 900, z: 1.25 });   // walk
cams.push({ x: 540, y: 900, z: 1.25 });   // run
cams.push({ x: 540, y: 880, z: 1.35 });   // explore
cams.push({ x: 540, y: 880, z: 1.35 });   // climb
cams.push({ x: 540, y: 800, z: 1.6 });    // backpack straps
cams.push({ x: 540, y: 800, z: 1.7 });    // notebook + bottle

const STEP = 0.28;
export const camAt = (f) => cams[Math.min(f, cams.length - 1)];
export const actorsAt = (f, T) => {
  if (f < 4) { const v = views[f];
    return [{ x: 540, y: 1560, scale: 1, pose: 1, facing: v.facing, expr: "neutral", gear: null, L: "hang", R: "hang" }]; }
  if (f < 12) { const e = exprs[f - 4];
    return [{ x: 540, y: 1180, scale: 1.25, expr: e, facing: e === "thinking" ? 0.45 : 0, R: e === "thinking" ? "chin" : "hang", blink: 0 }]; }
  if (f === 12) return [{ x: 540, y: 1560, scale: 1, step: STEP, facing: 0.45, gear: ["backpack"], L: "walksw", R: "walksw", expr: "neutral" }];
  if (f === 13) return [{ x: 540, y: 1560, scale: 1, step: 0.55, run: 1, facing: 0.45, gear: null, L: "walksw", R: "walksw", expr: "angry", tilt: 8 }];
  if (f === 14) return [{ x: 500, y: 1560, scale: 1, facing: 1, gear: ["flashlight"], R: "explore", L: "hang", expr: "neutral", cone: 1 }];
  if (f === 15) return [{ x: 520, y: 1520, scale: 1, facing: 0.6, R: "climb", L: "reach", expr: "tired" }];
  if (f === 16) return [{ x: 540, y: 1300, scale: 1, facing: 0, gear: ["backpack"], expr: "neutral", L: "hip", R: "hang" }];
  return [{ x: 540, y: 1300, scale: 1, facing: 0.45, gear: ["notebook", "bottle"], expr: "happy", L: "open", R: "open" }];
};
export const fxAt = (f, T) => [];
export const TAG = null;
