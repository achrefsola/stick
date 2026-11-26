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
// Word frames come from the transcript of voice.mp3 (30 fps, whisper word
// timestamps) — see WORD_BEATS. Every cut and every reaction lands on the word
// it belongs to, and the mouth is driven by the same table (voiceAt).

const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- mouth / lip-sync
// viseme: open (jaw) · wide · round · teeth · close (lips part) · none (silent)
const VOWEL = { a: "open", e: "wide", i: "wide", o: "round", u: "round", y: "wide" };
const CONS = "bmpfvwhlrz".split("");
/** frames of a mouth shape for one spoken letter, then a closing dip */
function shapeFor(ch, hold = 2) {
  if (VOWEL[ch]) return { viseme: VOWEL[ch], open: 0.85, hold };
  if (ch === "s" || ch === "t" || ch === "k" || ch === "c" || ch === "g" || ch === "j") return { viseme: "teeth", open: 0.35, hold: Math.max(1, hold - 1) };
  if (CONS.includes(ch)) return { viseme: "close", open: 0.15, hold: Math.max(1, hold - 1) };
  return null;
}
/** Letters of one spoken phrase -> timed silent gaps + timed mouth shapes. */
function lipOf(phr, a, b) {
  const letters = phr.toLowerCase().replace(/[^a-z ']/g, "").split("");
  const slots = letters.map((ch, i) => ({ ch, f: a + (i / letters.length) * (b - a) }));
  // gaps = whitespace only (a word's letters run together); apostrophes are seams inside a word
  const gaps = [], shapes = [];
  const span = b - a;
  for (const sl of slots) {
    if (sl.ch === " ") gaps.push([sl.f, sl.f + span / letters.length]);
    else if (sl.ch === "'") shapes.push({ f: sl.f, viseme: "close", open: 0.15 });
    else { const sh = shapeFor(sl.ch); if (sh) shapes.push({ f: sl.f, ...sh }); }
  }
  // squeeze the gap of a word that is shorter than a blink so it never eats the word
  const shaped = gaps.filter(([x, y]) => y - x > 1.4);
  return { gaps: shaped, shapes };
}

// ---------------------------------------------------------------- word beats
// Every spoken phrase of voice.mp3 with its real start/end frame (transcript +
// word timestamps, 30 fps). The mouth reads the letters in between; a reaction
// always lands 1–2 frames BEFORE the word that causes it.
const PHRASES = [
  ["I'm being chased by zombies!", 0, 50],
  ["And this video is getting zero views?!", 60, 125],
  ["What's up guys?", 141, 165],
  ["Welcome back to my channel.", 170, 203],
  ["Today, we're exploring the city during the zombie apocalypse!", 214, 311],
  ["Don't forget to like and subscribe!", 322, 364],
  ["Oh no!", 372, 387],
  ["They're getting closer!", 394, 422],
  ["Run, run, run!", 429, 458],
  ["Okay.", 475, 483],
  ["I think we're safe.", 497, 518],
  ["Anyway guys, follow for part two!", 533, 588],
  ["Why is my arm bleeding?", 632, 667],
  ["Yes, I'm the content now.", 717, 755],
  ["Like and subscribe.", 776, 805],
];
const SCORE = PHRASES.map(([p, a, b]) => ({ p, a, b, ...lipOf(p, a, b) }));
const inGap = (arr, f) => arr.some(([x, y]) => f >= x && f < y);
/** mouth for frame f: silent when no phrase is being spoken or inside a word gap */
function mouthAt(f) {
  for (const sc of SCORE) {
    if (f < sc.a || f >= sc.b) continue;
    if (inGap(sc.gaps, f)) return null;
    let cur = null;
    for (const sh of sc.shapes) { if (sh.f <= f) cur = sh; else break; }
    return cur;
  }
  return null;
}
// word table: name -> [start, end] in frames
const WORDS = {};
for (const [phr, a, b] of PHRASES) {
  const ws = phr.toLowerCase().replace(/[^a-z' ]/g, "").split(/\s+/).filter(Boolean);
  const total = ws.reduce((n, w) => n + w.length, 0);
  let acc = a;
  for (const w of ws) { const n = (w.length / total) * (b - a); WORDS[w] = [Math.round(acc), Math.round(acc + n)]; acc += n; }
}
const W = (w) => WORDS[w] || [0, 0];
const STRESS = {
  zombies: W("zombies"), views: W("views"), run: W("run"), safe: W("safe"),
  bleeding: W("bleeding"), content: W("content"), subscribe: W("subscribe"),
};
const M = {
  hook: 0,
  iam: W("i'm")[0],                         // "I'm being chased…"
  views: STRESS.views[0],                   // the number complaint
  wsup: W("up")[0],                     // "What's up guys?"
  back: W("back")[0],
  exploring: W("exploring")[0],             // the lane reveal
  zombie: W("zombie")[0],
  apoc: W("apocalypse")[0],
  like: W("like")[0],
  oh: W("oh")[0],
  closer: W("closer")[0],
  run: STRESS.run[0],                       // "Run, run, run!"
  okay: W("okay")[0],
  think: W("think")[0],
  safe: STRESS.safe[0],                     // "safe" — THE safe place
  anyway: W("anyway")[0],
  part: W("part")[0],
  why: W("why")[0],
  arm: W("arm")[0],                         // "my arm"
  bleeding: STRESS.bleeding[0],             // "bleeding" — THE blood
  yes: W("yes")[0],
  content: STRESS.content[0],
  also: W("also")[0],
};
const BEAT = {
  ...M,
  armWord: W("arm")[0],
  bloodWord: STRESS.bleeding[0],
  safeWord: STRESS.safe[0],
  beats: Object.keys(STRESS).map((k) => ({ name: k, at: STRESS[k][0], end: STRESS[k][1] })),
};

const RUN = 17;            // world px/frame for a full sprint
// The safe-place shot: speech drops ~12 dB on "Okay. / I think we're safe." —
// the cut and the room swap happen on "I think", 1 frame before "we're".
const SAFE_SHOT_AT = 496;   // "…we're safe." starts at 508; lands on "I think we're"
const HERO_GROUND = 1588;  // hero soles in the street
const TOTAL = 815;
// ---------------------------------------------------------------- shots
// start = first frame of the shot (word-anchored). n is derived, so the cut
// always lands on the word it belongs to (no picture/voice drift).
const SHOT_DEFS = [
  { start: 0,   kind: "hook",        follow: RUN,        move: { z: [1.58, 1.36], y: [1186, 1196], dy: [6, 16], shake: 9 } },
  { start: 60,  kind: "views",       follow: RUN,        move: { z: [1.34, 1.42], y: [1194, 1182], dy: [0, 4], shake: 6 } },
  { start: 141, kind: "hey",         follow: 0,          move: { z: [1.36, 1.28], y: [1196, 1188], dy: [0, -6], shake: 3 } },
  { start: 170, kind: "vlog",        follow: RUN,        move: { z: [1.18, 1.15], y: [1252, 1262], dy: [0, 8], shake: 3 } },
  { start: 214, kind: "exploring",   follow: RUN * 0.5,  move: { z: [1.2, 1.14],  y: [1244, 1232], dy: [0, 6], shake: 3 } },
  { start: W("zombie")[0], kind: "cardio", follow: RUN * 0.75, move: { z: [1.24, 1.34], y: [1202, 1188], dy: [-2, 2], shake: 5 } },
  { start: 322, kind: "subscribe",   follow: 0,          move: { z: [1.3, 1.22],  y: [1198, 1206], dy: [0, 2], shake: 4 } },
  { start: 372, kind: "ohno",        follow: 0, whip: 3, move: { z: [1.44, 1.62], y: [1178, 1162], dy: [0, 4], shake: 11 } },
  { start: 394, kind: "closer",      follow: 0,          move: { z: [1.46, 1.54], y: [1184, 1172], dy: [0, 4], shake: 8 } },
  { start: 429, kind: "run",         follow: RUN * 1.5,  move: { z: [1.5, 1.34],  y: [1196, 1186], dy: [0, 10], shake: 13 } },
  { start: SAFE_SHOT_AT, kind: "safe", follow: 0,        move: { z: [1.06, 0.98], y: [1230, 1224], dy: [0, 2], shake: 1.2 } },
  { start: 533, kind: "back",        follow: 0,          move: { z: [1.24, 1.34], y: [1204, 1186], dy: [0, 4], shake: 6 } },
  { start: 559, kind: "saying",      follow: RUN * 0.4,  move: { z: [1.22, 1.28], y: [1216, 1206], dy: [-2, 2], shake: 3 } },
  { start: 594, kind: "resource",    follow: 0,          move: { z: [1.32, 1.24], y: [1200, 1206], dy: [0, 4], shake: 3 } },
  { start: 621, kind: "prime",       follow: 0,          move: { z: [1.26, 1.34], y: [1206, 1196], dy: [-2, 2], shake: 3 } },
  { start: M.why, kind: "bleed",     follow: 0, whip: 2, move: { z: [1.3, 1.52],  y: [1200, 1178], dy: [0, 6], shake: 6 } },
  { start: 685, kind: "youknow",     follow: RUN * 0.3,  move: { z: [1.34, 1.42], y: [1194, 1186], dy: [0, 2], shake: 3 } },
  { start: 713, kind: "bite",        follow: 0, whip: 2, move: { z: [1.42, 1.58], y: [1190, 1172], dy: [0, 6], shake: 5 } },
  { start: 759, kind: "also",        follow: 0,          move: { z: [1.46, 1.56], y: [1188, 1176], dy: [0, 4], shake: 3 } },
  { start: 776, kind: "ideas",       follow: 0,          move: { z: [1.5, 1.64],  y: [1186, 1172], dy: [0, 4], shake: 5 } },
  { start: 792, kind: "what",        follow: 0,          move: { z: [1.5, 1.92],  y: [1186, 1162], dy: [2, 12], shake: 8 } },
  { start: 803, kind: "payoff",      follow: 0, zoom: true, move: { z: [1.56, 2.3], y: [1152, 1124], dy: [-4, 18], shake: 10 } },
];
export const SHOTS = SHOT_DEFS.map((d, i) => {
  const next = i + 1 < SHOT_DEFS.length ? SHOT_DEFS[i + 1].start : TOTAL;
  return {
    n: next - d.start, kind: d.kind,
    backdrop: d.kind === "safe" ? "safe" : "street", ease: d.ease || "lin", follow: d.follow,
    whip: d.whip, zoom: d.zoom, front: d.kind === "safe" ? null : d.front, insert: d.insert,
    rescue: d.kind === "safe" ? { x: 540, y: 1180 } : null,
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
  // ramp the shake in over the first frames of a shot: the amplitude changes at a
  // cut while the sine phase is continuous, so an instant step = a visible jolt.
  const shRamp = Math.min(1, (f - f0 + 1) / 5);
  const sh = (s.move.shake ?? 3) * shRamp, zoomP = s.zoom ? smooth((k - 0.45) / 0.55) : 0;
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
//
// Mouth: every hero frame carries a `feel` (the expression it would wear) and the
// viseme block from mouthAt(f), so the mouth talks on the words and falls back to
// the feeling's own mouth shape whenever no letter is playing.
function heroFrame(f, kind, f0, lp) {
  const a = {
    x: 540, y: HERO_GROUND, scale: 1, facing: 0, expr: "scared",
    step: (f * 0.115) % 1, run: 1, L: "walksw", R: "walksw", gear: null,
    headTilt: 0, tilt: 0, bob: Math.sin(f * 0.62) * 0.16, blink: 0, look: 0,
    props: null, bloodFx: null,
  };
  const RIG = ["vlog-rig"];
  switch (kind) {
    case "hook": // sprinting straight at the lens, selfie rig up, horde on his heels
      a.gear = RIG; a.L = "road"; a.R = "roadpoint"; a.tilt = 4 + Math.sin(f * 0.8) * 3;
      a.expr = "surprised"; a.headTilt = -0.04; a.look = -0.2;
      break;
    case "views": // "this video is getting zero views?!" — sprinting, wounded pride
      a.gear = RIG; a.run = 1; a.step = (f * 0.2) % 1; a.facing = 0.12; a.L = "road";
      a.R = f < M.views ? "roadpoint" : "point";
      a.expr = f < M.views ? "surprised" : "angry"; a.tilt = 2 + Math.sin(f * 1.1) * 2; a.look = 0.2;
      break;
    case "hey": // host mode, still jogging up the lane
      a.gear = RIG; a.expr = "happy"; a.facing = lerp(-0.22, 0.1, lp); a.run = 0.8; a.step = (f * 0.16) % 1;
      a.L = "road"; a.R = "point"; a.headTilt = Math.sin(f * 0.12) * 0.05;
      break;
    case "vlog": // 3/4 track, thumb over his shoulder at the horde
      a.gear = RIG; a.expr = "happy"; a.facing = 0.4; a.run = 0.95; a.step = (f * 0.19) % 1;
      a.L = "road"; a.R = f < M.back ? "point" : "roadpoint";
      break;
    case "exploring": // running the tour, scanning the street like a tour guide
      a.gear = RIG; a.expr = "happy"; a.facing = lerp(0.25, -0.3, lp); a.run = 1; a.step = (f * 0.2) % 1;
      a.L = "road"; a.R = "roadpoint";
      break;
    case "cardio": // low lens, legs driving, the first zombie closes on the word
      a.gear = RIG; a.expr = "happy"; a.facing = 0.12; a.run = 1; a.step = (f * 0.23) % 1; a.bob = Math.sin(f * 0.9) * 0.14;
      a.L = "road"; a.R = f < M.zombie ? "roadpoint" : "point";
      if (f >= M.zombie) a.headTilt = -0.05;
      break;
    case "subscribe": // "like and subscribe" — selfie: phone up, eyes ON the screen
      a.gear = RIG; a.expr = "happy"; a.facing = -0.3; a.run = 0.9; a.step = (f * 0.18) % 1;
      a.L = "road"; a.R = "selfie"; a.headTilt = 0.04;
      a.props = { phone: { hand: "R", rot: -26, glow: 0.85 } };
      // gaze tracks the phone in his raised hand (not the lens) — he reads the screen
      a.look = 0.62;
      break;
    case "ohno": // "Oh no!" — the fans are suddenly in the lane
      a.gear = RIG; a.expr = f < M.oh ? "scared" : "surprised"; a.facing = -0.3; a.run = 1; a.step = (f * 0.2) % 1;
      a.L = "open"; a.R = "point"; a.tilt = -8 * smooth((f - f0) / 5); a.headTilt = -0.06; a.look = -0.3;
      break;
    case "closer": // "They're getting closer!" — looks back over his shoulder
      a.gear = RIG; a.expr = "scared"; a.facing = lerp(-0.2, 0.5, smooth((f - f0) / 8));
      a.run = 1; a.step = (f * 0.21) % 1; a.L = "road"; a.R = "point"; a.look = 0.6; a.tilt = -3;
      break;
    case "run": // "Run, run, run!" — full sprint, arms pumping, horde at the heels
      a.gear = RIG; a.expr = "scared"; a.facing = -0.05 + Math.sin(f * 0.5) * 0.08;
      a.run = 1; a.step = (f * 0.26) % 1; a.L = "road"; a.R = "road";
      a.bob = Math.sin(f * 1.15) * 0.14; a.tilt = 8 + Math.sin(f * 0.9) * 3; a.look = 0.15;
      break;
    case "safe": // safe room: he stops, knees soft, hand on his chest
      a.gear = null; a.expr = f < M.safe - 1 ? "tired" : "happy";
      a.x = 540; a.y = lerp(1598, 1592 + 2 * Math.sin(f * 0.22), smooth((f - f0) / 12)); a.scale = 0.8;
      a.facing = lerp(0.3, 0.06, smooth((f - f0) / 16)); a.run = 0; a.step = 0;
      a.L = f < M.safe ? "hip" : "chest";
      a.R = f < M.safe ? "lean" : "point";
      a.bob = Math.sin(f * 0.42) * 0.05; a.headTilt = 0.03; a.look = 0.1;
      a.props = { bandage: { x: 1 } };
      break;
    case "back": // pops up: "Anyway guys…"
      a.gear = RIG; a.expr = "happy"; a.facing = lerp(0.18, 0.05, lp); a.run = 0.55; a.step = (f * 0.11) % 1;
      a.L = "road"; a.R = "point"; a.props = { phone: { hand: "R", rot: -12 } };
      break;
    case "saying": // walks out and talks to the phone again
      a.gear = RIG; a.facing = 0.5; a.run = 0.8; a.step = (f * 0.16) % 1; a.expr = "happy"; a.L = "road"; a.R = "point";
      a.props = { phone: { hand: "R", rot: -14 } };
      break;
    case "resource": // gestures at the street
      a.facing = 0.6; a.run = 0.4; a.step = (f * 0.07) % 1; a.expr = "happy"; a.L = "hip"; a.R = "point";
      a.props = { phone: { hand: "R", rot: -10 } };
      break;
    case "prime": // sweeps the arm across the lot
      a.facing = lerp(0.6, -0.35, lp); a.expr = "happy"; a.L = "hang"; a.R = "point"; a.run = 0.3; a.step = (f * 0.06) % 1;
      a.props = { phone: { hand: "L", rot: -12 } };
      break;
    case "bleed": // "Why is my arm bleeding?" — looks down at the arm ON the word
      a.expr = f < M.arm ? "happy" : f < M.bleeding ? "surprised" : "scared";
      a.facing = 0.08; a.run = 0.12; a.step = (f * 0.04) % 1;
      a.L = "hang"; a.R = f < M.arm ? "pull" : "chin";
      a.headTilt = f < M.arm ? -0.05 : 0.16; a.look = f < M.arm ? 0.2 : -0.75;
      a.props = { bandage: { x: 1 } };
      // the blood arrives exactly on "bleeding" and then pumps with the heartbeat
      a.bloodFx = { on: f >= M.bleeding, k: f < M.bleeding ? 0 : 0.35 + 0.35 * smooth((f - M.bleeding) / 6), pulse: true, t: f / 30, seed: 2, hand: [672, 1010], drips: 2, armSpray: true };
      break;
    case "youknow": // lowers the phone, goes thoughtful
      a.facing = 0.1; a.expr = "thinking"; a.L = "hang"; a.R = "point"; a.run = 0.25; a.step = (f * 0.05) % 1;
      a.props = { phone: { hand: "R", rot: -6, glow: 0.9 }, bandage: { x: 1 } };
      // the phone is the hero here, not the wound: just a slow drip, no spray
      a.bloodFx = { on: true, k: 0.45, pulse: true, t: f / 30, seed: 2, drips: 1 };
      break;
    case "bite": // "Yes, I'm the content now." — shrugs at the wound, smile back on
      a.expr = f < M.content ? "surprised" : "happy";
      a.facing = 0.06; a.L = "chin"; a.R = f < M.content ? "point" : "open";
      a.headTilt = 0.12; a.run = 0.12; a.step = (f * 0.04) % 1;
      a.props = { bandage: { x: 1 }, phone: { hand: "R", rot: -42, glow: 0.7 } };
      a.bloodFx = { on: true, k: 0.7, pulse: true, t: f / 30, seed: 2, hand: [672, 1010], drips: 2, armSpray: true, trail: [[2, 0.2], [5, 0.32]] };
      break;
    case "also": // "Like…" — hides the arm behind his back, smile snaps on
      a.expr = "happy"; a.facing = 0.16; a.L = "hang"; a.R = "pull";
      a.props = { phone: { hand: "R", rot: -18, glow: 0.9 } };
      a.bloodFx = { on: true, k: 0.55, pulse: true, t: f / 30, seed: 2, hand: [700, 1184], drips: 2 };
      break;
    case "ideas": // "and subscribe." — wide three, arm hidden, phone up
      a.expr = "happy"; a.facing = -0.08; a.L = "open"; a.R = "pull"; a.headTilt = -0.04;
      a.props = { phone: { hand: "R", rot: -20 } };
      a.bloodFx = { on: true, k: 0.6, pulse: true, t: f / 30, seed: 2, hand: [700, 1184], drips: 2, trail: [[2, 0.2], [7, 0.32]] };
      break;
    case "what": // presentation smile, slow push
      a.expr = "happy"; a.facing = 0.02; a.L = "open"; a.R = "pull"; a.headTilt = -0.05;
      a.props = { phone: { hand: "R", rot: -22 } };
      a.bloodFx = { on: true, k: 0.7, pulse: true, t: f / 30, seed: 2, hand: [700, 1184], drips: 3, pool: 0.25, trail: [[2, 0.2], [7, 0.34]] };
      break;
    case "payoff": // the arm comes up into the lens, the smile drops
      a.expr = f < M.content ? "happy" : f < M.subscribe ? "surprised" : "scared";
      a.facing = 0.03; a.headTilt = 0.12; a.L = "open"; a.R = f < M.subscribe ? "pull" : "point";
      a.props = { bandage: { x: 1, size: 1.3 }, phone: { hand: "L", rot: -4, glow: 0.6 } };
      a.bloodFx = { on: true, k: 0.9, pulse: true, t: f / 30, seed: 2, hand: [690, 1090], drips: 4, pool: 0.6, trail: [[3, 0.24], [7, 0.36], [3, 0.5]] };
      break;
  }
  // talking mouth on the words; the feeling's own shape is the fallback
  a.feel = a.expr;
  a.viseme = mouthAt(f);
  a.blink = (f % 97) < 3 ? 1 : 0;
  return a;
}

// ---------------------------------------------------------------- the horde
// A real crowd, not two files of figures: six waves on six different ground
// lines (nearer = lower on screen + bigger), so the pack has depth and stays
// dense on BOTH sides of him. Every member lurches, lunge-steps and bobs; they
// close in shot by shot (SPACING) so the chase visibly tightens the whole short.
const PACK = [];
const WAVES = [
  { n: 3, dx: [-330, 0, 330], y: 1596, s: 1.06, spread: 96 },
  { n: 4, dx: [-620, -290, 250, 600], y: 1606, s: 1.0, spread: 120 },
  { n: 4, dx: [-760, -360, 380, 740], y: 1624, s: 0.89, spread: 150 },
  { n: 4, dx: [-880, -470, 430, 900], y: 1650, s: 0.78, spread: 170 },
  { n: 4, dx: [-1000, -560, 520, 1010], y: 1682, s: 0.68, spread: 190 },
  { n: 3, dx: [-1120, 620, 1120], y: 1718, s: 0.6, spread: 210 },
];
WAVES.forEach((wv, wi) => {
  wv.dx.forEach((dx, j) => {
    const h = hash(wi * 17 + j);
    PACK.push({ wave: wi, dx, dy: (wv.y - 1600), y: wv.y, s: wv.s, z: wv.s, spread: wv.spread,
      ph: h * 6.28, near: wi < 2, side: Math.sign(dx),
      // DEPTH: they run at their own speeds, so the frame keeps changing — near waves
      // overtake him (drift toward frame centre), far waves fall behind. A pack that
      // never moves relative to the camera reads as a wallpaper. Differential by wave
      // so near and far rows slide past each other (real parallax, not a rigid wall).
      drift: -(1.6 + h * 2.2) * (1 - wi / 9),
      bobAmp: 0.09 + h * 0.08 });
  });
});
const GAP_OPEN = 235;     // half-width of the lane they leave round the hero
const SPACING = [
  [0.55, 0.18], [0.45, 0.22], [0.30, 0.26], [0.05, 0.30], [0.0, 0.26], [0.0, 0.16],
  [0.0, 0.12], [0.0, 0.06], [0.0, 0.02], [0.0, 0.0], [0.0, 0.0], [0.10, 0.05],
  [0.12, 0.09], [0.16, 0.10], [0.20, 0.12], [0.24, 0.14], [0.40, 0.22], [0.30, 0.16],
  [0.24, 0.12], [0.20, 0.10], [0.14, 0.08], [0.06, 0.04], [0.0, 0.0],
];
// kinds where the pack is right on him (hands land, faces fill the frame)
const ONHIM = { closer: 0.35, run: 0.55, ohno: 0.45, bite: 0.4, also: 0.45, ideas: 0.5, what: 0.65, payoff: 0.8 };

function hordeAt(f, si, kind, hero) {
  const out = [];
  const [dx, dy] = SPACING[si] || [0.2, 0.12];
  const pile = kind === "crowd" || kind === "alright";
  const onHim = ONHIM[kind] ?? 0;
  const f0 = si ? CUM[si - 1] : 0, ago = f - f0;
  const busy = kind === "run" || kind === "hook" || kind === "views" || kind === "safe";
  for (let i = 0; i < PACK.length; i++) {
    const b = PACK[i];
    const ph = b.ph + f * 0.033 * (0.75 + hash(i) * 0.5);
    // lurch: each fan advances and shuffles sideways every beat
    const lane = 1 - 0.55 * clamp01(dx);                    // how much they close INTO the lane
    const px = b.dx * lane;
    // the pack RUNS: a persistent per-member drift (px/frame). Near waves close in on
    // him, far waves fall behind, so bodies enter and leave the frame instead of the
    // whole pack tracking the camera like a backdrop.
    const travel = ago * b.drift;
    const gap = GAP_OPEN * b.s * (1 - 0.25 * clamp01(dx)) * (kind === "legs" ? 2.4 : 1);
    const sideX = px + travel - Math.sign(px || 1) * Math.max(0, gap - Math.abs(px));
    let x = 540 + sideX;
    let y = b.y + dy * (0.5 + 0.5 * b.z) + Math.sin(ph * 6.4 + i) * 5;
    const z = b.z;
    let run = 0.45 + 0.4 * Math.sin(ph * 2.2 + i);
    let step = (ph * 2.2) % 1;
    const lunge = Math.max(0, Math.sin(ph * 5.1));
    let L = lunge > 0.6 ? "reach" : "roadreach";
    let R = lunge > 0.35 ? "reach" : "roadreach";
    let tilt = 5 + Math.sin(ph * 4) * 3;
    let expr = "angry";
    let facing = b.dx < 0 ? 0.5 : -0.5;      // the crowd faces in toward him
    if (busy) { run = 0.95; step = (f * 0.24 + i * 0.17) % 1; tilt = 9 + Math.sin(ph * 5) * 4; }
    // at full sprint they wave their arms; when a hand would land, they grab
    if (onHim > 0 && ago > 4 && b.wave < 4) {
      const k = smooth((ago - 4) / 10) * onHim * (b.wave < 2 ? 1 : 0.5);
      const line = GAP_OPEN * b.z;
      x = lerp(x, hero.x + b.side * Math.max(120, Math.abs(b.dx) * 0.35 * (1 - onHim * 0.35)), k);
      y = lerp(y, hero.y + (b.dy ?? 0) * 0.4, k * 0.7);
      L = "reach"; R = "reach"; run = 1; step = (f * 0.2 + i * 0.13) % 1; tilt = 12;
    }
    if (pile) { // thrown off frame when he pulls free
      const pop = kind === "alright" ? smooth(ago / 8) : 0;
      x = hero.x + (i - 5) * 78 - pop * (340 + i * 40) * (i % 2 ? 1 : -1);
      y = hero.y + (i % 3) * 40 - pop * 80; z = 1.05 + (i % 3) * 0.07;
      L = "reach"; R = "reach"; run = 0.1; step = (f * 0.13 + i * 0.3) % 1; tilt = (i - 5) * 4; facing = 0.2;
    }
    // the two "fans" who lean right over his shoulders (only once the chase is on)
    if (b.wave === 0 && Math.abs(b.dx) < 40 && f >= STRESS.zombies[0]) {
      const k = smooth((f - STRESS.zombies[0]) / 14) * (0.55 + 0.45 * onHim);
      for (const sd of [-1, 1]) out.push({
        zombie: true, depth: 995 + (sd > 0 ? 1 : 0), x: hero.x + sd * (168 - 46 * k), y: hero.y + 34,
        scale: 0.96, facing: sd < 0 ? 0.55 : -0.55, expr: "angry",
        step: (f * 0.2 + (sd > 0 ? 0.4 : 0)) % 1, run: 1, L: "reach", R: "reach", tilt: sd * 9,
        bob: Math.sin(f * 0.7 + sd) * 0.1, headTilt: sd * 0.05, blink: 0, look: -sd * 0.4,
      });
    }
    out.push({
      zombie: true, depth: 600 + i * 10 + hash(i) * 5, x, y, scale: z * 1.02, facing, expr,
      step, run: Math.max(0, Math.min(1, run)), L, R, tilt,
      // DEPTH: air between the waves darkens/hazes the back rows, and every figure
      // gets a ground contact shadow so nobody floats on the road.
      tint: Math.min(0.42, b.wave * 0.062), shadow: true,
      bob: Math.sin(ph * 6.2 + i) * b.bobAmp, headTilt: Math.sin(ph * 2.7 + i) * 0.06,
    });
  }
  return out;
}

// ---------------------------------------------------------------- safe room
export const SAFE_ROOM = {
  shelves: [
    { x: 130, y: 1128, w: 300, h: 320 },
    { x: 830, y: 1140, w: 300, h: 320 },
  ],
  lamp: { x: 205, y: 1120 },
  board: { x: 540, y: 846 },
};

// Two rescue survivors behind the boarded window. They are NOT clones of the
// hero: one wears a head-lamp (bare head + hair), one a dark peaked cap and a
// hi-vis vest. On "safe" the left one crosses to him and hands over a bottle —
// a small, real beat so the room reads as a place with other people in it.
function rescueAt(f, base, hero) {
  if (!base) return [];
  const sy = base.y + 196;
  const reach = smooth((f - (M.safe - 2)) / 20);          // 0 before the word, 1 after
  // the helper steps toward the hero, then STOPS short and offers the bottle
  // (he must never walk into the hero's silhouette)
  const helperX = 540 - 262 + reach * 96;
  return [
    { zombie: false, depth: 900, base: sy, x: helperX, y: sy, scale: 0.62,
      facing: lerp(-0.1, 0.5, reach), expr: "happy",
      step: 0, run: 0, cap: "lamp", vest: false,
      L: "hang", R: reach > 0.15 ? "offer" : "kayak", tilt: 4,
      props: null,
      bob: Math.sin(f * 0.08) * 0.03, headTilt: -0.03 * reach, blink: 0,
      look: lerp(0.25, 0.55, reach) },
    { zombie: false, depth: 910, base: sy, x: 540 + 268, y: sy, scale: 0.6,
      facing: -0.2, expr: "relieved", step: 0, run: 0, cap: "visor", vest: true,
      L: "kayak", R: "point", tilt: -4,
      bob: Math.sin(f * 0.08 + 2) * 0.03, headTilt: 0, blink: 0, look: -0.15 },
  ];
}

export const actorsAt = (f) => {
  const fi = Math.max(0, Math.min(TOTAL - 1, Math.round(f)));
  const si = shotIndex(fi), kind = KINDS[si], f0 = si ? CUM[si - 1] : 0;
  const lp = (fi - f0) / Math.max(1, SHOTS[si].n);
  const hero = heroFrame(fi, kind, f0, lp);
  const out = [hero];
  if (kind === "safe") { out.push(...rescueAt(fi, SHOTS[si].rescue, hero)); return out; }
  let horde = hordeAt(fi, si, kind, hero);
  if (kind === "legs") horde = horde.slice(0, 6).map((m, i) => ({ ...m, scale: 0.46 + i * 0.03, y: 1800 + i * 18, x: 300 + i * 96 }));
  out.push(...horde);
  return out;
};

// ---------------------------------------------------------------- fx
const si_ = (f) => shotIndex(Math.max(0, Math.min(TOTAL - 1, Math.round(f))));
export const fxAt = (f) => {
  const si = si_(f), s = SHOTS[si], kind = KINDS[si], f0 = si ? CUM[si - 1] : 0, ago = f - f0;
  const out = [];
  if (kind === "safe") {
    out.push({ kind: "dustmotes", k: 1 }, { kind: "safelight", k: 1 });
    return out;                                                     // calm, clean: no fire, no grain storm
  }
  out.push({ kind: "embers", k: 1 });
  out.push({ kind: "paper", k: si <= 7 ? 1 : 0.55 });
  // the run: speed lines plus sprayed gravel + dust puffs at the soles
  if (s.follow || ONHIM[kind]) out.push({ kind: "speed", k: 0.5 + 0.5 * Math.sin(f * 0.45) ** 2, dir: 1 });
  if (kind === "run") { out.push({ kind: "grit", k: 0.9 }); out.push({ kind: "dust", k: 0.2 + 0.2 * Math.abs(Math.sin(f * 0.6)) }); }
  if (kind === "hook" || kind === "ohno" || kind === "closer") out.push({ kind: "dust", k: 0.3 + 0.25 * Math.abs(Math.sin(f * 0.4)) });
  if (si > 0 && ago < 2) out.push({ kind: "flash", k: 0.08 * (1 - ago / 2) });
  // the blood starts on "bleeding": a short red flash exactly on the word
  if (f >= STRESS.bleeding[0] && f < STRESS.bleeding[0] + 3) out.push({ kind: "tint", col: "#ff2d20", a: 0.3 * (1 - (f - STRESS.bleeding[0]) / 3) });
  if (si === SHOTS.length - 1 && f >= M.subscribe) out.push({ kind: "flash", k: 0.4 * Math.max(0, 1 - (f - M.subscribe + 1) / 4) });
  return out;
};

// a red pulse on the word "bleeding", a sick warm grade on the payoff
export const gradeAt = (f) => {
  const si = si_(f), kind = KINDS[si];
  const [bs, be] = STRESS.bleeding;
  if (f >= bs && f < be + 8) { const k = clamp01((f - bs) / (be + 8 - bs)); return { tint: "#ff3b2e", a: 0.22 * Math.sin(k * Math.PI) }; }
  if (kind === "payoff") { const k = clamp01((f - M.content) / 14); return { tint: "#ff5a3c", a: 0.08 + 0.14 * k, desat: 0.3 * k }; }
  return null;
};

export const CAPTIONS = null;
