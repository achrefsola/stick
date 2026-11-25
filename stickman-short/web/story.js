// Story: "Influencer During the Apocalypse" — stickman vlog-comedy short.
// Character is ALWAYS the reference stick man (web/stickman.js); the horde is the
// same character with zombie:true. Pure functions of the frame (any render order).
//
// Why this staging moves:
//  - every shot carries a camera move (handheld drift, push, whip-pan, track)
//  - the horde is a flock of real actors that runs, lunges and closes in — it is
//    never still, and the hero runs too, so the lane scrolls under both of them
//  - props are depth-split (car / pole / bin), so the hero can stand BEHIND a car
//  - the phone and the blood are part of the character draw: the selfie rig, the
//    duct-tape bite, drips off the hand, a trail and a puddle on the ground
// Word frames come from work/words.json (30 fps): every cut lands on a new beat.

const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- word marks
const M = {
  hook: 0, hey: 42, crew: 72, vlog: 122, today: 122, exploring: 140, cardio: 186,
  whoa: 203, detour: 218, fans: 226, little: 249, enthu: 259, just: 276, evasive: 293,
  folks: 318, prepared: 330, spontaneous: 341, crowd: 350, alright: 372, behind: 387,
  inconspic: 408, vehicle: 443, back: 478, resource: 505, prime: 540, temporary: 562,
  studio: 576, youknow: 607, thiswhole: 632, perspective: 640, also: 693, ideas: 740,
  what: 776, audience: 786, piece: 799, you: 803,
};

const RUN = 17;            // world px/frame for a full sprint
const HERO_GROUND = 1588;  // hero soles in the street
const TOTAL = 815;
// ---------------------------------------------------------------- shots
// start = first frame of the shot (word-anchored). n is derived, so the cut
// always lands on the word it belongs to (no picture/voice drift).
const SHOT_DEFS = [
  { start: 0,   kind: "hook",      follow: RUN,          move: { z: [1.55, 1.34], y: [1186, 1196], dy: [6, 16], shake: 8 } },
  { start: 42,  kind: "hey",       follow: 0,            move: { z: [1.36, 1.3],  y: [1196, 1188], dy: [0, -6], shake: 3 } },
  { start: 78,  kind: "vlog",      follow: RUN,          move: { z: [1.18, 1.15], y: [1252, 1262], dy: [0, 8], shake: 3 } },
  { start: 122, kind: "exploring", follow: 0,            move: { z: [1.2, 1.14],  y: [1244, 1232], dy: [0, 6], shake: 2.5 } },
  { start: 169, kind: "cardio",    follow: 0,            move: { z: [1.24, 1.34], y: [1202, 1188], dy: [-2, 2], shake: 5 } },
  { start: 193, kind: "whoa",      follow: 0, whip: 3,   move: { z: [1.5, 1.66],  y: [1172, 1158], dy: [0, 4], shake: 10 } },
  { start: 200, kind: "detour",    follow: 0,            move: { z: [1.5, 1.26],  y: [1178, 1196], dy: [0, 6], shake: 12 } },
  { start: 244, kind: "fans",      follow: 0,            move: { z: [1.24, 1.3],  y: [1192, 1184], dy: [0, 2], shake: 5 } },
  { start: 288, kind: "legs",      follow: 0,            move: { z: [1.06, 1.1],  y: [1448, 1440], dy: [0, 0], shake: 5 } },
  { start: 344, kind: "evasive",   follow: 0,            move: { z: [1.32, 1.62], y: [1198, 1152], dy: [0, 4], shake: 8 } },
  { start: 379, kind: "folks",     follow: 0,            move: { z: [1.22, 1.32], y: [1194, 1180], dy: [0, 6], shake: 4 } },
  { start: 387, kind: "prepared",  follow: 0, whip: 2,   move: { z: [1.28, 1.4],  y: [1180, 1172], dy: [0, 4], shake: 6 } },
  { start: 411, kind: "crowd",     follow: 0,            move: { z: [1.2, 1.52],  y: [1182, 1144], dy: [0, 6], shake: 10 } },
  { start: 425, kind: "alright",   follow: 0,            move: { z: [1.62, 1.46], y: [1150, 1166], dy: [0, 2], shake: 6 } },
  { start: 495, kind: "pitspot",   follow: 0,            move: { z: [1.0, 1.14],  y: [1528, 1508], dy: [0, -4], shake: 4 },
    front: BEHIND_CAR, insert: { x: 1090, y: 1650, z: 1.04, at: 0.58 } },
  { start: 532, kind: "back",      follow: 0,            move: { z: [1.18, 1.3],  y: [1212, 1184], dy: [0, 4], shake: 7 } },
  { start: 559, kind: "saying",    follow: RUN * 0.7,    move: { z: [1.22, 1.28], y: [1216, 1206], dy: [-2, 2], shake: 3 } },
  { start: 594, kind: "resource",  follow: 0,            move: { z: [1.32, 1.24], y: [1200, 1206], dy: [0, 4], shake: 3 } },
  { start: 621, kind: "prime",     follow: 0,            move: { z: [1.26, 1.34], y: [1206, 1196], dy: [-2, 2], shake: 3 } },
  { start: 650, kind: "studio",    follow: 0,            move: { z: [1.38, 1.48], y: [1186, 1170], dy: [0, 4], shake: 3 } },
  { start: 685, kind: "youknow",   follow: RUN * 0.5,    move: { z: [1.34, 1.42], y: [1194, 1186], dy: [0, 2], shake: 3 } },
  { start: 713, kind: "bite",      follow: 0, whip: 2,   move: { z: [1.42, 1.6],  y: [1182, 1164], dy: [0, 6], shake: 6 } },
  { start: 735, kind: "perspective", follow: 0,          move: { z: [1.58, 1.72], y: [1164, 1150], dy: [0, 6], shake: 3 } },
  { start: 759, kind: "also",      follow: 0,            move: { z: [1.66, 1.46], y: [1156, 1174], dy: [0, 4], shake: 3 } },
  { start: 776, kind: "ideas",     follow: 0,            move: { z: [1.46, 1.6],  y: [1180, 1166], dy: [0, 4], shake: 4 } },
  { start: 792, kind: "what",      follow: 0,            move: { z: [1.5, 1.9],   y: [1186, 1162], dy: [2, 12], shake: 3 } },
  { start: 803, kind: "payoff",    follow: 0, zoom: true, move: { z: [1.56, 2.3],  y: [1152, 1124], dy: [-4, 18], shake: 5 } },
];
export const SHOTS = SHOT_DEFS.map((d, i) => {
  const next = i + 1 < SHOT_DEFS.length ? SHOT_DEFS[i + 1].start : TOTAL;
  return {
    n: next - d.start, backdrop: "street", ease: d.ease || "lin", follow: d.follow,
    whip: d.whip, zoom: d.zoom, front: d.front, insert: d.insert,
    move: {
      from: { z: d.move.z[0], y: d.move.y[0], dy: d.move.dy[0] },
      to: { z: d.move.z[1], y: d.move.y[1], dy: d.move.dy[1] },
      shake: d.move.shake,
    },
  };
});
const KINDS = SHOT_DEFS.map((d) => d.kind);
const SIDX = {};
SHOT_DEFS.forEach((d, i) => { SIDX[d.kind] = i; });
// ---------------------------------------------------------------- props
// The lens always sits in front of the car's ground line, so the car's front
// half is painted over whatever stands behind it.
const CAR = { kind: "car", x: 1010, y: 1604, scale: 0.98, layer: 1 };
const STREET_PROPS = [
  { kind: "pole", x: 300, y: 1526, h: 860, scale: 0.95, layer: 0 },
  { kind: "trash", x: 820, y: 1530, scale: 0.95, layer: 0 },
  { kind: "hydrant", x: 1420, y: 1570, scale: 1.0, layer: 0 },
  { kind: "wall", x: 1500, y: 1190, w: 520, h: 300, layer: 0, tag: "GO HOME" },
];
function BEHIND_CAR() { return { props: [CAR, ...STREET_PROPS], noCar: true, horde: true }; }
export const FRONT = BEHIND_CAR;

// ---------------------------------------------------------------- camera
// Integrated frame by frame so a tracking shot also pans correctly through a
// whip-pan. Pure: rebuilt from frame 0 on demand.
const CUM = SHOTS.reduce((acc, s) => (acc.push((acc.at(-1) ?? 0) + s.n), acc), []);
const shotIndex = (f) => { for (let i = 0; i < SHOTS.length; i++) if (f < CUM[i]) return i; return SHOTS.length - 1; };
const easeK = (e, k) => (e === "out" ? 1 - (1 - k) ** 3 : e === "in" ? k * k : k);

function camTarget(f) {
  const si = shotIndex(f), s = SHOTS[si], f0 = si ? CUM[si - 1] : 0;
  const k = clamp01((f - f0) / Math.max(1, s.n - 1));
  const e = easeK(s.ease, k);
  const A = s.move.from, B = s.move.to;
  let x = 540, y = A.y + lerp(A.dy ?? 0, B.dy ?? 0, e), z = lerp(A.z, B.z, e);
  if (s.follow) x += (f - f0) * s.follow * 0.22;   // gentle residual drift while tracking (hero stays framed)
  if (s.insert) { const t = smooth((k - s.insert.at) / 0.34); y = lerp(y, s.insert.y, t); z = lerp(z, s.insert.z, t); x = lerp(x, s.insert.x, t); }
  return { x, y, z };
}

let _cam = { upto: -1, x: 540, y: 1200, z: 1.3 };
function camState(f) {
  if (f < _cam.upto) _cam = { upto: -1, x: 540, y: 1200, z: 1.3 };
  for (let i = _cam.upto + 1; i <= f; i++) {
    const si = shotIndex(i), s = SHOTS[si], f0 = si ? CUM[si - 1] : 0, ago = i - f0;
    const tg = camTarget(i), whip = s.whip ?? 5;
    if (si > 0 && ago < whip) {
      const k = smooth(ago / whip), px = _cam.x, py = _cam.y, pz = _cam.z;
      const dirX = Math.sign(tg.x - px) || 1;
      _cam = { upto: i, x: lerp(px, tg.x, k) + Math.sin(k * Math.PI) * 130 * dirX,
        y: lerp(py, tg.y, k) + Math.sin(k * Math.PI) * 36, z: lerp(pz, tg.z, k) * (1 - 0.05 * Math.sin(k * Math.PI)) };
    } else _cam = { upto: i, x: tg.x, y: tg.y, z: tg.z };
  }
  const si = shotIndex(f), s = SHOTS[si], f0 = si ? CUM[si - 1] : 0;
  const k = clamp01((f - f0) / Math.max(1, s.n - 1));
  const sh = s.move.shake ?? 3, zoomP = s.zoom ? smooth((k - 0.45) / 0.55) : 0;
  const x = _cam.x + Math.sin(f * 0.077) * 12 + Math.sin(f * 0.31) * sh * 0.5 + Math.sin(f * 2.3) * sh * zoomP * 1.8;
  const y = _cam.y + Math.cos(f * 0.059) * 9 + Math.cos(f * 0.27) * sh * 0.45 + Math.sin(f * 3.1) * sh * zoomP * 1.5;
  const z = _cam.z + zoomP * 0.1;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 1000) / 1000 };
}
export const camAt = (f) => camState(Math.max(0, Math.min(TOTAL - 1, Math.round(f))));

// the lane/props slide under the lens while he runs (integrated, never jumps)
export function scrollAt(f) {
  const si = shotIndex(f), s = SHOTS[si], f0 = si ? CUM[si - 1] : 0;
  let acc = 0;
  for (let i = 0; i < si; i++) acc += SHOTS[i].follow ? SHOTS[i].follow * SHOTS[i].n * 0.82 : 0;
  return acc + (s.follow ? s.follow * (f - f0) * 0.82 : 0);
}

// ---------------------------------------------------------------- the hero
// One staging entry per shot kind. Poses: hang walksw point up explore climb
// pull reach hip cross chin open. gear: backpack flashlight notebook bottle
// vlog-rig. props.phone (held, screen at lens) / props.bandage (arm patch).
function heroFrame(f, kind, f0, lp) {
  const a = {
    x: 540, y: HERO_GROUND, scale: 1, facing: 0, expr: "scared",
    step: (f * 0.115) % 1, run: 1, L: "walksw", R: "walksw", gear: null,
    headTilt: 0, tilt: 0, bob: Math.sin(f * 0.62) * 0.16, blink: Math.sin(f * 0.041) > 0.982 ? 1 : 0, look: 0,
    props: null, bloodFx: null,
  };
  const RIG = ["vlog-rig"];
  const ph = (h, rot, glow = 1) => ({ phone: { hand: "R", rot, glow } });
  switch (kind) {
    case "hook": // sprinting straight at the lens, selfie rig up, horde on his heels
      a.gear = RIG; a.L = "open"; a.R = "point"; a.tilt = 3 + Math.sin(f * 0.8) * 3;
      a.props = { bandage: { x: 1 } }; a.headTilt = -0.04;
      break;
    case "hey": // host mode, still jogging
      a.gear = RIG; a.expr = "happy"; a.facing = lerp(-0.22, 0.1, lp); a.run = 0.55; a.step = (f * 0.075) % 1;
      a.L = "hang"; a.R = "point"; a.headTilt = Math.sin(f * 0.12) * 0.05;
      break;
    case "vlog": // 3/4 track, thumb over his shoulder at the horde
      a.gear = RIG; a.expr = "happy"; a.facing = 0.4; a.L = "walksw"; a.R = f < M.vlog ? "point" : "hang";
      break;
    case "exploring": // scanning the street like a tour guide
      a.gear = RIG; a.expr = "happy"; a.facing = lerp(0.25, -0.3, lp); a.run = 0.7; a.step = (f * 0.1) % 1;
      a.L = "hang"; a.R = "point";
      break;
    case "cardio": // low lens, legs driving
      a.gear = RIG; a.expr = "happy"; a.facing = 0.12; a.run = 0.85; a.step = (f * 0.155) % 1; a.bob = Math.sin(f * 0.9) * 0.22;
      a.L = "open"; a.R = "point";
      break;
    case "whoa": // the fans are suddenly close
      a.gear = RIG; a.expr = f < M.detour ? "surprised" : "scared"; a.facing = -0.25; a.run = 0.3; a.step = (f * 0.07) % 1;
      a.L = "open"; a.R = "point"; a.tilt = -8 * smooth((f - f0) / 5); a.headTilt = -0.06;
      break;
    case "detour": // backpedals, hands come up, phone jitters
      a.gear = RIG; a.expr = "scared"; a.facing = -0.15; a.run = 0.5; a.step = (f * 0.12) % 1;
      a.L = "open"; a.R = "point"; a.bob = Math.sin(f * 0.9) * 0.2; a.tilt = -5;
      break;
    case "fans": // they lunge, he braces
      a.gear = RIG; a.expr = "scared"; a.facing = -0.1; a.run = 0.35; a.step = (f * 0.09) % 1;
      a.L = "open"; a.R = "point"; a.tilt = -3;
      break;
    case "legs": // INSERT — knees and little zombie hands at the shins, dust
      a.facing = 0.18; a.run = 1; a.step = (f * 0.2) % 1; a.expr = "scared"; a.L = "walksw"; a.R = "walksw";
      a.y = HERO_GROUND + 130; a.bob = Math.sin(f * 1.25) * 0.12;
      break;
    case "evasive": // dizzy spins, phone swinging
      a.gear = RIG; a.expr = "scared"; a.step = (f * 0.17) % 1; a.run = 0.6;
      a.facing = Math.sin((f - f0) * 0.42) * 0.85; a.tilt = Math.cos((f - f0) * 0.42) * 14;
      a.L = "open"; a.R = "point"; a.headTilt = Math.sin((f - f0) * 0.9) * 0.1;
      break;
    case "folks": // squat 3/4, catching his breath mid-sentence
      a.facing = 0.42; a.scale = lerp(1, 0.93, smooth((f - f0) / 8)); a.expr = "happy"; a.run = 0.2;
      a.step = (f * 0.05) % 1; a.L = "hip"; a.R = "point"; a.gear = RIG;
      break;
    case "prepared": // sets up a "lesson", mugging to the lens
      a.gear = RIG; a.facing = 0.3; a.expr = "thinking"; a.run = 0.25; a.step = (f * 0.05) % 1;
      a.R = "point"; a.L = "hip"; a.headTilt = 0.05;
      break;
    case "crowd": // the horde piles on top of him
      a.expr = "surprised"; a.facing = -0.12; a.step = (f * 0.2) % 1; a.run = 0.5;
      a.L = "up"; a.R = "up"; a.tilt = -10; a.bob = Math.sin(f * 1.1) * 0.2; a.gear = null;
      break;
    case "alright": // pulls himself out of the pile
      a.expr = "surprised"; a.L = "open"; a.R = "open"; a.facing = 0.1;
      a.bob = Math.sin(f * 0.7) * 0.14; a.headTilt = 0.08; a.y = HERO_GROUND - 6;
      break;
    case "pitspot": // ducks behind the car with the flashlight
      a.x = 520; a.y = lerp(1700, 1652 + 8 * Math.sin(f * 0.3), smooth((f - f0) / 9)); a.scale = 0.97;
      a.facing = -0.95; a.expr = "scared"; a.L = "explore"; a.R = "pull"; a.cone = 0.9; a.gear = ["flashlight"];
      break;
    case "back": // pops up: "And we're back!"
      a.y = lerp(1640, HERO_GROUND, smooth((f - f0) / 7)); a.facing = lerp(0.18, 0, lp); a.expr = "happy";
      a.L = "open"; a.R = "open"; a.props = { phone: { hand: "R", rot: -12 } };
      break;
    case "saying": // walks out and talks to the phone again
      a.facing = 0.5; a.run = 0.75; a.step = (f * 0.1) % 1; a.expr = "happy"; a.L = "walksw"; a.R = "point";
      a.props = { phone: { hand: "R", rot: -14 } };
      break;
    case "resource": // gestures at the street: "resourcefulness is key"
      a.facing = 0.6; a.run = 0.4; a.step = (f * 0.07) % 1; a.expr = "happy"; a.L = "hip"; a.R = "point";
      a.props = { phone: { hand: "R", rot: -10 } };
      break;
    case "prime": // sweeps the arm across the lot
      a.facing = lerp(0.6, -0.35, lp); a.expr = "happy"; a.L = "hang"; a.R = "point"; a.run = 0.3; a.step = (f * 0.06) % 1;
      a.props = { phone: { hand: "L", rot: -12 } };
      break;
    case "studio": // "a temporary content studio!": arms wide
      a.facing = 0.1; a.expr = "happy"; a.L = "open"; a.R = "open"; a.headTilt = -0.06; a.run = 0.2; a.step = (f * 0.05) % 1;
      break;
    case "youknow": // lowers the phone, goes thoughtful
      a.facing = 0.1; a.expr = "thinking"; a.L = "hang"; a.R = "point"; a.run = 0.25; a.step = (f * 0.05) % 1;
      a.props = { phone: { hand: "R", rot: -6, glow: 0.9 } };
      break;
    case "bite": // the phone drops away, he sees the arm: drip, drip
      a.expr = "surprised"; a.facing = 0.08; a.L = "chin"; a.R = "point"; a.headTilt = 0.08; a.run = 0.12; a.step = (f * 0.04) % 1;
      a.props = { bandage: { x: 1 }, phone: { hand: "R", rot: -42, glow: 0.7 } };
      a.bloodFx = { on: true, k: 0.4, t: f / 30, seed: 2, hand: [672, 1010], drips: 3, trail: [[2, 0.2], [5, 0.32]] };
      break;
    case "perspective": // stares at it, then cold
      a.expr = (f - f0) > 9 ? "scared" : "surprised"; a.facing = 0.04; a.headTilt = 0.11;
      a.L = "chin"; a.R = "point"; a.props = { bandage: { x: 1 }, phone: { hand: "R", rot: -44, glow: 0.7 } };
      a.bloodFx = { on: true, k: 0.55, t: f / 30, seed: 2, hand: [672, 1010], drips: 4, trail: [[2, 0.2], [6, 0.3], [2, 0.42]] };
      break;
    case "also": // hides the arm behind his back, smile snaps on
      a.expr = "happy"; a.facing = 0.16; a.L = "hang"; a.R = "pull";
      a.props = { phone: { hand: "R", rot: -18, glow: 0.9 } };
      a.bloodFx = { on: true, k: 0.62, t: f / 30, seed: 2, hand: [700, 1184], drips: 3, trail: [[2, 0.18], [6, 0.3], [2, 0.44]] };
      break;
    case "ideas": // wide three, arm hidden, phone up
      a.expr = "happy"; a.facing = -0.08; a.L = "open"; a.R = "pull"; a.headTilt = -0.04;
      a.bloodFx = { on: true, k: 0.7, t: f / 30, seed: 2, hand: [700, 1184], drips: 3, trail: [[2, 0.2], [7, 0.32], [2, 0.46]] };
      break;
    case "what": // presentation smile, slow push
      a.expr = "happy"; a.facing = 0.02; a.L = "open"; a.R = "pull"; a.headTilt = -0.05;
      a.props = { phone: { hand: "R", rot: -20 } };
      a.bloodFx = { on: true, k: 0.75, t: f / 30, seed: 2, hand: [700, 1184], drips: 3, trail: [[2, 0.2], [7, 0.34]] };
      break;
    case "payoff": // the arm comes up into the lens, the smile drops
      a.expr = f < M.piece ? "happy" : f < M.you + 4 ? "surprised" : "scared";
      a.facing = 0.03; a.headTilt = 0.12; a.L = "open"; a.R = f < M.audience ? "pull" : "point";
      a.props = { bandage: { x: 1, size: 1.3 }, phone: { hand: "L", rot: -4, glow: 0.6 } };
      a.bloodFx = { on: true, k: 0.9, t: f / 30, seed: 2, hand: [690, 1090], drips: 5, pool: 0.55, trail: [[3, 0.24], [7, 0.36], [3, 0.5]] };
      break;
  }
  return a;
}

// ---------------------------------------------------------------- the horde
// A semicircle of "fans" around him: close on both sides, a pair further back,
// one near figure. Every member lurches, lunge-steps and bobs; they close in
// shot by shot (SPACING) so the chase visibly tightens the whole short.
const FLOCK = [
  { dx: -250, y: 1604, z: 0.9, s: 0.95, ph: 0.0 }, { dx: 250, y: 1600, z: 0.92, s: 0.95, ph: 1.9 },
  { dx: -340, y: 1614, z: 0.74, s: 0.74, ph: 3.2 }, { dx: 340, y: 1620, z: 0.76, s: 0.76, ph: 4.6 },
  { dx: -430, y: 1596, z: 0.62, s: 0.68, ph: 0.8 }, { dx: 430, y: 1592, z: 0.62, s: 0.7, ph: 2.5 },
];
const SPACING = [
  [70, 30], [80, 45], [95, 55], [90, 50], [65, 30], [30, 10], [0, 0], [55, 40], [15, 0],
  [0, 0], [40, 80], [110, 105], [120, 105], [130, 80], [140, 70], [120, 80], [110, 90],
  [100, 95], [80, 85], [70, 85], [60, 90], [45, 95], [40, 100], [35, 100], [30, 100], [25, 100], [20, 100],
];

function hordeAt(f, si, kind, hero) {
  const out = [];
  const [dx, dy] = SPACING[si] || [80, 60];
  const pile = kind === "crowd" || kind === "alright";
  const close = kind === "fans";
  // the fans are placed relative to the HERO's screen spot: his shot centre is 540
  // except where the lens itself is elsewhere (the insert, the pit-stop shot)
  const R = { pitspot: rows => [485, 1600], insert: rows => [1010, 1700] }[kind] || null;
  const fanCx = R ? R()[0] : 540;
  for (let i = 0; i < FLOCK.length; i++) {
    const b = FLOCK[i];
    const ph = b.ph + f * 0.033 * (0.7 + hash(i) * 0.7);
    // lurch: each fan advances and shuffles sideways every beat
    let x = fanCx + b.dx * (1 + dx / 300) + Math.sin(ph * 2.7 + i) * 10;
    let y = b.y + dy * (0.5 + 0.5 * b.z) + Math.sin(ph * 6.4 + i) * 5;
    let z = b.z;
    let run = 0.5 + 0.35 * Math.sin(ph * 2.2 + i);
    let step = (ph * 2.2) % 1;
    const lunge = Math.max(0, Math.sin(ph * 5.1));
    let L = lunge > 0.6 ? "reach" : "walksw";
    let R = lunge > 0.35 ? "reach" : "open";
    let tilt = 4 + Math.sin(ph * 4) * 3;
    let expr = "angry";
    let facing = b.dx < 0 ? 0.5 : -0.5;      // the crowd faces in toward him
    if (close) {
      // they lunge in and their hands land on his shoulders
      const k = smooth((f - CUM[si - 1]) / 7);
      x = lerp(x, hero.x + (b.dx * 0.55) + (dx * 0.3), k); y = lerp(y, hero.y + 26, k * 0.8);
      L = "reach"; R = "reach"; run = 1; step = (f * 0.21 + i * 0.13) % 1; tilt = 11; z = lerp(z, 0.8 + i * 0.035, k);
    } else if (pile) {
      // the pile; then they are thrown off frame when he pulls free
      const pop = kind === "alright" ? smooth((f - CUM[si - 1]) / 8) : 0;
      x = hero.x + (i - 2.5) * 96 - pop * (340 + i * 70) * (i % 2 ? 1 : -1);
      y = hero.y + (i % 3) * 44 - pop * 80; z = 1.16 + (i % 3) * 0.1;
      L = "reach"; R = "reach"; run = 0.1; step = (f * 0.13 + i * 0.3) % 1; tilt = (i - 2.5) * 6; facing = 0.2;
    } else if (kind === "pitspot") {
      // held behind the car: they shuffle around it while he hides
      x = fanCx + b.dx * 1.3 + Math.sin(ph * 2.2 + i) * 18; y = b.y + 120; z = b.z * 0.95; run = 0.3; step = (ph * 1.2) % 1;
    } else if (kind === "payoff" || kind === "what" || kind === "ideas") {
      // they close onto his shoulders by the end of the line
      const k = smooth((f - CUM[si - 1]) / 14);
      x = lerp(x, hero.x + b.dx * 0.62, k * 0.7); y = lerp(y, hero.y + 14, k * 0.6); L = "reach"; R = "reach"; run = 0.8; step = (f * 0.15 + i * 0.2) % 1;
    }
    out.push({
      zombie: true, depth: i * 10 + hash(i) * 5, x, y, scale: b.s * z * 1.05, facing, expr,
      step, run: Math.max(0, Math.min(1, run)), L, R, tilt,
      bob: Math.sin(ph * 6.2 + i) * 0.13, headTilt: Math.sin(ph * 2.7 + i) * 0.06,
    });
  }
  return out;
}

export const actorsAt = (f) => {
  const fi = Math.max(0, Math.min(TOTAL - 1, Math.round(f)));
  const si = shotIndex(fi), kind = KINDS[si], f0 = si ? CUM[si - 1] : 0;
  const lp = (fi - f0) / Math.max(1, SHOTS[si].n);
  const hero = heroFrame(fi, kind, f0, lp);
  const out = [hero];
  let horde = hordeAt(fi, si, kind, hero);
  if (kind === "legs") horde = horde.slice(0, 4).map((m, i) => ({ ...m, scale: 0.5, y: 1790 + i * 26, x: 360 + i * 130 }));
  out.push(...horde);
  return out;
};

// ---------------------------------------------------------------- fx
const si_ = (f) => shotIndex(Math.max(0, Math.min(TOTAL - 1, Math.round(f))));
export const fxAt = (f) => {
  const si = si_(f), s = SHOTS[si], f0 = si ? CUM[si - 1] : 0, ago = f - f0;
  const out = [{ kind: "embers", k: 1 }];
  out.push({ kind: "paper", k: si >= 2 && si <= 8 ? 1 : 0.55 });
  if (s.follow) out.push({ kind: "speed", k: 0.5 + 0.5 * Math.sin(f * 0.45) ** 2, dir: 1 });
  if (si === 0 || si === 6 || si === 8 || si === 12) out.push({ kind: "dust", k: 0.3 + 0.25 * Math.abs(Math.sin(f * 0.4)) });
  if (si > 0 && ago < 2) out.push({ kind: "flash", k: 0.10 * (1 - ago / 2) });
  if (si === SHOTS.length - 1 && f >= M.piece) out.push({ kind: "flash", k: 0.5 * Math.max(0, 1 - (f - M.piece + 1) / 4) });
  return out;
};

// a red pulse when the bite lands, a sick warm grade on the payoff
export const gradeAt = (f) => {
  const si = si_(f), f0 = si ? CUM[si - 1] : 0;
  if (KINDS[si] === "bite") return { tint: "#ff3b2e", a: 0.18 * Math.sin(Math.min(1, (f - f0) / 7) * Math.PI) };
  if (KINDS[si] === "payoff") { const k = clamp01((f - M.piece) / 12); return { tint: "#ff5a3c", a: 0.08 + 0.14 * k, desat: 0.3 * k }; }
  return null;
};

export const CAPTIONS = null;
export const TAG = null;
