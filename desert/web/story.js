// Story: "Would You Walk or Wait?" — a desert survival dilemma, stickman short.
// Character is ALWAYS the reference stick man (web/stickman.js) — the hero is the
// "you" of the dilemma. Pure functions of the frame (any render order).
//
// Why this staging moves:
//  - every shot carries a camera move (handheld drift, slow push, tilt, whip-pan)
//  - the world scrolls: the hero walks and the sand/road slide under him (scrollAt)
//  - props are depth-split (wreck / beacon / dune ridge / road), so he can sit in
//    the wreck's shade and stand behind its fuselage
//  - the LED payoff (the metal plate flashing) is a prop whose glow is driven by
//    the words, so the beacon pulses ON the line "reflect the sunlight".
// Word frames come from the transcript of voice.mp3 (30 fps, faster-whisper word
// timestamps) — see PHRASES. Every cut and every reaction lands on the word it
// belongs to, and the hero's mouth is driven by the same table (mouthAt).

const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- mouth / lip-sync
const VOWEL = { a: "open", e: "wide", i: "wide", o: "round", u: "round", y: "wide" };
const CONS = "bmpfvwhlrz".split("");
function shapeFor(ch, hold = 2) {
  if (VOWEL[ch]) return { viseme: VOWEL[ch], open: 0.85, hold };
  if ("stkcgj".includes(ch)) return { viseme: "teeth", open: 0.35, hold: Math.max(1, hold - 1) };
  if (CONS.includes(ch)) return { viseme: "close", open: 0.15, hold: Math.max(1, hold - 1) };
  return null;
}
function lipOf(phr, a, b) {
  const letters = phr.toLowerCase().replace(/[^a-z ']/g, "").split("");
  const span = b - a;
  const slots = letters.map((ch, i) => ({ ch, f: a + (i / letters.length) * span }));
  const gaps = [], shapes = [];
  for (const sl of slots) {
    if (sl.ch === " ") gaps.push([sl.f, sl.f + span / letters.length]);
    else if (sl.ch === "'") shapes.push({ f: sl.f, viseme: "close", open: 0.15 });
    else { const sh = shapeFor(sl.ch); if (sh) shapes.push({ f: sl.f, ...sh }); }
  }
  return { gaps: gaps.filter(([x, y]) => y - x > 1.4), shapes };
}

// ---------------------------------------------------------------- word beats
// Word frames from the transcript of voice.mp3 (faster-whisper base.en word
// timestamps, 30 fps). The narration is a single narrator, so the hero's mouth
// moves on the words as the storyteller's "you".
const PHRASES = [
  ["Your plane just crashed in the middle of the desert.", 0, 69],
  ["The nearest road is two miles away.", 91, 146],
  ["The sun is setting and you have one bottle of water.", 167, 253],
  ["You can walk toward the road hoping someone finds you before darkness.", 274, 375],
  ["Or stay beside the wreck and wait for a rescue that might never come.", 398, 508],
  ["One decision could save your life.", 527, 576],
  ["The other could leave you stranded in the desert.", 595, 655],
  ["What would you choose?", 713, 734],
  ["You start walking.", 753, 778],
  ["At first the road seems close but the sand slows every step.", 800, 932],
  ["The sun disappears.", 949, 976],
  ["And when you finally reach the road there's nobody there.", 999, 1084],
  ["You decide to stay.", 1113, 1139],
  ["The wreck gives you some shade.", 1162, 1192],
  ["You use a piece of metal to reflect the sunlight toward the horizon.", 1210, 1294],
  ["Hours pass.", 1314, 1330],
  ["Then at sunrise a search plane appears.", 1390, 1474],
  ["But from thousands of feet above which survivor is easier to find?", 1496, 1609],
  ["The one beside the wreck or the one who walked away?", 1623, 1697],
  ["Would you walk or wait?", 1697, 1757],
];
const SCORE = PHRASES.map(([p, a, b]) => ({ p, a, b, ...lipOf(p, a, b) }));
const inGap = (arr, f) => arr.some(([x, y]) => f >= x && f < y);
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
// word table: name -> [start, end] in frames (from the transcript)
const WORDS = {};
for (const [phr, a, b] of PHRASES) {
  const ws = phr.toLowerCase().replace(/[^a-z' ]/g, "").split(/\s+/).filter(Boolean);
  const total = ws.reduce((n, w) => n + w.length, 0);
  let acc = a;
  for (const w of ws) { const n = (w.length / total) * (b - a); WORDS[w] = [Math.round(acc), Math.round(acc + n)]; acc += n; }
}
const W = (w) => WORDS[w] || [0, 0];
const M = {
  crashed: W("crashed")[0],
  road: W("road")[0],
  sun: W("sun")[0],
  water: W("water")[0],
  walk: W("walk")[0],
  stay: W("stay")[0],
  save: W("save")[0],
  stranded: W("stranded")[0],
  choose: W("choose")[0],
  walking: W("walking")[0],
  sand: W("sand")[0],
  disappears: W("disappears")[0],
  nobody: W("nobody")[0],
  shade: W("shade")[0],
  reflect: W("reflect")[0],
  sunlight: W("sunlight")[0],
  horizon: W("horizon")[0],
  pass: W("pass")[0],
  sunrise: W("sunrise")[0],
  plane: W("plane")[0],
  survivor: W("survivor")[0],
  wreck: W("wreck")[0],
  wait: W("wait")[0],
  metal: W("metal")[0],
};

const TOTAL = 1770;                 // round(59.01 s × 30)
const HERO_GROUND = 1560;           // hero soles on the sand (in world px)
const RUN = 15;                     // world px/frame for a full run

// ---------------------------------------------------------------- shots
// start = the first frame of each shot (word-anchored), so a cut always lands on
// the word it belongs to. n is derived from the next shot's start.
const SHOT_DEFS = [
  { start: 0,     kind: "hook",    backdrop: "crash",   move: { z: [1.08, 1.20], y: [1240, 1232], dy: [0, -6], shake: 3 } },
  { start: 91,    kind: "wide",    backdrop: "crash",   move: { z: [1.16, 0.92], y: [1250, 1206], dy: [0, -8], shake: 3 } },
  { start: 167,   kind: "bottle",  backdrop: "crash",   move: { z: [0.98, 1.10], y: [1270, 1262], dy: [0, 2], shake: 2 } },
  { start: 274,   kind: "toward",  backdrop: "dune",    move: { z: [0.98, 0.90], y: [1300, 1290], dy: [0, 2], shake: 3 } },
  { start: 398,   kind: "beside",  backdrop: "crash",   whip: 3, move: { z: [1.04, 1.14], y: [1276, 1262], dy: [0, 4], shake: 4 } },
  { start: 527,   kind: "fork",    backdrop: "crash",   move: { z: [1.14, 1.24], y: [1240, 1228], dy: [0, 4], shake: 3 } },
  { start: 595,   kind: "alone",   backdrop: "dune",    move: { z: [0.92, 0.86], y: [1280, 1292], dy: [0, 2], shake: 3 } },
  { start: 713,   kind: "choose",  backdrop: "crash",   move: { z: [1.22, 1.40], y: [1186, 1150], dy: [0, 6], shake: 6 } },
  { start: 753,   kind: "walk",    backdrop: "dune",    follow: RUN,        move: { z: [1.00, 0.96], y: [1320, 1330], dy: [0, 4], shake: 4 } },
  { start: 800,   kind: "slog",    backdrop: "dune",    follow: RUN * 0.8,  move: { z: [0.98, 1.04], y: [1330, 1320], dy: [0, 4], shake: 5 } },
  { start: 949,   kind: "dusk",    backdrop: "dusk",    move: { z: [1.05, 1.00], y: [1300, 1310], dy: [0, 2], shake: 3 } },
  { start: 999,   kind: "empty",   backdrop: "road",    move: { z: [1.02, 1.10], y: [1290, 1282], dy: [0, 4], shake: 4 } },
  { start: 1113,  kind: "return",  backdrop: "crash",   whip: 3, move: { z: [1.10, 1.04], y: [1268, 1278], dy: [0, 2], shake: 3 } },
  { start: 1162,  kind: "shade",   backdrop: "crash",   move: { z: [0.98, 1.06], y: [1290, 1276], dy: [0, 2], shake: 2 } },
  { start: 1210,  kind: "mirror",  backdrop: "crash",   move: { z: [1.06, 1.22], y: [1280, 1250], dy: [0, 4], shake: 3 } },
  { start: 1314,  kind: "hours",   backdrop: "crash",   move: { z: [0.92, 0.88], y: [1260, 1268], dy: [0, 2], shake: 2 } },
  { start: 1390,  kind: "plane",   backdrop: "dawn",    move: { z: [0.90, 1.00], y: [1280, 1272], dy: [0, -8], shake: 4 } },
  { start: 1496,  kind: "above",   backdrop: "pv",      move: { z: [0.90, 0.98], y: [1180, 1160], dy: [0, 0], shake: 5 } },
  { start: 1623,  kind: "compare", backdrop: "compare", move: { z: [1.00, 1.06], y: [1300, 1296], dy: [0, 2], shake: 3 } },
  { start: 1697,  kind: "reveal",  backdrop: "crash",   move: { z: [1.08, 1.22], y: [1288, 1248], dy: [0, 2], shake: 6 }, zoom: true },
];
export const SHOTS = SHOT_DEFS.map((d, i) => {
  const next = i + 1 < SHOT_DEFS.length ? SHOT_DEFS[i + 1].start : TOTAL;
  return {
    n: next - d.start, kind: d.kind, backdrop: d.backdrop, ease: d.ease || "lin",
    follow: d.follow, whip: d.whip, zoom: d.zoom,
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
// The wreck is a depth-split prop: its BACK half is painted below the actors, its
// FRONT half around the near actors, so the hero can sit in the fuselage's shade
// or walk behind the wing. The beacon (the metal plate) is where the payoff
// happens, so its glow is passed in per frame by the story FX/Front args.
const WRECK = { kind: "wreck", x: 700, y: 1582, scale: 1.45, layer: 0, back: true };
const WING  = { kind: "wreck", x: 700, y: 1582, scale: 1.45, layer: 1 };
const BEACON = { kind: "beacon", x: 292, y: 1584, scale: 1.45, glow: 0, layer: 0 };
const CAIRN  = { kind: "cairn", x: 980, y: 1560, scale: 1.0, layer: 1 };
// Scenery: the dunes and the highway are painted by the BACKDROPS (flat layers,
// like the street's road) — props are only the story objects (wreck, beacon, cairn).
const ROAD = null;
const DUNES = [];
export const FRONT = { props: [WRECK, BEACON, WING, CAIRN] };
function frontFor(kind, glow) {
  switch (kind) {
    case "walk": case "slog": case "toward": case "alone": case "dusk":
      return { props: [], noScatter: false };
    case "empty":             return { props: [{ kind: "cairn", x: 190, y: 1620, scale: 1.3, layer: 1 }], noScatter: false };
    case "dawn":              return { props: [], noScatter: true };
    case "above":             return { props: [] };
    case "compare":           return { props: [] };
    case "shade": case "mirror": case "hours": case "reveal":
      return { props: [WRECK, { ...BEACON, glow }, WING, CAIRN] };
    default:                  return { props: [WRECK, { ...BEACON, glow }, WING, CAIRN] };
  }
}
export const FRONT_OVER = true;   // the plane (layer 2) draws over the hero on the dawn shot

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
  if (s.follow) x += (f - f0) * s.follow * 0.22;   // gentle residual drift while tracking
  return { x, y, z };
}

let _cam = { upto: -1, x: 540, y: 1300, z: 1.1 };
function camState(f) {
  if (f < _cam.upto) _cam = { upto: -1, x: 540, y: 1300, z: 1.1 };
  for (let i = _cam.upto + 1; i <= f; i++) {
    const si = shotIndex(i), s = SHOTS[si], f0 = si ? CUM[si - 1] : 0, ago = i - f0;
    const tg = camTarget(i), whip = s.whip ?? 5;
    if (si > 0 && ago < whip) {
      const k = smooth(ago / whip), px = _cam.x, py = _cam.y, pz = _cam.z;
      const dirX = Math.sign(tg.x - px) || 1;
      _cam = { upto: i, x: lerp(px, tg.x, k) + Math.sin(k * Math.PI) * 120 * dirX,
        y: lerp(py, tg.y, k) + Math.sin(k * Math.PI) * 30, z: lerp(pz, tg.z, k) * (1 - 0.05 * Math.sin(k * Math.PI)) };
    } else _cam = { upto: i, x: tg.x, y: tg.y, z: tg.z };
  }
  const si = shotIndex(f), s = SHOTS[si], f0 = si ? CUM[si - 1] : 0;
  const k = clamp01((f - f0) / Math.max(1, s.n - 1));
  const shRamp = Math.min(1, (f - f0 + 1) / 5);
  const sh = (s.move.shake ?? 3) * shRamp, zoomP = s.zoom ? smooth((k - 0.45) / 0.55) : 0;
  const x = _cam.x + Math.sin(f * 0.077) * 10 + Math.sin(f * 0.31) * sh * 0.5 + Math.sin(f * 2.3) * sh * zoomP * 1.8;
  const y = _cam.y + Math.cos(f * 0.059) * 8 + Math.cos(f * 0.27) * sh * 0.45 + Math.sin(f * 3.1) * sh * zoomP * 1.5;
  const z = _cam.z + zoomP * 0.1;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 1000) / 1000 };
}
export const camAt = (f) => camState(Math.max(0, Math.min(TOTAL - 1, Math.round(f))));

// the sand/road slides under the lens while he walks (integrated, never jumps)
export function scrollAt(f) {
  const si = shotIndex(f), s = SHOTS[si], f0 = si ? CUM[si - 1] : 0;
  let acc = 0;
  for (let i = 0; i < si; i++) acc += SHOTS[i].follow ? SHOTS[i].follow * SHOTS[i].n * 0.82 : 0;
  return acc + (s.follow ? s.follow * (f - f0) * 0.82 : 0);
}

// The beacon glow: the metal plate catches the sun and flashes in a slow pulse.
// It only exists once he has propped it up (the "reflect" line), and the flash ON
// the word "sunlight" is the sharpest beat of the short — so the glow is word-driven.
function beaconGlow(f) {
  if (f < M.reflect) return 0;
  const pulse = 0.55 + 0.45 * Math.sin(f * 0.42);
  const bornWord = f >= M.sunlight && f < M.sunlight + 4 ? 1 : 0;   // hard flash on "sunlight"
  const settle = clamp01((f - M.reflect) / 10);
  const fade = f > M.pass ? Math.max(0.35, 1 - (f - M.pass) / 260) : 1;
  return Math.min(1, (0.25 + 0.6 * pulse) * settle * fade + bornWord * 0.9);
}

// ---------------------------------------------------------------- the hero
// One staging entry per shot kind. Poses: hang walksw point up explore climb pull
// reach hip cross chin open + road / roadpoint (walk swings) + chest.
function heroFrame(f, kind, f0, lp) {
  const a = {
    x: 540, y: HERO_GROUND, scale: 1, facing: 0, expr: "neutral",
    step: (f * 0.09) % 1, run: 0, L: "hang", R: "hang", gear: null,
    headTilt: 0, tilt: 0, bob: 0, blink: 0, look: 0, props: null,
  };
  switch (kind) {
    case "hook":   // sitting dazed by the wreck, the plane still smoking behind him
      a.scale = 1.06; a.y = HERO_GROUND + 6; a.facing = 0.12; a.expr = "surprised";
      a.L = "hip"; a.R = "reach"; a.tilt = -4; a.headTilt = -0.05;
      a.bob = Math.sin(f * 0.5) * 0.03; a.look = -0.25;
      break;
    case "wide":   // stands and looks out over the flats toward the road
      a.scale = 1.0; a.facing = lerp(0.5, 0.28, lp); a.expr = "tired";
      a.L = "hang"; a.R = "chin"; a.headTilt = 0.05; a.look = 0.5;
      break;
    case "bottle": // holds the one bottle up to the low sun
      a.scale = 1.04; a.facing = 0.08; a.expr = "tired";
      a.L = "hang"; a.R = "up"; a.props = { bottle: { x: 1 } };
      a.bob = Math.sin(f * 0.4) * 0.03; a.headTilt = -0.04; a.look = -0.35;
      break;
    case "toward": // turns and points down the long walk toward the road
      a.scale = 0.98; a.facing = lerp(-0.4, 0.5, smooth(lp)); a.expr = "neutral";
      a.L = "hang"; a.R = f < M.walk ? "chin" : "point"; a.look = 0.6;
      break;
    case "beside": // crouches beside the wing, weighing the wait
      a.scale = 1.02; a.facing = 0.32; a.expr = "thinking";
      a.L = "hip"; a.R = "chin"; a.bob = Math.sin(f * 0.3) * 0.03; a.headTilt = 0.04;
      break;
    case "fork":   // stands at the fork where two tracks leave the camp
      a.scale = 1.1; a.facing = 0.06; a.expr = "thinking";
      a.L = "cross"; a.R = "chin"; a.headTilt = 0.05; a.look = 0.1;
      break;
    case "alone":  // a tiny figure in an ocean of sand, frightened
      a.scale = 0.72; a.y = HERO_GROUND + 10; a.facing = -0.2; a.expr = "scared";
      a.L = "hang"; a.R = "hang"; a.bob = Math.sin(f * 0.6) * 0.03;
      break;
    case "choose": // looks straight at the lens — the question is for the viewer
      a.scale = 1.12; a.facing = lerp(0.2, 0.0, smooth(lp)); a.expr = "surprised";
      a.L = "hang"; a.R = "open"; a.headTilt = -0.03; a.look = 0;
      break;
    case "walk":   // strides off into the dunes, walksw arms
      a.scale = 0.9; a.facing = 0.9; a.expr = "neutral";
      a.run = 0.35; a.step = (f * 0.14) % 1; a.L = "walksw"; a.R = "walksw";
      a.tilt = 5 + Math.sin(f * 0.7) * 2; a.bob = Math.sin(f * 0.85) * 0.05;
      break;
    case "slog":   // the sand fights every step: leaning, arms heavy
      a.scale = 0.92; a.facing = 0.85; a.expr = "tired";
      a.run = 0.5; a.step = (f * 0.2) % 1; a.L = "walksw"; a.R = "road";
      a.tilt = 11 + Math.sin(f * 0.9) * 3; a.bob = Math.sin(f * 1.1) * 0.06; a.look = 0.3;
      break;
    case "dusk":   // the sun drops out; he is a silhouette standing still
      a.scale = 0.98; a.facing = 0.3; a.expr = "tired";
      a.L = "hang"; a.R = "hang"; a.bob = Math.sin(f * 0.3) * 0.02; a.look = 0.2;
      break;
    case "empty":  // reaches the road: nobody there — down on his knees
      a.scale = 1.0; a.y = HERO_GROUND + (f < M.nobody ? 0 : 26 * smooth((f - M.nobody) / 12));
      a.facing = 0.18; a.expr = f < M.nobody ? "tired" : "sad";
      a.L = f < M.nobody ? "hang" : "pull"; a.R = f < M.nobody ? "reach" : "hip";
      a.tilt = f < M.nobody ? 2 : -8 * smooth((f - M.nobody) / 12);
      a.headTilt = f < M.nobody ? 0.02 : 0.12; a.bob = Math.sin(f * 0.4) * 0.03;
      break;
    case "return": // trudges back to the wreck: the walk was a mistake
      a.scale = 0.96; a.facing = -0.7; a.expr = "sad";
      a.run = 0.3; a.step = (f * 0.12) % 1; a.L = "walksw"; a.R = "walksw";
      a.tilt = 6 + Math.sin(f * 0.6) * 2; a.look = -0.3;
      break;
    case "shade":  // sits in the wing's shade: relief, a slow breath
      a.scale = 1.0; a.y = HERO_GROUND + 20; a.facing = 0.24; a.expr = "relieved";
      a.L = "hip"; a.R = "chest"; a.bob = Math.sin(f * 0.32) * 0.04; a.headTilt = 0.05; a.look = 0.2;
      break;
    case "mirror": // holds the metal plate up and searches the horizon (the prop glows)
      a.scale = 1.06; a.x = 360; a.facing = lerp(0.4, 0.12, smooth(lp)); a.expr = "thinking";
      a.L = "hang"; a.R = f < M.metal ? "chin" : "up"; a.headTilt = -0.04; a.look = -0.55;
      break;
    case "hours":  // waiting, small under a wheeling sun
      a.scale = 0.9; a.x = 400; a.y = HERO_GROUND + 14; a.facing = 0.16; a.expr = "tired";
      a.L = "hip"; a.R = "chin"; a.bob = Math.sin(f * 0.28) * 0.03; a.headTilt = 0.06; a.look = -0.35;
      break;
    case "plane":  // dawn: he jumps up and waves both arms at the plane
      a.scale = 1.02; a.facing = 0.0; a.expr = f < M.sunrise ? "surprised" : "happy";
      a.L = "up"; a.R = "up"; a.bob = Math.abs(Math.sin(f * 0.5)) * 0.08; a.headTilt = -0.06; a.look = -0.2;
      break;
    case "above":  break;   // no hero in the plane's POV
    case "compare": break;  // two figures are staged below
    case "reveal": // the payoff: he stands by the beacon as the plane banks over
      a.scale = 1.1; a.facing = lerp(0.3, 0.05, smooth(lp)); a.expr = "relieved";
      a.L = "hip"; a.R = "point"; a.headTilt = -0.03; a.bob = Math.sin(f * 0.4) * 0.03; a.look = -0.15;
      break;
  }
  a.feel = a.expr;
  a.viseme = mouthAt(f);
  a.blink = (f % 97) < 3 ? 1 : 0;
  return a;
}

// ---------------------------------------------------------------- the others
// The short's twist is that the SAME person can be two survivors. For the aerial
// and the compare shots we stage the two possible outcomes as far-away figures:
// one sitting by the wreck, one a tiny mark on the empty road. They are the hero's
// body at depth with an aerial tint, never clones with their own design.
function outcomeFigures(f, kind) {
  if (kind === "above") {
    // the plane's POV: two figures far below — the wreck camp (left) and a lone
    // walker (right). Both are small, hazily tinted, with long low shadows.
    return [
      { x: 360, y: 1560, scale: 0.5, facing: 0.1, expr: "relieved", L: "hip", R: "chest",
        step: 0, run: 0, tilt: 0, bob: Math.sin(f * 0.2) * 0.02, blink: 0, look: 0.1,
        tint: 0, shadow: true },
      { x: 860, y: 1600, scale: 0.34, facing: 0.9, expr: "tired", L: "walksw", R: "walksw",
        step: (f * 0.16) % 1, run: 0.5, tilt: 8, bob: Math.sin(f * 0.9) * 0.05, blink: 0, look: 0,
        tint: 0, shadow: true },
    ];
  }
  if (kind === "compare") {
    return [
      // left panel: he stayed — alive under the wing, the plate up
      { x: 268, y: 1560, scale: 1.02, facing: 0.16, expr: "relieved", L: "hip", R: "chest",
        step: 0, run: 0, tilt: 0, bob: Math.sin(f * 0.3) * 0.03, blink: 0, look: 0.15, shadow: true },
      // right panel: he walked — a small figure far off on the empty road
      { x: 830, y: 1596, scale: 0.46, facing: 0.9, expr: "tired", L: "walksw", R: "walksw",
        step: (f * 0.15) % 1, run: 0.4, tilt: 7, bob: Math.sin(f * 0.8) * 0.04, blink: 0, look: 0,
        tint: 0, shadow: true },
    ];
  }
  return [];
}

export const actorsAt = (f) => {
  const fi = Math.max(0, Math.min(TOTAL - 1, Math.round(f)));
  const si = shotIndex(fi), kind = KINDS[si], f0 = si ? CUM[si - 1] : 0;
  const lp = (fi - f0) / Math.max(1, SHOTS[si].n);
  const out = [];
  if (kind !== "above" && kind !== "compare") out.push(heroFrame(fi, kind, f0, lp));
  else out.push(...outcomeFigures(fi, kind));
  return out;
};

// The search plane is a screen-space prop (it is sky, not ground), driven here so
// its bank/size follow the words. It is exposed through FRONT's prop list.
export function planeProp(f) {
  const k = clamp01((f - M.sunrise) / 46);
  return { kind: "plane", x: lerp(200, 940, k), y: lerp(560, 470, k), scale: 0.55 + 0.25 * k,
    bank: Math.sin(f * 0.05) * 0.12, t: f / 30, layer: 2 };
}

// frontAt: the prop bundle for this frame (the beacon glow is derived from f, and
// the plane rides in the "plane" shot's sky).
export function frontAt(f) {
  const fi = Math.max(0, Math.min(TOTAL - 1, Math.round(f)));
  const si = shotIndex(fi), kind = KINDS[si];
  const base = frontFor(kind, beaconGlow(fi));
  if (kind === "plane" && fi >= M.sunrise - 4) base.props = [...(base.props || []), planeProp(fi)];
  return base;
}

// ---------------------------------------------------------------- fx
const si_ = (f) => shotIndex(Math.max(0, Math.min(TOTAL - 1, Math.round(f))));
export const fxAt = (f) => {
  const si = si_(f), s = SHOTS[si], kind = KINDS[si], f0 = si ? CUM[si - 1] : 0, ago = f - f0;
  const out = [];
  // a thin dust/haze layer everywhere; heavier where he moves
  out.push({ kind: "dust", k: 0.12 + 0.08 * Math.abs(Math.sin(f * 0.25)) });
  if (s.follow) out.push({ kind: "grit", k: 0.7 });
  if (kind === "walk" || kind === "slog") out.push({ kind: "grit", k: 0.55 });
  // heat shimmer + blown sand on the hot shots
  if (kind === "toward" || kind === "alone" || kind === "slog") out.push({ kind: "dust", k: 0.35 });
  // the beacon: a bright warm flash exactly on "sunlight"
  const g0 = beaconGlow(f);
  if (g0 > 0.6) out.push({ kind: "flash", k: 0.045 * (g0 - 0.6) / 0.4 });
  if (f >= M.sunlight && f < M.sunlight + 4) out.push({ kind: "tint", col: "#fff2c0", a: 0.18 * (1 - (f - M.sunlight) / 4) });
  if (si > 0 && ago < 2) out.push({ kind: "flash", k: 0.06 * (1 - ago / 2) });
  return out;
};

// a warm/cold grade per beat; the twist ("Would you walk or wait?") desaturates.
export const gradeAt = (f) => {
  const si = si_(f), kind = KINDS[si];
  if (kind === "dawn" || kind === "above") return { tint: "#7f93b8", a: 0.16, mode: "multiply", desat: 0.2 };
  if (kind === "reveal") { const k = clamp01((f - M.wait + 20) / 30); return { tint: "#c9a86a", a: 0.06 + 0.10 * k, desat: 0.28 * k }; }
  if (kind === "empty") return { tint: "#8a6a3c", a: 0.12, desat: 0.15 };
  return null;
};

export const CAPTIONS = null;
export const TAG = null;

