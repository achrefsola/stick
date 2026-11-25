// ============================================================ STICK MAN CAST
// The one and only character of this pipeline, drawn straight from the
// "MAIN CHARACTER REFERENCE SHEET":
//   - big white bean head, thin black stick body, black mitt hands, white shoes
//   - red baseball cap (brim forward, hair tuft under it), brown hair
//   - 8 expressions: neutral happy angry surprised scared sad tired thinking
//   - gear: backpack, flashlight (+light cone), notebook, water bottle
//   - views: front / three-quarter / side / back   (facing: 0, ±0.45, ±1, 2)
//   - poses: hang walksw run explore climb pull reach point up hip cross chin
// Draws DIRECTLY on a raw canvas 2D context (no Pen bridge, no 3D).
// Design space: 600x1000, soles at y=975. Override of any character choice.

// ------------------------------------------------------------- palette (ref)
export const SM = {
  CAP: "#b23330", CAP_D: "#8c2724", CAP_SEAM: "#d85550",
  HAIR: "#5b4232",
  FACE: "#ffffff",
  INK: "#151313",
  SHOE: "#f6f4ef", SHOE_D: "#d9d6cf",
  HAND: "#151313",
  PACK: "#a83534", PACK_D: "#832828",
  METAL: "#6f7378", METAL_D: "#3c3f43", LENS: "#d3dadf",
  BOTTLE: "#7d8288", PAPER: "#d9cfae", NOTE: "#6d5136",
};

const SM_SOLES = 975, SM_CX = 300;
const SM_HEAD = { a: 118, b: 128 };
const SM_HIP = SM_SOLES - 333;
const SM_NECK = 350;
const SM_SHOULDER = 385;
const SM_LW = 13;

const sm_mix = (a, b, k) => "#" + [0, 1, 2].map(i => {
  const A = parseInt(a.slice(1 + i * 2, 3 + i * 2), 16), B = parseInt(b.slice(1 + i * 2, 3 + i * 2), 16);
  return Math.round(A + (B - A) * k).toString(16).padStart(2, "0");
}).join("");
const sm_rad = (d) => d * Math.PI / 180;
const sm_lerp = (a, b, k) => a + (b - a) * k;
const sm_curve = (p0, p1, p2, n = 16) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = sm_lerp(p0[0], p1[0], t), b = sm_lerp(p0[1], p1[1], t);
    const c = sm_lerp(p1[0], p2[0], t), d = sm_lerp(p1[1], p2[1], t);
    pts.push([sm_lerp(a, c, t), sm_lerp(b, d, t)]);
  }
  return pts;
};
const sm_path = (pts, close = false) => {
  const P = new Path2D();
  P.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) P.lineTo(pts[i][0], pts[i][1]);
  if (close) P.closePath();
  return P;
};
const sm_rrect = (x0, y0, x1, y1, r) => {
  const p = [];
  p.push([x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]);
  return p;
};
// raw-ctx drawing helpers
const smStroke = (g, pts, w, col) => { const P = sm_path(pts); g.lineWidth = w; g.strokeStyle = col; g.lineCap = "round"; g.lineJoin = "round"; g.stroke(P); };
const smFill = (g, pts, col) => { g.fillStyle = col; g.fill(sm_path(pts, true)); };
const smDot = (g, x, y, r, col = SM.INK) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = col; g.fill(); };
const smEll = (g, x, y, rx, ry, col, lw = 0, colL = SM.INK) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fillStyle = col; g.fill(); if (lw > 0) { g.lineWidth = lw; g.strokeStyle = colL; g.stroke(); } };

// ------------------------------------------------------------- expressions
SM.EXPR = {
  neutral:   { brow: [0, 0],      eye: "open",   mouth: "flat" },
  happy:     { brow: [-6, -6],    eye: "open",   mouth: "smile" },
  angry:     { brow: [16, 16],    eye: "narrow", mouth: "frown" },
  surprised: { brow: [-14, -14],  eye: "wide",   mouth: "o" },
  scared:    { brow: [-18, -18],  eye: "wide",   mouth: "wavy" },
  sad:       { brow: [10, 10],    eye: "open",   mouth: "sadarc" },
  tired:     { brow: [4, 4],      eye: "half",   mouth: "droop" },
  thinking:  { brow: [-4, 10],    eye: "up",     mouth: "small" },
};

// ------------------------------------------------------------- the character
/** Draw the stick man onto raw ctx g. opts:
 *  expr, blink (0..1), look (-1..1), facing (0 front, ±0.45 3/4, ±1 side, 2 back),
 *  seed, L / R arm poses, step (0..1 cycle), run (0..1), tilt, headTilt, bob,
 *  gear: "backpack"|"flashlight"|"notebook"|"bottle" | array | null,
 *  cone (0..1 flashlight beam), cx/soles/scale overrides optional.
 */
export function drawStick(g, opts = {}) {
  const { expr = "neutral", blink = 0, look = 0, facing = 0,
    L = "hang", R = "hang", step = 0, run = 0, tilt = 0, headTilt = 0, bob = 0,
    gear = null, cone = 0, cx: CX = SM_CX, soles = SM_SOLES, scale = 1 } = opts;
  const E = SM.EXPR[expr] || SM.EXPR.neutral;
  const back = Math.abs(facing) >= 1.5;
  const side = !back && Math.abs(facing) >= 0.8;
  const dir = facing < 0 ? -1 : 1;
  const lw = SM_LW * scale, ink = SM.INK;

  g.save();
  if (scale !== 1) { g.translate(CX, soles); g.scale(scale, scale); g.translate(-CX, -soles); }
  const rot = (deg, px, py) => { if (deg) { g.translate(px, py); g.rotate(sm_rad(deg)); g.translate(-px, -py); } };

  const bobY = bob * 26;
  const hipY = SM_HIP + bobY, neck = SM_NECK + bobY, sho = SM_SHOULDER + bobY;
  const headC = neck - SM_HEAD.b + headTilt * 0.6;

  // ---------------------------------------------------------- legs + shoes
  rot(tilt, CX, hipY);
  const stride = 34 + run * 46, lift = 26 + run * 40;
  for (const sideSign of [-1, 1]) {
    const ph = (step + (sideSign > 0 ? 0.5 : 0)) % 1;
    const up = Math.max(0, Math.sin(Math.PI * 2 * ph)) * lift * (step ? 1 : 0);
    const fw = Math.sin(Math.PI * 2 * ph) * stride * (step ? 1 : 0);
    const hipX = CX + sideSign * 12;
    const footX = CX + sideSign * 10 + fw + (run ? dir * 12 : 0);
    const footY = SM_SOLES - lpSafe(up) - bobY * (sideSign > 0 ? 0.6 : 1);
    const kneeX = (hipX + footX) / 2 + sideSign * 6 + (run ? dir * 14 : 0);
    const kneeY = (hipY + footY) / 2 - (sideSign > 0 ? 8 : 2) - up * 0.15;
    smStroke(g, sm_curve([hipX, hipY], [kneeX, kneeY], [footX, footY]), lw, ink);
    const sw = 30 * scale;
    smFill(g, sm_rrect(footX - sw, footY - 9, footX + sw, footY + 8, 9), SM.SHOE);
    smStroke(g, [[footX - sw + 5, footY + 2], [footX + sw - 5, footY + 2]], 3.5, SM.SHOE_D);
  }
  function lpSafe(v) { return v; }

  // ---------------------------------------------------------- torso
  smStroke(g, [[CX, neck], [CX, hipY]], lw * scale, ink);

  // ---------------------------------------------------------- arms
  const shoulder = (sideS) => [CX + sideS * 8, sho];
  const arm = (sideSign, pose) => {
    const s = shoulder(sideSign);
    const X = (k) => CX + sideSign * (30 + k);
    switch (pose) {
      case "walksw": { const ph = (step + (sideSign > 0 ? 0.5 : 0)) % 1;
        const sw = Math.sin(Math.PI * 2 * ph) * (60 + run * 40);
        return { pts: [s, [CX + sideSign * 40, sho + 120], [CX + sideSign * 26 + sw, sho + 235]], prop: null }; }
      case "point": return { pts: [s, [X(60), sho + 40], [X(130), sho + 26]], prop: null };
      case "up": return { pts: [s, [X(30), sho - 40], [X(40), sho - 150]], prop: null };
      case "explore": return { pts: [s, [X(34), sho + 20], [X(86), sho - 60]], prop: "flashlight", pa: -38 };
      case "climb": return { pts: [s, [X(52), sho - 30], [X(104), sho - 110]], prop: null };
      case "reach": return { pts: [s, [X(50), sho + 60], [X(96), sho + 170]], prop: null };
      case "pull": return { pts: [s, [X(30), sho + 60], [CX - sideSign * 40, sho + 96]], prop: null };
      case "hip": return { pts: [s, [X(36), sho + 70], [CX + sideSign * 34, hipY - 40]], prop: null };
      case "chin": return { pts: [s, [X(30), sho + 40], [CX + sideSign * (SM_HEAD.a - 4) + 10, headC + 70]], prop: "none" };
      case "cross": return { pts: [s, [X(14), sho + 70], [CX - sideSign * 26, sho + 96]], prop: null };
      case "open": return { pts: [s, [X(40), sho + 10], [X(74), sho + 130]], prop: null };
      default: return { pts: [s, [CX + sideSign * 26, sho + 130], [CX + sideSign * 20, sho + 300]], prop: null };
    }
  };
  const arms = [arm(-1, L), arm(1, R)];
  const drawArm = (a) => {
    smStroke(g, sm_curve(a.pts[0], a.pts[1], a.pts[2]), lw * scale, ink);
    const [hx, hy] = a.pts[2];
    if (a.prop === "flashlight") drawFlashlight(g, hx, hy, a.pa ?? -30, cone, scale);
    else smDot(g, hx, hy, 15 * scale, SM.HAND);
  };
  const gearArr = Array.isArray(gear) ? gear : (gear ? [gear] : []);

  // backpack behind the torso (drawn first for back/side views)
  if (gearArr.includes("backpack") && (back || side)) {
    const px = CX - dir * (back ? 6 : 46), py = hipY - 150;
    smFill(g, sm_rrect(px - 52, py - 74, px + 52, py + 74, 22), SM.PACK);
    smFill(g, sm_rrect(px - 34, py + 6, px + 34, py + 62, 12), sm_mix(SM.PACK, "#000000", 0.14));
    smStroke(g, [[px - 30, py - 48], [px + 30, py - 48]], 4, SM.PACK_D);
    smStroke(g, [[px - dir * 4, py - 74], [px - dir * 4, py + 40]], 5, sm_mix(SM.PACK, "#000000", 0.35));
  }

  for (const a of arms) if (!a.front) drawArm(a);

  // ---------------------------------------------------------- head
  rot(tilt + headTilt, CX, neck);
  const hc = headC, HA = SM_HEAD.a, HB = SM_HEAD.b;
  smEll(g, CX, hc, HA, HB, SM.FACE, 5 * scale, ink);
  if (back) {
    drawCapBack(g, CX, hc, HA, HB);
  } else {
    drawHair(g, CX, hc, HA, HB, dir, side, false);
    drawCap(g, CX, hc, HA, HB, dir, side);
    drawFace(g, CX, hc, HA, HB, E, blink, look, dir, side, scale);
  }

  for (const a of arms) if (a.front) drawArm(a);

  // gear in front (straps for front view, held items)
  if (gearArr.includes("backpack") && !back && !side) {
    smStroke(g, [[CX - 26, sho + 6], [CX - 14, hipY - 60]], 9 * scale, sm_mix(SM.PACK, "#000000", 0.25));
    smStroke(g, [[CX + 26, sho + 6], [CX + 14, hipY - 60]], 9 * scale, sm_mix(SM.PACK, "#000000", 0.25));
    smFill(g, sm_rrect(CX - 46, hipY - 190, CX - 6, hipY - 60, 14), sm_mix(SM.PACK, "#20242c", 0.45));
    smFill(g, sm_rrect(CX + 6, hipY - 190, CX + 46, hipY - 60, 14), sm_mix(SM.PACK, "#20242c", 0.45));
  }
  if (gearArr.includes("notebook") && !arms.some((a) => a.prop)) {
    const [hx, hy] = arms[1].pts[2]; drawNotebook(g, hx + 18 * scale, hy + 6, scale);
  }
  if (gearArr.includes("bottle") && !arms.some((a) => a.prop)) {
    const [hx, hy] = arms[0].pts[2]; drawBottle(g, hx - 14 * scale, hy + 10, scale);
  }
  g.restore();
  return { hands: arms.map((a) => a.pts[2]), head: [CX, headC] };
}

// ------------------------------------------------------------- cap + hair
function drawCap(g, cx, hc, HA, HB, dir, side) {
  const bandY = hc - HB * 0.30, top = hc - HB;
  const dome = [];
  for (let i = 0; i <= 32; i++) { const a = Math.PI + (Math.PI * i / 32); dome.push([cx + Math.cos(a) * (HA + 10), bandY + Math.sin(a) * (HB + 12)]); }
  smFill(g, dome, SM.CAP);
  smStroke(g, dome, 5, SM.CAP_D);
  smStroke(g, [[cx - HA - 8, bandY + 2], [cx + HA + 8, bandY + 2]], 6, SM.CAP_D);
  smStroke(g, [[cx, top - 6], [cx, top + 16]], 6, SM.CAP_SEAM);
  smDot(g, cx, top - 2, 7, SM.CAP_D);
  // brim toward dir, slightly tilted down
  const by = bandY - 10;
  const x0 = cx + dir * (HA - 26), x1 = cx + dir * (HA + 66);
  g.save(); g.translate(cx, bandY); g.rotate(dir * sm_rad(5)); g.translate(-cx, -bandY);
  smFill(g, sm_rrect(Math.min(x0, x1), by - 17, Math.max(x0, x1), by + 15, 15), SM.CAP_D);
  smStroke(g, [[cx + dir * (HA - 24), by + 10], [x1 - dir * 4, by + 9]], 5, sm_mix(SM.CAP_D, "#000000", 0.3));
  g.restore();
}
function drawCapBack(g, cx, hc, HA, HB) {
  const bandY = hc - HB * 0.30, top = hc - HB;
  const dome = [];
  for (let i = 0; i <= 32; i++) { const a = Math.PI + (Math.PI * i / 32); dome.push([cx + Math.cos(a) * (HA + 10), bandY + Math.sin(a) * (HB + 12)]); }
  smFill(g, dome, SM.CAP);
  smStroke(g, dome, 5, SM.CAP_D);
  smDot(g, cx, top - 2, 7, SM.CAP_D);
  smFill(g, sm_rrect(cx - HA * 0.72, bandY - 4, cx + HA * 0.72, bandY + 24, 8), sm_mix(SM.CAP, "#000000", 0.22));
  smStroke(g, [[cx + HA * 0.30, bandY + 9], [cx + HA * 0.30, bandY + 36]], 5, SM.CAP_D);
  for (let i = 0; i < 3; i++) smStroke(g, [[cx + HA * 0.30 - 8, bandY + 26 + i * 8], [cx + HA * 0.30 + 8, bandY + 26 + i * 8]], 3, SM.CAP_D);
  drawHair(g, cx, hc, HA, HB, 1, false, true);
}
function drawHair(g, cx, hc, HA, HB, dir, side, backTuft = false) {
  const tuft = (x, y, a, l) => {
    const t = [[x, y], [x + Math.cos(a) * l * 0.5 - 7, y + Math.sin(a) * l * 0.5 + 5], [x + Math.cos(a) * l, y + Math.sin(a) * l + 8]];
    smFill(g, t, SM.HAIR);
  };
  const fy = hc - HB * 0.40;
  if (backTuft) { for (let i = -1; i <= 1; i++) tuft(cx + i * 26, hc - HB * 0.24, sm_rad(96 + i * 10), 40); return; }
  if (side) { for (let i = 0; i <= 2; i++) tuft(cx + dir * (HA - 4) + i * 10, hc - HB * 0.38 + i * 14, sm_rad(dir * 44 + i * 8), 44); return; }
  for (let i = -2; i <= 2; i++) tuft(cx + i * 34 + dir * 6, fy, sm_rad(90 + i * 12), 30 + (i % 2) * 12);
  for (const s of [-1, 1]) tuft(cx + s * (HA + 1), hc - HB * 0.05, sm_rad(s > 0 ? 122 : 58), 30);
}

// ------------------------------------------------------------- face
function drawFace(g, cx, hc, HA, HB, E, blink, look, dir, side, scale) {
  const ey = hc - 6;
  if (side) {
    const eyeX = cx + dir * (HA - 40);
    if (blink > 0.5) smStroke(g, [[eyeX - 12, ey], [eyeX + 12, ey]], 6, SM.INK);
    else { const ry = E.eye === "wide" ? 22 : E.eye === "half" ? 8 : 15; smEll(g, eyeX + look * 6, ey, 10, ry, SM.INK); }
    smStroke(g, [[cx + dir * (HA - 66), ey - 34], [cx + dir * (HA - 14), ey - 34 - (E.brow[1] > 0 ? 6 : -6)]], 7, SM.INK);
    drawMouth(g, cx + dir * (HA - 46), hc + HB * 0.44, 26, E, scale);
    return;
  }
  const exo = HA * 0.36;
  for (const s of [-1, 1]) {
    const x = cx + s * exo + look * 8;
    const ry = E.eye === "wide" ? 21 : E.eye === "narrow" ? 8 : 15;
    if (blink > 0.5) smStroke(g, [[x - 12, ey], [x + 12, ey]], 6, SM.INK);
    else { smEll(g, x, ey - (E.eye === "wide" ? 5 : 0), 10, ry * Math.max(0.2, 1 - blink), SM.INK); }
    const ba = sm_rad(E.brow[s > 0 ? 1 : 0]);
    const bx = x + s * 6, by = ey - 32 - (E.brow[0] < -8 ? 8 : 0);
    smStroke(g, [[bx - Math.cos(ba) * 20, by + Math.sin(ba) * 9], [bx + Math.cos(ba) * 20, by - Math.sin(ba) * 9]], 7, SM.INK);
  }
  drawMouth(g, cx, hc + HB * 0.44, 44, E, scale);
}
function drawMouth(g, mx, my, mw, E, scale) {
  switch (E.mouth) {
    case "smile": smStroke(g, sm_curve([mx - mw, my - 4], [mx, my + 16], [mx + mw, my - 4]), 7, SM.INK); break;
    case "frown": smStroke(g, sm_curve([mx - mw, my + 12], [mx, my - 6], [mx + mw, my + 12]), 7, SM.INK);
      smStroke(g, [[mx - mw * 0.5, my + 2], [mx + mw * 0.5, my + 2]], 6, SM.INK); break;
    case "o": smEll(g, mx, my + 4, 11, 15, SM.INK); break;
    case "wavy": { const pts = []; for (let i = 0; i <= 10; i++) pts.push([mx - mw + i * mw / 5, my + 2 + Math.sin(i * 2.4) * 9]); smStroke(g, pts, 7, SM.INK); } break;
    case "sadarc": smStroke(g, sm_curve([mx - mw * 0.8, my + 14], [mx, my - 2], [mx + mw * 0.8, my + 14]), 7, SM.INK); break;
    case "droop": smStroke(g, sm_curve([mx - mw * 0.6, my - 2], [mx, my + 10], [mx + mw * 0.6, my - 2]), 7, SM.INK); break;
    case "small": smStroke(g, [[mx - 14, my + 2], [mx + 14, my + 2]], 6, SM.INK); break;
    default: smStroke(g, [[mx - mw * 0.55, my + 2], [mx + mw * 0.55, my + 2]], 7, SM.INK);
  }
}

// ------------------------------------------------------------- gear props
function drawFlashlight(g, hx, hy, angDeg, cone, scale = 1) {
  const a = sm_rad(angDeg), dx = Math.cos(a), dy = Math.sin(a);
  smFill(g, [[hx - dy * 14, hy + dx * 14], [hx + dy * 14, hy - dx * 14], [hx + dy * 14 + dx * 64, hy - dx * 14 + dy * 64], [hx - dy * 14 + dx * 64, hy + dx * 14 + dy * 64]], SM.METAL);
  smStroke(g, [[hx - dy * 14, hy + dx * 14], [hx + dy * 14, hy - dx * 14]], 4, SM.METAL_D);
  smFill(g, [[hx + dx * 64 - dy * 18, hy + dy * 64 + dx * 18], [hx + dx * 64 + dy * 18, hy + dy * 64 - dx * 18], [hx + dx * 78 + dy * 22, hy + dy * 78 - dx * 22], [hx + dx * 78 - dy * 22, hy + dy * 78 + dx * 22]], SM.METAL_D);
  smEll(g, hx + dx * 74, hy + dy * 74, 12, 12, SM.LENS, 3, SM.METAL_D);
  if (cone > 0.05) {
    const L = 190 * cone + 80, spread = 0.30;
    const c1 = [hx + dx * 78, hy + dy * 78];
    const p1 = [c1[0] + Math.cos(a + spread) * L * 0.4, c1[1] + Math.sin(a + spread) * L * 0.4];
    const p2 = [c1[0] + dx * L, c1[1] + dy * L];
    const p3 = [c1[0] + Math.cos(a - spread) * L * 0.4, c1[1] + Math.sin(a - spread) * L * 0.4];
    g.save(); g.globalAlpha = 0.14 * cone;
    smFill(g, [c1, p1, p2, p3], "#ffe9a8");
    g.restore();
  }
}
function drawNotebook(g, x, y, scale) {
  smFill(g, sm_rrect(x - 34, y - 42, x + 34, y + 42, 6), SM.NOTE);
  smFill(g, sm_rrect(x - 28, y - 36, x + 28, y + 36, 4), SM.PAPER);
  smStroke(g, [[x - 20, y - 26], [x + 12, y + 22]], 5, sm_mix(SM.NOTE, "#000000", 0.4));
  smStroke(g, [[x + 6, y - 34], [x + 26, y - 54]], 6, "#c9a24a");
}
function drawBottle(g, x, y, scale) {
  smFill(g, sm_rrect(x - 16, y - 34, x + 16, y + 34, 10), SM.BOTTLE);
  smFill(g, sm_rrect(x - 9, y - 44, x + 9, y - 30, 4), sm_mix(SM.BOTTLE, "#000000", 0.3));
  smStroke(g, [[x - 10, y - 8], [x + 10, y - 8]], 3, sm_mix(SM.BOTTLE, "#ffffff", 0.35));
}

/** legacy alias: stories calling romanFront(...) get the stick man. */
export const romanFront = drawStick;
export const OUTFITS = { stick: {} };
