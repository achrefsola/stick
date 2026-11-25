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
  // prop + effect palette
  BLOOD: "#a8121b", BLOOD_D: "#6e0a10", TAPE: "#c8cad0", TAPE_D: "#8f939b",
  PHONE: "#2b2f36", PHONE_D: "#14171c", SCREEN: "#8fd6ff", SCREEN_D: "#3d8fc4",
  // zombie variant of the same stick man
  ZFACE: "#0b0b0d", ZINK: "#000000", ZHAND: "#6f0d13", ZCAP: "#7c2a22", ZCAP_D: "#4a1815",
  ZEYE: "#ff9d2e", ZTEETH: "#d9d3c2",
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
 *  gear: "backpack"|"flashlight"|"notebook"|"bottle"|"phone"|"vlog-rig" | "duck-tape" | array | null,
 *  cone (0..1 flashlight beam), cx/soles/scale overrides optional.
 *  props: extras drawn from a hand / on the body:
 *    { kind:"phone", hand:L|R, side:1|-1, flip:0..1, rot:deg, glow:0..1, selfie:0..1 }  (screen face)
 *    { kind:"bandage", x: -1 (far arm) .. 1 (near arm), size:1 }    duct-tape patch + blood
 *  bloodFx: { on:true, trail:[[y,seed]...], drips:n, look:0|1 }    droplets + floor splats
 *  zombie: true → the infected variant (wilted cap, pitch-black face, glowing eyes,
 *          hunched neck, ragged jaw, two clean zombie bites on the arms)
 */
export function drawStick(g, opts = {}) {
  const { expr = "neutral", blink = 0, look = 0, facing = 0,
    L = "hang", R = "hang", step = 0, run = 0, tilt = 0, headTilt = 0, bob = 0,
    gear = null, cone = 0, cx: CX = SM_CX, soles = SM_SOLES, scale = 1,
    props = null, bloodFx = null, zombie = false } = opts;
  const E = SM.EXPR[expr] || SM.EXPR.neutral;
  const back = Math.abs(facing) >= 1.5;
  const side = !back && Math.abs(facing) >= 0.8;
  const dir = facing < 0 ? -1 : 1;
  const lw = SM_LW * scale, ink = SM.INK;
  const PR = props || {};
  const phoneP = PR.phone, bandP = PR.bandage;

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
    // dark ground contact + warm sneaker with a visible sole edge (never confusable
    // with the pale curb markings behind him)
    smFill(g, sm_rrect(footX - sw - 2, footY - 2, footX + sw + 2, footY + 11, 8), sm_mix(ink, SM.SHOE, 0.25));
    smFill(g, sm_rrect(footX - sw, footY - 11, footX + sw, footY + 5, 9), SM.SHOE);
    smFill(g, sm_rrect(footX - sw + 3, footY - 9, footX + sw - 3, footY - 3, 6), "#efe6d2");
    smStroke(g, [[footX - sw + 5, footY + 1], [footX + sw - 5, footY + 1]], 3.5, SM.SHOE_D);
  }
  function lpSafe(v) { return v; }

  // ---------------------------------------------------------- torso
  smStroke(g, [[CX, neck], [CX, hipY]], lw * scale, ink);

  // ---------------------------------------------------------- arms
  const shoulder = (sideS) => [CX + sideS * 8, sho];
  const arm = (sideSign, pose) => {
    const s = shoulder(sideSign);
    const X = (k) => CX + sideSign * (30 + k);
    let r;
    switch (pose) {
      case "walksw": { const ph = (step + (sideSign > 0 ? 0.5 : 0)) % 1;
        const sw = Math.sin(Math.PI * 2 * ph) * (60 + run * 40);
        r = { pts: [s, [CX + sideSign * 40, sho + 120], [CX + sideSign * 26 + sw, sho + 235]], prop: null }; } break;
      case "point": r = { pts: [s, [X(60), sho + 40], [X(130), sho + 26]], prop: null }; break;
      case "up": r = { pts: [s, [X(30), sho - 40], [X(40), sho - 150]], prop: null }; break;
      case "explore": r = { pts: [s, [X(34), sho + 20], [X(86), sho - 60]], prop: "flashlight", pa: -38 }; break;
      case "climb": r = { pts: [s, [X(52), sho - 30], [X(104), sho - 110]], prop: null }; break;
      case "reach": r = { pts: [s, [X(50), sho + 60], [X(96), sho + 170]], prop: null }; break;
      case "pull": r = { pts: [s, [X(30), sho + 60], [CX - sideSign * 40, sho + 96]], prop: null }; break;
      case "hip": r = { pts: [s, [X(36), sho + 70], [CX + sideSign * 34, hipY - 40]], prop: null }; break;
      case "chin": r = { pts: [s, [X(30), sho + 40], [CX + sideSign * (SM_HEAD.a - 4) + 10, headC + 70]], prop: "none" }; break;
      case "cross": r = { pts: [s, [X(14), sho + 70], [CX - sideSign * 26, sho + 96]], prop: null }; break;
      case "open": r = { pts: [s, [X(40), sho + 10], [X(74), sho + 130]], prop: null }; break;
      default: r = { pts: [s, [CX + sideSign * 26, sho + 130], [CX + sideSign * 20, sho + 300]], prop: null };
    }
    return { ...r, side: sideSign };
  };
  const arms = [arm(-1, L), arm(1, R)];
  const drawArm = (a) => {
    smStroke(g, sm_curve(a.pts[0], a.pts[1], a.pts[2]), lw * scale, ink);
    const [hx, hy] = a.pts[2];
    if (a.prop === "flashlight") drawFlashlight(g, hx, hy, a.pa ?? -30, cone, scale);
    else smDot(g, hx, hy, 15 * scale, SM.HAND);
    if (zombie) drawZombieBite(g, a.pts, a.side, scale);
    // arm-mounted selfie rig (vlog close-up camera) on the pointing arm, above the hand
    if (gearArr.includes("vlog-rig") && a.side > 0) {
      const d = Math.atan2(hy - a.pts[1][1], hx - a.pts[1][0]);
      const ex = a.pts[1][0] + Math.cos(d) * 66, ey = a.pts[1][1] + Math.sin(d) * 66;
      drawSelfieRig(g, ex, ey, scale);
    }
    if (phoneP && (phoneP.hand || "R") === (a.side > 0 ? "R" : "L")) {
      drawPhone(g, hx, hy, phoneP, scale, facing, dir);
    }
  };
  const gearArr = Array.isArray(gear) ? gear : (gear ? [gear] : []);

  // backpack behind the torso — visible as a rounded body + bedroll at both sides,
  // whether he is seen from the front or from the side (a real back kit, not a vest)
  if (gearArr.includes("backpack")) {
    const px = CX - dir * (side || back ? 46 : 0), py = hipY - 150;
    const w2 = side || back ? 52 : 44;
    smFill(g, sm_rrect(px - w2 - 6, py - 76, px + w2 + 6, py + 76, 22), SM.PACK_D);
    smFill(g, sm_rrect(px - w2, py - 70, px + w2, py + 70, 20), SM.PACK);
    // bedroll strapped on top
    smEll(g, px, py - 88, w2 + 8, 15, sm_mix(SM.PACK, "#000000", 0.18), 3, SM.PACK_D);
    // side buckle pockets
    smFill(g, sm_rrect(px - w2 + 6, py + 10, px + w2 - 6, py + 62, 10), sm_mix(SM.PACK, "#000000", 0.14));
    if (side || back) smStroke(g, [[px - 20, py - 64], [px - 20, py + 40]], 5, sm_mix(SM.PACK, "#000000", 0.35));
  }

  for (const a of arms) if (!a.front) drawArm(a);

  // zombie neck: the head sits hunched forward on the near-side of the line
  if (zombie) {
    smStroke(g, [[CX, neck], [CX + dir * 24, neck + 10]], lw * scale * 0.9, ink);
  }

  // ---------------------------------------------------------- head
  rot(tilt + headTilt, CX + (zombie ? dir * 10 : 0), neck);
  const hc = headC, HA = SM_HEAD.a, HB = SM_HEAD.b;
  smEll(g, CX, hc, HA, HB, zombie ? SM.ZFACE : SM.FACE, 5 * scale, zombie ? SM.ZINK : ink);
  if (back) {
    drawCapBack(g, CX, hc, HA, HB, zombie);
  } else {
    if (!zombie) drawHair(g, CX, hc, HA, HB, dir, side, false);
    drawCap(g, CX, hc, HA, HB, dir, side, zombie);
    if (zombie) drawZombieFace(g, CX, hc, HA, HB, dir, side, look, scale);
    else drawFace(g, CX, hc, HA, HB, E, blink, look, dir, side, scale);
  }

  for (const a of arms) if (a.front) drawArm(a);

  // duct-tape bandage on the arm (drawn over the arm line so it reads at any size)
  if (bandP) {
    const armPick = arms[bandP.x >= 0 ? 1 : 0];
    drawBandage(g, armPick.pts, bandP.x, bandP.size ?? 1, scale);
  }

  // gear in front (straps for front view, held items)
  if (gearArr.includes("backpack") && !back && !side) {
    // slim shoulder straps only (the load sits behind him)
    smStroke(g, [[CX - 24, sho + 4], [CX - 16, sho + 96]], 7 * scale, sm_mix(SM.PACK, "#000000", 0.3));
    smStroke(g, [[CX + 24, sho + 4], [CX + 16, sho + 96]], 7 * scale, sm_mix(SM.PACK, "#000000", 0.3));
    // the pack's shoulder bulge peeking past the neck
    smFill(g, sm_rrect(CX - 74, sho + 4, CX - 30, sho + 40, 12), SM.PACK_D);
    smFill(g, sm_rrect(CX + 30, sho + 4, CX + 74, sho + 40, 12), SM.PACK_D);
  }
  if (gearArr.includes("notebook") && !arms.some((a) => a.prop)) {
    const [hx, hy] = arms[1].pts[2]; drawNotebook(g, hx + 18 * scale, hy + 6, scale);
  }
  if (gearArr.includes("bottle") && !arms.some((a) => a.prop)) {
    const [hx, hy] = arms[0].pts[2]; drawBottle(g, hx - 14 * scale, hy + 10, scale);
  }
  if (bloodFx && bloodFx.on) drawBloodFx(g, bloodFx, { CX, soles: SM_SOLES, scale, dir, blade: [arms[1].pts[2][0] + 52, arms[1].pts[2][1] + 56] });
  g.restore();
  return { hands: arms.map((a) => a.pts[2]), head: [CX, headC] };
}

// ------------------------------------------------------------- cap + hair
function drawCap(g, cx, hc, HA, HB, dir, side, zombie = false) {
  const CAP = zombie ? SM.ZCAP : SM.CAP, CAP_D = zombie ? SM.ZCAP_D : SM.CAP_D;
  const bandY = hc - HB * 0.30, top = hc - HB;
  const dome = [];
  for (let i = 0; i <= 32; i++) { const a = Math.PI + (Math.PI * i / 32); dome.push([cx + Math.cos(a) * (HA + 10), bandY + Math.sin(a) * (HB + 12) * (zombie ? 0.94 : 1)]); }
  smFill(g, dome, CAP);
  smStroke(g, dome, 5, CAP_D);
  smStroke(g, [[cx - HA - 8, bandY + 2], [cx + HA + 8, bandY + 2]], 6, CAP_D);
  smStroke(g, [[cx, top - 6], [cx, top + 16]], 6, zombie ? CAP_D : SM.CAP_SEAM);
  smDot(g, cx, top - 2, 7, CAP_D);
  // brim toward dir, slightly tilted down (the zombie's brim droops)
  const by = bandY - 10 + (zombie ? 10 : 0);
  const x0 = cx + dir * (HA - 26), x1 = cx + dir * (HA + (zombie ? 56 : 66));
  g.save(); g.translate(cx, bandY); g.rotate(dir * sm_rad(zombie ? 17 : 5)); g.translate(-cx, -bandY);
  smFill(g, sm_rrect(Math.min(x0, x1), by - 17, Math.max(x0, x1), by + 15, 15), CAP_D);
  smStroke(g, [[cx + dir * (HA - 24), by + 10], [x1 - dir * 4, by + 9]], 5, sm_mix(CAP_D, "#000000", 0.3));
  g.restore();
  if (zombie) { // torn brim edge
    for (let i = 0; i < 3; i++) {
      const xx = cx + dir * (HA - 6 + i * 22), yy = by + (i % 2 ? 15 : -17);
      smStroke(g, [[xx, yy], [xx + dir * 10, yy + (i % 2 ? 9 : -9)]], 3, CAP_D);
    }
  }
}
function drawCapBack(g, cx, hc, HA, HB, zombie = false) {
  const CAP = zombie ? SM.ZCAP : SM.CAP, CAP_D = zombie ? SM.ZCAP_D : SM.CAP_D;
  const bandY = hc - HB * 0.30, top = hc - HB;
  const dome = [];
  for (let i = 0; i <= 32; i++) { const a = Math.PI + (Math.PI * i / 32); dome.push([cx + Math.cos(a) * (HA + 10), bandY + Math.sin(a) * (HB + 12)]); }
  smFill(g, dome, CAP);
  smStroke(g, dome, 5, CAP_D);
  smDot(g, cx, top - 2, 7, CAP_D);
  smFill(g, sm_rrect(cx - HA * 0.72, bandY - 4, cx + HA * 0.72, bandY + 24, 8), sm_mix(CAP, "#000000", 0.22));
  smStroke(g, [[cx + HA * 0.30, bandY + 9], [cx + HA * 0.30, bandY + 36]], 5, CAP_D);
  for (let i = 0; i < 3; i++) smStroke(g, [[cx + HA * 0.30 - 8, bandY + 26 + i * 8], [cx + HA * 0.30 + 8, bandY + 26 + i * 8]], 3, CAP_D);
  if (!zombie) drawHair(g, cx, hc, HA, HB, 1, false, true);
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

// ------------------------------------------------------------- zombie variant
/** Pitch-black face with two burning eyes and a ragged mouth. */
function drawZombieFace(g, cx, hc, HA, HB, dir, side, look, scale) {
  const ey = hc - 4, exo = HA * 0.36;
  const eyes = side ? [dir * (HA - 40)] : [-exo, exo];
  for (const x of eyes) {
    const ex = cx + x + look * 6;
    g.save(); g.globalCompositeOperation = "lighter";
    const rg = g.createRadialGradient(ex, ey, 2, ex, ey, 40);
    rg.addColorStop(0, "rgba(255,190,110,0.85)"); rg.addColorStop(0.35, "rgba(255,140,40,0.35)"); rg.addColorStop(1, "rgba(255,120,20,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(ex, ey, 40, 0, 7); g.fill(); g.restore();
    smEll(g, ex, ey, 11, 9, SM.ZEYE);
    smEll(g, ex + 1, ey, 4.5, 4.5, "#a3121a");
  }
  // ragged dark mouth, teeth showing between
  const my = hc + HB * 0.42, mw = side ? 22 : 40;
  const mx = side ? cx + dir * (HA - 48) : cx;
  const jaw = [];
  for (let i = 0; i <= 8; i++) jaw.push([mx - mw + i * mw / 4, my + 4 + Math.sin(i * 1.7 + 0.6) * 6]);
  for (let i = 8; i >= 0; i--) jaw.push([mx - mw + i * mw / 4, my + 18 + Math.sin(i * 1.3) * 5 * (i % 2 ? 1 : -1)]);
  smFill(g, jaw, "#170608");
  for (let i = 0; i < 4; i++) {
    const tx = mx - mw + 6 + i * (mw * 1.8 / 3.2);
    smFill(g, [[tx - 4, my + 5], [tx + 4, my + 6], [tx + 1, my + 13]], SM.ZTEETH);
  }
  smStroke(g, [[cx - dir * (HA - 22), hc - 44], [cx - dir * (HA - 34), hc + 10], [cx - dir * (HA - 26), hc + 52]], 3.5, "#3b0a0d");
}

/** Clean bite: two rows of puncture marks on a stick arm. */
function drawZombieBite(g, pts, sideSign, scale) {
  const [ax, ay] = _armPt(pts, sideSign > 0 ? 0.42 : 0.5);
  const [bx, by] = _armPt(pts, sideSign > 0 ? 0.52 : 0.6);
  const ang = Math.atan2(by - ay, bx - ax);
  g.save(); g.translate(ax, ay); g.rotate(ang);
  smEll(g, 0, 0, 15, 10, "#24060a");
  for (let i = -2; i <= 2; i++) {
    smDot(g, i * 6, -7, 2.4, SM.ZTEETH);
    smDot(g, i * 6 + 3, 7, 2.4, SM.ZTEETH);
  }
  smStroke(g, [[8, 6], [12, 22]], 3, SM.BLOOD);
  g.restore();
}

/** legacy alias: stories calling romanFront(...) get the stick man. */
export const romanFront = drawStick;
export const OUTFITS = { stick: {} };

// ------------------------------------------------------------- held phone
/** A phone held from a hand, SCREEN TOWARD THE CAMERA (that's how a vlogger
 *  holds it), with the character's face in the screen so the "filming"
 *  reads even when the phone is tiny. rot tilts it; flip (0..1) tips it
 *  down to reveal the character's eyes once the filming stops.
 */
function drawPhone(g, hx, hy, p, scale = 1, facing = 0, dir = 1) {
  const rot = p.rot ?? -8, flip = p.flip ?? 0;
  const pf = Math.cos(flip * Math.PI / 2) * (p.size ?? 1);
  const backView = flip > 0.62;
  g.save();
  g.translate(hx, hy); g.rotate(sm_rad(rot)); g.scale(scale, scale);
  // hand gripping the bottom edge
  smDot(g, 0, 34, 15, SM.HAND);
  smStroke(g, [[-10, 26], [10, 26]], 5, "#2a2626");
  const PW = 38 * pf, PH = 74;
  smFill(g, sm_rrect(-PW, -PH, PW, PH, 10), backView ? SM.PHONE_D : SM.PHONE);
  smStroke(g, sm_rrect(-PW, -PH, PW, PH, 10), 5, "#05070a");
  if (!backView) {
    smFill(g, sm_rrect(-PW + 5, -PH + 7, PW - 5, PH - 7, 5), SM.PHONE_D);
    smFill(g, sm_rrect(-PW + 10, -PH + 12, PW - 10, PH - 12, 3), SM.SCREEN);
    // selfie thumbnail: the face on screen (tiny)
    if (pf > 0.3) {
      const sx = 0, sy = -PH + 12 + (2 * PH - 24) * 0.24;
      smEll(g, sx, sy, 22 * pf, 24 * pf, SM.FACE, 2.5, "#0d1014");
      smFill(g, sm_curve([sx - 22 * pf, sy - 8 * pf], [sx, sy - 34 * pf], [sx + 22 * pf, sy - 8 * pf]), SM.CAP);
      for (const s of [-1, 1]) smDot(g, sx + s * 8 * pf, sy + 2 * pf, 3.4 * pf, SM.INK);
      smStroke(g, sm_curve([sx - 7 * pf, sy + 12 * pf], [sx, sy + 17 * pf], [sx + 7 * pf, sy + 12 * pf]), 3 * pf, SM.INK);
      smDot(g, -PW + 22, -PH + 25, 5 * pf, "#ff3b3b");
      smStroke(g, [[-PW + 32, -PH + 25], [-PW + 62, -PH + 25]], 4 * pf, "#ffffff");
      for (let i = 0; i < 3; i++) smStroke(g, [[-PW + 18, PH - 40 + i * 10], [PW - 22, PH - 40 + i * 10]], 4 * pf, SM.SCREEN_D);
    }
  } else {
    smFill(g, sm_rrect(-PW + 12, -PH + 12, -PW + 52, -PH + 46, 6), sm_mix(SM.PHONE, "#000000", 0.3));
    smDot(g, -PW + 26, -PH + 26, 6, SM.LENS); smDot(g, -PW + 40, -PH + 32, 6, SM.METAL_D);
    smDot(g, 0, 12, 9, sm_mix(SM.PHONE, "#ffffff", 0.2));
  }
  if ((p.glow ?? 1) > 0.05 && !backView) {
    g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.22 * (p.glow ?? 1) * pf;
    const rg = g.createRadialGradient(0, 0, 6, 0, 0, 150);
    rg.addColorStop(0, "#bfe9ff"); rg.addColorStop(1, "rgba(120,190,255,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 150, 0, 7); g.fill(); g.restore();
  }
  g.restore();
}

/** Splatter that grows with the story: hand drips → trail of drops →
 *  a pool / blade drip once the joke lands. All deterministic in f. */
function drawBloodFx(g, B, ctx) {
  const { CX, soles, scale, dir, blade } = ctx;
  const k = Math.max(0, Math.min(1, B.k ?? 1));         // 0..1 amount
  const seed = B.seed ?? 1, t = B.t ?? 0;
  // 1. drips raining off the near hand (cycled so they always move)
  const hand = B.hand || [CX + 20, soles - 300];
  const n = Math.round((B.drips ?? 4) * k);
  for (let i = 0; i < n; i++) {
    const ph = (t * (0.9 + i * 0.17) + i * 0.37 + seed * 0.11) % 1;
    const x = hand[0] + 26 + Math.sin(i * 2.3 + seed) * 16;
    const y0 = hand[1] + 16, y1 = soles - 6;
    const y = y0 + (y1 - y0) * ph;
    const r = (5 + i % 3) * (0.7 + 0.3 * Math.sin(ph * 9 + i));
    smDot(g, x + Math.sin(ph * 6 + i) * 3, y, Math.max(1, r * Math.min(1, ph * 6)), SM.BLOOD);
  }
  // 2. trail of blood behind / around the feet
  const trail = B.trail || [];
  for (let i = 0; i < trail.length; i++) {
    const [ty, ts] = trail[i];
    const grow = Math.max(0, Math.min(1, k * 1.6 - i * 0.06));
    if (grow <= 0) continue;
    const w = (58 + (ts % 1) * 40) * grow;
    const tx = CX + (ts - 0.5) * 130 * (1 + 0.4 * scale);
    g.save(); g.globalAlpha = 0.92;
    smEll(g, tx, soles + ty, w, w * 0.26, SM.BLOOD_D);
    smEll(g, tx - 10, soles + ty - 2, w * 0.7, w * 0.16, SM.BLOOD);
    g.restore();
    for (let j = 0; j < 3; j++) {
      const a = ts * 9 + j * 2.1;
      smDot(g, tx + Math.cos(a) * (w + 18), soles + ty + Math.sin(a) * 12, (4 + (j % 2) * 3) * grow, SM.BLOOD_D);
    }
  }
  // 3. big pool under the character
  if ((B.pool ?? 0) > 0.01 && k > 0.15) {
    const pw = (150 + 70 * Math.sin(seed)) * (B.pool ?? 1) * Math.min(1, k * 1.8);
    g.save(); g.globalAlpha = 0.95;
    smEll(g, CX + 10, soles + 6, pw, pw * 0.24, SM.BLOOD_D);
    smEll(g, CX + 10, soles + 2, pw * 0.82, pw * 0.18, SM.BLOOD);
    g.save(); g.globalAlpha = 0.5; smEll(g, CX - pw * 0.2, soles - 2, pw * 0.3, pw * 0.07, "#e0373f"); g.restore();
    g.restore();
  }
  // 4. bloody knife dripping in the near hand (monster variant)
  if (B.blade && k > 0.4) {
    g.save(); g.translate(blade[0], blade[1]); g.rotate(sm_rad(18 + 6 * Math.sin(t * 2)));
    smFill(g, sm_rrect(-10, -8, 10, 46, 6), "#2b2622");
    smFill(g, [[-9, -10], [9, -10], [10, -86], [0, -96], [-10, -86]], "#c9cfd6");
    smStroke(g, [[-9, -10], [9, -10], [10, -86], [0, -96], [-10, -86]], 3, "#7f868e");
    smStroke(g, [[0, -18], [1, -80]], 2.5, "#eef2f5");
    smFill(g, [[-8, -20], [8, -26], [6, -62], [0, -72], [-7, -60]], SM.BLOOD);
    const ph = (t * 1.6) % 1;
    smDot(g, 0, -96 + ph * 70, 4.5, SM.BLOOD);
    g.restore();
  }
}
/** Phone in a clamp on the forearm, screen at the character (the POV camera). */
function drawSelfieRig(g, x, y, scale) {
  smFill(g, sm_rrect(x - 20, y - 8, x + 20, y + 8, 8), SM.HAND);
  g.save(); g.translate(x + 6, y - 6); g.rotate(sm_rad(-14)); g.scale(scale, scale);
  smFill(g, sm_rrect(-26, -34, 26, 34, 8), SM.PHONE);
  smStroke(g, sm_rrect(-26, -34, 26, 34, 8), 4, "#05070a");
  smFill(g, sm_rrect(-21, -29, 21, 29, 5), SM.SCREEN);
  smDot(g, 14, -22, 4, "#ff3b3b");
  g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.16;
  const rg = g.createRadialGradient(0, 0, 4, 0, 0, 90);
  rg.addColorStop(0, "#bfe9ff"); rg.addColorStop(1, "rgba(120,190,255,0)");
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 90, 0, 7); g.fill(); g.restore();
  g.restore();
}

// ------------------------------------------------------------- bandage + blood
const _armPt = (pts, t) => {
  const [p0, p1, p2] = pts, it = 1 - t;
  return [it * it * p0[0] + 2 * it * t * p1[0] + t * t * p2[0], it * it * p0[1] + 2 * it * t * p1[1] + t * t * p2[1]];
};
/** Duct-tape patch wrapped round the forearm, with a fresh blood stain. Bold on
 *  purpose: the arm is a thin dark line, so the patch has to break its outline. */
function drawBandage(g, pts, sideX, size = 1, scale = 1) {
  const t = sideX < 0 ? 0.46 : 0.4;
  const [ax, ay] = _armPt(pts, t);
  const [bx, by] = _armPt(pts, Math.min(1, t + 0.1));
  const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
  g.save(); g.translate(ax, ay); g.rotate(ang); g.scale(size, size);
  const bw = 36;                                  // half-length across the arm
  // shadowed seam under the tape so it sits on the limb
  smFill(g, sm_rrect(-bw - 3, -17, bw + 3, 17, 9), "#0a0a0c");
  // two overlapping wraps of duct tape (silver), each with its own edge
  for (const [dy, w, col, edge] of [[-6, 9, "#d6d9df", "#8e939b"], [6, 8, "#c2c6cd", "#7d828a"]]) {
    smFill(g, sm_rrect(-bw, dy - w, bw, dy + w, 6), col);
    smStroke(g, [[-bw + 4, dy + w - 1], [bw - 4, dy + w - 1]], 2, edge);
  }
  // torn end + wrinkles
  smStroke(g, [[bw - 4, -16], [bw + 10, -6], [bw - 2, 5], [bw + 8, 12]], 2.5, "#7d828a");
  for (let i = -2; i <= 2; i++) smStroke(g, [[i * 14 - 4, -12], [i * 14 + 6, 10]], 2, "#8e939b");
  // blood: soaked through the middle + a bright drip line down the arm
  smEll(g, -4, 1, 16, 9, SM.BLOOD);
  smDot(g, 10, -2, 6, SM.BLOOD);
  smStroke(g, [[12, 10], [15, 34]], 5, SM.BLOOD_D);
  smDot(g, 15.5, 38, 6, SM.BLOOD);
  g.restore();
}
