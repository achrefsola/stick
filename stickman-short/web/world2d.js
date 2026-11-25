// ============================================================ 2D WORLD
// Flat painted backdrops + props + fx for the stick man shorts.
// No 3D, no textures — shapes, gradients and a few noise flecks.
// A backdrop is a function (g, W, H, t, layer, arg) painting in WORLD coordinates
// (1080x1920 design space); the camera transform is applied by main.js.
//   layer=false → sky, ground, buildings … everything behind the actors
//   layer=true  → a prop's FRONT half, called again around the near actors
//   layer="over"→ props that always sit in front of the hero (see story.FRONT_OVER)
//   arg         → the story's FRONT object, e.g. { mode:"behind", car:{x,y,scale} }
//
// Prop kinds (each takes an object with x/y/scale/layer/img plus options):
//   car    {x,y}        abandoned car, drawn in two halves for depth
//   pole   {x,y,h}      bent street lamp + faint light pool
//   trash  {x,y}        knocked-over bin that spills
//   hydrant{x,y}        hydrant, dribbling water
//   sign   {x,y,text}   store sign (diegetic text reads correctly)
//   fence  {x,y}        rebar railing
//   wall   {x,y,h}      graffiti wall strip
// A prop always calls isFrontProp(o) and returns early when it doesn't match.

const nightSky = (g, W, H, moonX = 640, moonY = 420) => {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#1b2436"); grd.addColorStop(0.6, "#22304a"); grd.addColorStop(1, "#2c3d55");
  g.fillStyle = grd; g.fillRect(-400, -400, W + 800, H + 800);
  g.fillStyle = "#e8ecf2"; g.globalAlpha = 0.85;
  const stars = [[120, 260], [320, 180], [520, 320], [860, 240], [1010, 380], [220, 560], [760, 610], [980, 140], [60, 420], [430, 700]];
  for (const [x, y] of stars) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
  g.globalAlpha = 0.16; g.fillStyle = "#5b6b86";
  for (const [cx2, cy2, w2, h2] of [[120, 150, 220, 34], [620, 90, 300, 40], [880, 260, 190, 28], [380, 330, 260, 30], [1020, 470, 240, 36]]) {
    g.beginPath(); g.ellipse(cx2, cy2, w2, h2, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx2 + 70, cy2 + 16, w2 * 0.7, h2 * 0.7, 0, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  g.beginPath(); g.arc(moonX, moonY, 78, 0, 7); g.fillStyle = "#e6e9ee"; g.fill();
  g.beginPath(); g.arc(moonX - 24, moonY - 18, 16, 0, 7); g.fillStyle = "#cdd3dc"; g.fill();
  g.beginPath(); g.arc(moonX + 20, moonY + 30, 11, 0, 7); g.fill();
};

const skyline = (g, W, yBase, seedCol) => {
  const blocks = [[-60, 320, 240, 460], [200, 260, 300, 520], [520, 380, 260, 400], [800, 240, 330, 540], [1150, 340, 260, 440], [1360, 210, 300, 570], [640, 480, 200, 300]];
  for (const [x, y, w, h] of blocks) {
    g.fillStyle = seedCol; g.fillRect(x, yBase - h + (y - 260) * 0.2, w, h + 200);
    g.fillStyle = "#0f1520";
    for (let r = 0; r < Math.floor(h / 90); r++) for (let c = 0; c < Math.floor(w / 70); c++) {
      if ((r * 7 + c * 13) % 5 < 2) { g.globalAlpha = 0.9; g.fillRect(x + 20 + c * 70, yBase - h + (y - 260) * 0.2 + 26 + r * 90, 26, 40); g.globalAlpha = 1; }
    }
  }
};

// ------------------------------------------------------------- props
// Every prop is depth-split: back part (layer=false) + front part (layer=true),
// so an actor whose soles sit behind the prop's ground line is occluded by its
// front half — the real "standing behind the car" read.
const fillP = (g, pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };
const strokeP = (g, pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = "round"; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke(); };
const rrectP = (x0, y0, x1, y1, r) => {
  const a = Math.min(x0, x1), b = Math.min(y0, y1), c = Math.max(x0, x1), d = Math.max(y0, y1);
  return [[a + r, b], [c - r, b], [c, b + r], [c, d - r], [c - r, d], [a + r, d], [a, d - r], [a, b + r]];
};
const ellP = (g, x, y, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };

/** Abandoned car, SIDE view, two depth halves. Ground line = o.y (tyre contact). */
const carProp = (g, o) => {
  const S = o.scale ?? 1, Wd = 470, Hh = 160;
  g.save(); g.translate(o.x, o.y); g.scale(S, S);
  const BODY = o.col || "#2a303a", DARK = "#151a21", EDGE = "#3a424e", GLASS = "#1b2430";
  const body = [[10, -46], [26, -Hh], [110, -Hh - 14], [200, -Hh - 96], [360, -Hh - 98], [420, -Hh - 8], [Wd - 8, -Hh + 8], [Wd - 2, -60], [Wd - 14, -40], [10, -40]];
  if (!isFrontProp(o)) {
    g.save(); g.globalAlpha = 0.55; ellP(g, Wd / 2, 6, Wd * 0.56, 16, "#070a0e"); g.restore();
    fillP(g, body, BODY);
    fillP(g, [[150, -Hh - 10], [208, -Hh - 86], [352, -Hh - 88], [400, -Hh - 10]], GLASS);
    strokeP(g, [[150, -Hh - 10], [208, -Hh - 86], [352, -Hh - 88], [400, -Hh - 10]], 5, EDGE);
    fillP(g, [[280, -Hh - 84], [290, -Hh - 12], [396, -Hh + 4], [404, -Hh - 8]], GLASS);
    ellP(g, 24, -100, 16, 12, "#6b2a22");
    g.save(); g.globalAlpha = 0.30; ellP(g, 250, -124, 62, 10, "#5b3a2a"); g.restore();
    // graffiti tag on the door (diegetic, reads right way up)
    g.save(); g.translate(196, -104); g.rotate(-0.06); g.font = "900 46px Arial Black, Arial"; g.lineJoin = "round";
    g.lineWidth = 9; g.strokeStyle = "#1a1d22"; g.strokeText("GG", 0, 0); g.fillStyle = "#f2b134"; g.fillText("GG", 0, 0); g.restore();
  } else {
    // front half: near rocker, wheels, seams, handle, bumper
    fillP(g, [[12, -60], [Wd - 12, -60], [Wd - 14, -40], [10, -40]], DARK);
    for (const wx of [96, 386]) {
      g.fillStyle = "#0a0d11"; g.beginPath(); g.arc(wx, -30, 44, 0, 7); g.fill();
      g.fillStyle = "#1d222a"; g.beginPath(); g.arc(wx, -30, 24, 0, 7); g.fill();
      ellP(g, wx, -30, 9, 9, "#3a424e");
      g.fillStyle = BODY; g.beginPath(); g.arc(wx, -30, 50, Math.PI * 1.08, Math.PI * 1.92); g.lineTo(wx + 50, -30); g.arc(wx, -30, 50, Math.PI * 1.92, Math.PI * 1.08, true); g.fill();
    }
    strokeP(g, [[166, -Hh + 2], [178, -48]], 4, DARK);
    strokeP(g, [[330, -Hh + 4], [334, -48]], 4, DARK);
    fillP(g, rrectP(236, -152, 290, -140, 5), EDGE);
    fillP(g, rrectP(Wd - 22, -84, Wd + 6, -52, 6), EDGE);
  }
  g.restore();
};

/** Bent, dead street lamp: pole + drooping arm + faint flickering pool. */
const poleProp = (g, o) => {
  const S = o.scale ?? 1, H = o.h ?? 900;
  if (!isFrontProp(o)) return;
  g.save(); g.translate(o.x, o.y); g.scale(S, S);
  strokeP(g, [[0, 0], [0, -H], [10, -H - 40], [64, -H - 70]], 22, "#2c323b");
  strokeP(g, [[4, 0], [4, -H], [14, -H - 40], [66, -H - 68]], 7, "#4a525e");
  fillP(g, rrectP(-22, -12, 22, 6, 6), "#232830");
  fillP(g, rrectP(54, -H - 82, 104, -H - 66, 8), "#3a424e");
  ellP(g, 79, -H - 66, 16, 7, "#7c8794");
  g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.10 + 0.03 * Math.sin((o.t ?? 0) * 7);
  const rg = g.createRadialGradient(79, -H - 60, 10, 79, -H - 60, 300);
  rg.addColorStop(0, "#ffe7a8"); rg.addColorStop(1, "rgba(255,220,150,0)");
  g.fillStyle = rg; g.beginPath(); g.arc(79, -H - 60, 300, 0, 7); g.fill(); g.restore();
  g.restore();
};

/** Knocked-over bin + spilled bags. */
const trashProp = (g, o) => {
  const S = o.scale ?? 1;
  if (!isFrontProp(o)) return;
  g.save(); g.translate(o.x, o.y); g.scale(S, S);
  g.save(); g.rotate(-0.24);
  fillP(g, rrectP(-60, -86, 60, 0, 10), "#3a4a5a");
  fillP(g, rrectP(-66, -96, 66, -78, 6), "#2b3846");
  for (let i = -2; i <= 2; i++) strokeP(g, [[i * 22, -80], [i * 22, -6]], 4, "#2b3846");
  g.restore();
  ellP(g, 96, -18, 36, 20, "#20262e");
  ellP(g, 140, -10, 22, 13, "#20262e");
  fillP(g, [[-40, -8], [70, -2], [96, -18], [162, -12], [168, 2], [-42, 4]], "#2a3138");
  g.restore();
};

/** Hydrant, dribbling. */
const hydrantProp = (g, o) => {
  const S = o.scale ?? 1;
  if (!isFrontProp(o)) return;
  g.save(); g.translate(o.x, o.y); g.scale(S, S);
  fillP(g, rrectP(-26, -8, 26, 6, 4), "#4a1f1a");
  fillP(g, rrectP(-30, -110, 30, -6, 12), "#a8322a");
  fillP(g, rrectP(-40, -78, 40, -62, 6), "#b93a31");
  ellP(g, 0, -116, 22, 12, "#b93a31");
  fillP(g, rrectP(-12, -136, 12, -114, 5), "#d0554b");
  g.save(); g.globalAlpha = 0.55; strokeP(g, [[-6, -118], [-14, -40], [-10, 0]], 8, "#7fb6d8"); g.restore();
  ellP(g, 40, -2, 60, 9, "rgba(127,182,216,0.35)");
  g.restore();
};

/** Store sign over a door: diegetic text, always upright. */
const signProp = (g, o) => {
  const S = o.scale ?? 1;
  if (!isFrontProp(o)) return;
  g.save(); g.translate(o.x, o.y); g.scale(S, S);
  const w = o.w ?? 380, h = 92;
  fillP(g, rrectP(-w / 2, -h, w / 2, 0, 8), o.bg || "#1f3b2e");
  strokeP(g, [[-w / 2 + 6, -h + 6], [w / 2 - 6, -h + 6], [w / 2 - 6, -6], [-w / 2 + 6, -6], [-w / 2 + 6, -h + 6]], 4, "#0d1a14");
  g.font = "900 54px Arial Black, Arial"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = o.col || "#e9d9a0"; g.fillText(o.text || "OPEN", 0, -h / 2 + 2);
  g.restore();
};

/** Rebar railing: posts + two rails, depth-split. */
const fenceProp = (g, o) => {
  const S = o.scale ?? 1, w = (o.w ?? 300) * S;
  g.save(); g.translate(o.x, o.y); g.scale(S, S);
  const W = w / S;
  if (!isFrontProp(o)) { strokeP(g, [[0, -56], [W, -50]], 6, "#3a4149"); strokeP(g, [[0, -88], [W, -82]], 5, "#333a42"); }
  else {
    for (let i = 0; i <= Math.round(W / 90); i++) {
      const px = i * 90, lean = i % 2 ? 6 : -4;
      strokeP(g, [[px, 0], [px + lean, -104]], 7, i % 2 ? "#4b535d" : "#414850");
      ellP(g, px + lean, -104, 5, 5, "#5b636d");
    }
    strokeP(g, [[0, -96], [W, -90]], 6, "#4b535d");
  }
  g.restore();
};

/** Graffiti wall strip (brick + a tag). */
const wallProp = (g, o) => {
  const S = o.scale ?? 1, w = (o.w ?? 520), h = (o.h ?? 360);
  if (isFrontProp(o)) return;
  g.save(); g.translate(o.x, o.y); g.scale(S, S);
  fillP(g, rrectP(0, -h, w, 0, 6), o.col || "#3b3f46");
  for (let r = 0; r * 34 < h; r++) for (let c = 0; c * 76 < w; c++) {
    const bx = c * 76 + (r % 2 ? 38 : 0), by = -h + r * 34;
    strokeP(g, [[bx, by], [bx, by + 34], [bx + 76, by + 34]], 3, "#2c3037");
  }
  g.font = "900 62px Arial Black, Arial"; g.lineJoin = "round";
  g.save(); g.translate(w * 0.34, -h * 0.55); g.rotate(-0.05);
  g.lineWidth = 12; g.strokeStyle = "#1d2126"; g.strokeText(o.tag || "RUN", 0, 0);
  g.fillStyle = o.tagCol || "#5bc8d8"; g.fillText(o.tag || "RUN", 0, 0); g.restore();
  g.restore();
};

/** dispatch table: story FRONT objects use {kind: "car", x, y, scale, ...} */
export const PROPS = { car: carProp, pole: poleProp, trash: trashProp, hydrant: hydrantProp, sign: signProp, fence: fenceProp, wall: wallProp };

/** layer: 0 behind actors · 1 between horde and hero · 2 always over the hero */
export function drawProps(g, list, layer) {
  if (!list) return;
  for (const o of list) {
    if ((o.layer ?? 0) !== layer) continue;
    const f = PROPS[o.kind]; if (!f) continue;
    g.save(); f(g, o); g.restore();
  }
}

// shambling infected-figure silhouette: stick-like limbs, hunched, arms out
const zombieSil = (g, x, y, s, t) => {
  const sw = Math.sin(t * 1.6) * 10;          // shambling sway
  g.save();
  g.translate(x, y); g.scale(s, s); g.rotate(sw * 0.004);
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = g.fillStyle;
  // legs
  g.lineWidth = 13;
  g.beginPath(); g.moveTo(0, -150); g.lineTo(-16 + sw, -4); g.stroke();
  g.beginPath(); g.moveTo(0, -150); g.lineTo(18 - sw, -2); g.stroke();
  // torso (slight hunch)
  g.lineWidth = 16;
  g.beginPath(); g.moveTo(0, -150); g.lineTo(2, -320); g.stroke();
  // arms reaching forward
  g.lineWidth = 12; g.lineCap = "round";
  g.beginPath(); g.moveTo(1, -300); g.lineTo(-46 - sw * 0.5, -250); g.stroke();
  g.beginPath(); g.moveTo(1, -300); g.lineTo(44 + sw * 0.5, -262); g.stroke();
  // head
  g.beginPath(); g.ellipse(2, -352, 26, 30, 0, 0, 7); g.fill();
  // open jaw notch
  g.fillStyle = "#3a4048";
  g.beginPath(); g.ellipse(2, -338, 9, 7, 0, 0, 7); g.fill();
  g.restore();
};

const SM_SAFE = {
  WALL: "#4a4034", WALL_D: "#413829", WALL_L: "#524639",
  FLOOR: "#3a3128", FLOOR_D: "#2a231c",
  FRAME: "#6d5a44", FRAME_D: "#4b3d2d",
  BOARD: "#8a6c46", BOARD_D: "#634c31", BOARD_L: "#a98a60", NAIL: "#24201b",
  WOOD: "#7a5f42", WOOD_D: "#5a4640",
  GLASS_T: "#9fd8ef", GLASS_B: "#d8f1e8", GLASS_C: "#e9f7ff",
  BULB: "#ffe6a8", METAL: "#7d8288", METAL_D: "#3c3f43", HOLE: "#14110d",
};

export const BACKDROPS = {
  // ---------------- night apartment interior (couch + window + moon)
  room(g, W, H, t) {
    g.fillStyle = "#232b38"; g.fillRect(-400, -400, W + 800, H + 800);
    g.fillStyle = "#1c2330"; g.fillRect(-400, 1180, W + 800, 800);        // floor
    g.strokeStyle = "#151b26"; g.lineWidth = 6;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(-400 + i * 260, 1180); g.lineTo(-200 + i * 300, H + 400); g.stroke(); }
    nightSky(g, 1080, 900, 300, 330); g.fillRect(-400, 830, W + 800, 380); // wall cut below window
    g.fillStyle = "#2a3446"; g.fillRect(-400, 830, W + 800, 360);
    skyline(g, 1080, 830, "#141b28");
    // window frame
    g.strokeStyle = "#39445c"; g.lineWidth = 16;
    g.strokeRect(120, 130, 420, 700); g.strokeRect(120, 130, 420, 700);
    g.beginPath(); g.moveTo(330, 130); g.lineTo(330, 830); g.moveTo(120, 480); g.lineTo(540, 480); g.stroke();
    // couch (left)
    g.fillStyle = "#3d4a63"; g.fillRect(-160, 980, 560, 300);
    g.fillStyle = "#46567290"; g.fillRect(-160, 920, 560, 90);
    g.fillStyle = "#2f3a4e"; g.fillRect(-120, 1250, 120, 130); g.fillRect(220, 1250, 120, 130);
    // lamp glow on the side table
    g.fillStyle = "#5a4a2e"; g.fillRect(700, 1080, 180, 240);
    const lg = g.createRadialGradient(790, 980, 10, 790, 980, 260);
    lg.addColorStop(0, "#f4d98c40"); lg.addColorStop(1, "#f4d98c00");
    g.fillStyle = lg; g.fillRect(530, 740, 520, 620);
    g.fillStyle = "#e8c878"; g.beginPath(); g.arc(790, 1000, 34, 0, 7); g.fill();
    // front door (right)
    g.fillStyle = "#7a5a3a"; g.fillRect(1390, 300, 320, 1250);
    g.strokeStyle = "#5d4429"; g.lineWidth = 10; g.strokeRect(1390, 300, 320, 1250);
    g.fillStyle = "#8a6a45"; g.fillRect(1416, 330, 268, 420); g.fillRect(1416, 800, 268, 400);
    g.fillStyle = "#c9cfd6"; g.beginPath(); g.arc(1450, 760, 26, 0, 7); g.fill();
  },

  // ---------------- door close-up (peephole + handle) for the knock beat
  door(g, W, H, t) {
    g.fillStyle = "#191f2b"; g.fillRect(-400, -400, W + 800, H + 800);
    g.fillStyle = "#7a5a3a"; g.fillRect(180, -200, 760, 2200);
    g.fillStyle = "#8a6a45"; g.fillRect(220, -160, 680, 2120);
    g.strokeStyle = "#5d4429"; g.lineWidth = 8;
    for (let i = 0; i < 4; i++) { g.strokeRect(240 + i * 168, -160, 150, 2120); }
    // light wedge from the hallway lamp
    g.save(); g.globalAlpha = 0.25;
    g.fillStyle = "#f4d98c"; g.beginPath(); g.moveTo(560, -200); g.lineTo(900, -200); g.lineTo(1060, 1000); g.lineTo(300, 1000); g.closePath(); g.fill();
    g.restore();
    // peephole
    g.beginPath(); g.arc(620, 640, 74, 0, 7); g.fillStyle = "#3c3f43"; g.fill();
    g.beginPath(); g.arc(620, 640, 56, 0, 7); g.fillStyle = "#181c22"; g.fill();
    g.beginPath(); g.arc(610, 628, 18, 0, 7); g.fillStyle = "#39516e"; g.fill();
    g.strokeStyle = "#23272e"; g.lineWidth = 14; g.beginPath(); g.arc(620, 640, 74, 0, 7); g.stroke();
    // handle
    g.fillStyle = "#c9cfd6"; g.fillRect(300, 1160, 210, 56);
    g.fillStyle = "#a9b0b8"; g.fillRect(210, 1140, 110, 96);
    g.beginPath(); g.arc(300, 1330, 22, 0, 7); g.fillStyle = "#3c3f43"; g.fill();
  },

  // ---------------- hallway (perspective corridor + door at the end)
  hallway(g, W, H, t, figureX = 720) {
    g.fillStyle = "#171d29"; g.fillRect(-400, -400, W + 800, H + 800);
    // walls converging to the end door
    g.fillStyle = "#232b3a";
    g.beginPath(); g.moveTo(-200, -200); g.lineTo(560, 380); g.lineTo(560, 1520); g.lineTo(-200, 2100); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(1280, -200); g.lineTo(600, 380); g.lineTo(600, 1520); g.lineTo(1280, 2100); g.closePath(); g.fill();
    g.fillStyle = "#1a2130"; g.beginPath(); g.moveTo(560, 380); g.lineTo(600, 380); g.lineTo(600, 1520); g.lineTo(560, 1520); g.closePath(); g.fill();
    g.fillStyle = "#121824"; g.fillRect(-400, 1720, W + 800, 700);
    // end door with light spill
    g.fillStyle = "#0e1420"; g.fillRect(600, 380, 360, 1140);
    g.save(); g.globalAlpha = 0.5; g.fillStyle = "#dfe6ee";
    g.beginPath(); g.moveTo(640, 1500); g.lineTo(660, 700); g.lineTo(700, 700); g.lineTo(740, 1500); g.closePath(); g.fill();
    g.restore();
    // ceiling lamp
    g.fillStyle = "#e8e2cf"; g.beginPath(); g.arc(820, 210, 26, 0, 7); g.fill();
    g.save(); g.globalAlpha = 0.16; g.fillStyle = "#e8e2cf";
    g.beginPath(); g.moveTo(790, 220); g.lineTo(520, 1560); g.lineTo(1120, 1560); g.closePath(); g.fill(); g.restore();
  },

  // ---------------- stairwell
  stairs(g, W, H, t) {
    g.fillStyle = "#2a2622"; g.fillRect(-400, -400, W + 800, H + 800);
    nightSky(g, 1080, 620, 260, 300);
    g.fillStyle = "#38322c"; g.fillRect(-400, 560, W + 800, 500);
    // steps (diagonal run)
    for (let i = 0; i < 9; i++) {
      const x = -120 + i * 150, y = 700 + i * 130;
      g.fillStyle = "#8a8178"; g.fillRect(x, y, 200, 46);
      g.fillStyle = "#6e675f"; g.fillRect(x, y + 46, 200, 90);
    }
    // railing
    g.strokeStyle = "#3c4a52"; g.lineWidth = 18;
    g.beginPath(); g.moveTo(980, 640); g.lineTo(180, 1780); g.stroke();
    for (let i = 0; i < 6; i++) { const x = 900 - i * 128, y = 700 + i * 172; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 60, y + 210); g.stroke(); }
    // wall grime
    g.globalAlpha = 0.12; g.fillStyle = "#000";
    for (let i = 0; i < 14; i++) g.fillRect(80 + i * 67, 90 + (i * 97) % 400, 40, 120);
    g.globalAlpha = 1;
  },

  // ---------------- night street (props come from the story: FRONT)
  // front.mode = "behind" hides the street's own car and the hero is placed
  // behind the story car's front half; otherwise the street's car is drawn.
  street(g, W, H, t, layer, front) {
    const props = front && front.props;
    if (!layer) {
      nightSky(g, W, 900, 240, 330);
      skyline(g, W, 880, "#10161f");
      g.fillStyle = "#1d232d"; g.fillRect(-1200, 880, W + 3200, H + 2000);
      g.strokeStyle = "#222b38"; g.lineWidth = 6;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-300 + i * 320, 900); g.lineTo(200 + i * 320, H + 400); g.stroke(); }
      // kerb + road markings (foreshortened)
      g.fillStyle = "#232a35"; g.fillRect(-400, 900, W + 800, 26);
      g.save(); g.globalAlpha = 0.28; g.fillStyle = "#b9b39a";
      for (let i = 0; i < 7; i++) { const y = 1200 + i * i * 30; g.fillRect(300 + i * (120 - i * 9), y, 260 - i * 16, 16); }
      g.restore();
      // road debris that has blown in
      g.fillStyle = "#141a22";
      for (const [dx, dy, w2, h2] of [[120, 1180, 60, 15], [860, 1240, 40, 12], [640, 1010, 70, 14], [980, 1460, 54, 12]]) g.fillRect(dx, dy, w2, h2);
      // default horde silhouettes (only when the story sends no actors)
      if (!(front && front.horde)) {
        g.fillStyle = "#0b1017";
        const horde = [[820, 1340, 1.00, 0.0], [980, 1360, 1.10, 0.7], [640, 1370, 1.15, 2.1], [760, 1420, 1.35, 0.4], [1050, 1440, 1.30, 1.1]];
        for (const [hx, hy, hs, ph] of horde) zombieSil(g, hx, hy, hs, t + ph);
      }
      // default abandoned car (the story's car replaces it when present)
      if (!(front && front.noCar)) {
        g.fillStyle = "#0d1219"; g.fillRect(80, 1120, 420, 190);
        g.beginPath(); g.moveTo(140, 1120); g.lineTo(220, 1000); g.lineTo(360, 1000); g.lineTo(430, 1120); g.closePath(); g.fill();
        g.beginPath(); g.arc(190, 1320, 46, 0, 7); g.fill(); g.beginPath(); g.arc(390, 1320, 46, 0, 7); g.fill();
      }
      drawProps(g, props, 0);
    } else if (layer === true) {
      drawProps(g, props, 1);
    } else if (layer === "over") {
      drawProps(g, props, 2);
    }
  },

  // ---------------- THE SAFE ROOM: boarded window, shelf, lamp, floor
  // Where he actually is on "I think we're safe.": warm, calm, no horde. Two
  // rescue silhouettes wait behind the boarded window (story sends them as
  // actors with depth 900+ and base = the window sill).
  safe(g, W, H, t, layer, front) {
    if (layer) return;
    const SK = SM_SAFE;
    // back wall + plaster
    g.fillStyle = SK.WALL; g.fillRect(-1400, -600, W + 2800, H + 2600);
    g.save(); g.globalAlpha = 0.55;
    for (let r = 0; r < 9; r++) for (let c = -2; c < 9; c++) {
      const bx = -120 + c * 220 + (r % 2 ? 110 : 0), by = 120 + r * 200;
      g.fillStyle = (r + c) % 3 ? SK.WALL_D : SK.WALL_L; g.fillRect(bx, by, 196, 96);
    }
    g.restore();
    // damp patches
    g.save(); g.globalAlpha = 0.10; g.fillStyle = "#2b2418";
    for (const [x, y, rx, ry] of [[300, 420, 150, 90], [980, 700, 120, 70], [640, 300, 90, 60]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); }
    g.restore();

    // ---- boarded-up window with daylight behind it (the safe place is INSIDE)
    const win = { x: 540, y: 410, w: 470, h: 560 };
    const x0 = win.x - win.w / 2, x1 = win.x + win.w / 2, y0 = win.y, y1 = win.y + win.h;
    const glow = g.createLinearGradient(0, y0, 0, y1);
    glow.addColorStop(0, SK.GLASS_T); glow.addColorStop(1, SK.GLASS_B);
    g.fillStyle = glow; g.fillRect(x0, y0, win.w, win.h);
    g.save(); g.globalAlpha = 0.5; g.fillStyle = "#dff2ff"; g.fillRect(x0, y0 + win.h * 0.55, win.w, win.h * 0.45); g.restore();
    // silhouettes first (they stand behind the boards)
    // window frame
    g.lineWidth = 22; g.strokeStyle = SK.FRAME; g.strokeRect(x0 - 11, y0 - 11, win.w + 22, win.h + 22);
    g.lineWidth = 8; g.strokeStyle = SK.FRAME_D; g.beginPath(); g.moveTo(win.x, y0); g.lineTo(win.x, y1); g.stroke();
    g.beginPath(); g.moveTo(x0, y0 + win.h * 0.5); g.lineTo(x1, y0 + win.h * 0.5); g.stroke();
    // cracks
    g.save(); g.globalAlpha = 0.5; g.strokeStyle = SK.GLASS_C; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0 + 60, y0 + 40); g.lineTo(x0 + 130, y0 + 150); g.lineTo(x0 + 96, y0 + 260); g.stroke();
    g.beginPath(); g.moveTo(x1 - 50, y1 - 40); g.lineTo(x1 - 140, y1 - 150); g.lineTo(x1 - 190, y1 - 120); g.stroke();
    g.restore();
    // light shaft onto the floor
    g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.16;
    const shaft = g.createLinearGradient(0, y1, 0, 1640);
    shaft.addColorStop(0, "#cfe9ff"); shaft.addColorStop(1, "rgba(207,233,255,0)");
    g.fillStyle = shaft; g.beginPath(); g.moveTo(x0 + 20, y1); g.lineTo(x1 - 20, y1); g.lineTo(x1 + 230, 1640); g.lineTo(x0 - 230, 1640); g.closePath(); g.fill();
    g.restore();
    // wooden boards nailed across the window (and their nails)
    const boards = [[-0.06, 20], [0.22, -14], [0.52, 12], [0.80, -18]];
    for (const [k, rotDeg] of boards) {
      const by = y0 + win.h * k, far = win.w * 0.62;
      g.save(); g.translate(win.x, by); g.rotate(rotDeg * Math.PI / 180);
      g.fillStyle = SK.BOARD; g.fillRect(-far, -26, far * 2, 46);
      g.fillStyle = SK.BOARD_D; g.fillRect(-far, 12, far * 2, 8);
      g.save(); g.globalAlpha = 0.35; g.fillStyle = SK.BOARD_L;
      for (let i = 0; i < 4; i++) g.fillRect(-far + 30 + i * 150, -18 + (i % 2) * 10, 90, 3); g.restore();
      for (const nx of [-far + 60, far - 60]) { g.fillStyle = SK.NAIL; g.beginPath(); g.arc(nx, 0, 7, 0, 7); g.fill(); }
      g.restore();
    }

    // ---- shelf with supplies (left)
    const sh = { x: 120, y: 1128, w: 330, h: 300 };
    g.fillStyle = SK.WOOD; g.fillRect(sh.x, sh.y - sh.h, sh.w, 26);
    g.fillStyle = SK.WOOD_D; g.fillRect(sh.x, sh.y - sh.h + 26, sh.w, 14);
    g.fillStyle = SK.WOOD; g.fillRect(sh.x, sh.y - sh.h * 0.45, sh.w, 22);
    for (const [sx, sy, sw, shh, col] of [[sh.x + 24, sh.y - sh.h - 74, 58, 74, "#8c5a3a"], [sh.x + 92, sh.y - sh.h - 96, 46, 96, "#6f7d6a"], [sh.x + 152, sh.y - sh.h - 54, 70, 54, "#9c4a3a"], [sh.x + 238, sh.y - sh.h - 88, 44, 88, "#7a6a52"], [sh.x + 46, sh.y - sh.h * 0.45 - 66, 90, 66, "#5f6a58"]]) {
      g.fillStyle = col; g.fillRect(sx, sy, sw, shh);
      g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(sx, sy, sw, 8);
      g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(sx + 6, sy + 10, 6, shh - 20);
    }
    // rolled blanket + first-aid box
    g.fillStyle = "#6b4f3a"; g.fillRect(sh.x + 196, sh.y - sh.h * 0.45 - 30, 104, 30);
    g.fillStyle = "#efe9dc"; g.fillRect(sh.x + 210, sh.y - sh.h - 46, 96, 46);
    g.fillStyle = "#c0302f"; g.fillRect(sh.x + 246, sh.y - sh.h - 34, 24, 8); g.fillRect(sh.x + 254, sh.y - sh.h - 42, 8, 24);

    // ---- the manhole cover he just climbed out of (behind him, floor level)
    g.save(); g.globalAlpha = 0.95;
    g.fillStyle = SK.HOLE; g.beginPath(); g.ellipse(540, 1618, 150, 44, 0, 0, 7); g.fill();
    g.lineWidth = 10; g.strokeStyle = SK.METAL_D; g.beginPath(); g.ellipse(540, 1618, 156, 48, 0, 0, 7); g.stroke();
    g.save(); g.globalAlpha = 0.5; g.fillStyle = SK.METAL; g.beginPath(); g.ellipse(470, 1612, 90, 26, 0, 0, 7); g.fill(); g.restore();
    g.restore();

    // ---- floor (worn boards) + rug
    g.fillStyle = SK.FLOOR; g.fillRect(-1400, 1580, W + 2800, H + 1400);
    g.save(); g.globalAlpha = 0.5; g.fillStyle = SK.FLOOR_D;
    for (let i = 0; i < 12; i++) g.fillRect(-1400 + i * 260, 1580, 6, H);
    for (let r = 0; r < 4; r++) g.fillRect(-1400, 1600 + r * 120, W + 2800, 4);
    g.restore();
    g.save(); g.globalAlpha = 0.55;
    g.fillStyle = "#4a3b2c"; g.fillRect(-260, 1606, 900, 250);
    g.fillStyle = "#5b4834"; g.fillRect(-236, 1624, 852, 214);
    g.fillStyle = "#3d3024"; g.fillRect(-200, 1650, 780, 162);
    g.restore();

    // ---- hanging bulb (soft warm light, actually lights the room)
    g.strokeStyle = "#1d1a16"; g.lineWidth = 5; g.beginPath(); g.moveTo(880, 0); g.lineTo(880, 520); g.stroke();
    g.fillStyle = SK.METAL_D; g.fillRect(858, 520, 44, 18);
    g.fillStyle = SK.BULB; g.beginPath(); g.arc(880, 566, 26, 0, 7); g.fill();
    g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.55 + 0.05 * Math.sin(t * 2.1);
    const lg = g.createRadialGradient(880, 566, 8, 880, 566, 620);
    lg.addColorStop(0, "rgba(255,226,160,0.9)"); lg.addColorStop(0.35, "rgba(255,206,130,0.28)"); lg.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = lg; g.beginPath(); g.arc(880, 566, 620, 0, 7); g.fill(); g.restore();

    // ---- "SAFE" spray tag on the wall next to him (diegetic, reads upright)
    g.save(); g.translate(300, 1268); g.rotate(-0.03);
    g.font = "900 74px Arial Black, Arial"; g.lineJoin = "round";
    g.lineWidth = 14; g.strokeStyle = "#2c2418"; g.strokeText("SAFE", 0, 0);
    g.fillStyle = "#7fbf6a"; g.fillText("SAFE", 0, 0);
    g.restore();
  },

  // ---------------- rooftop alley: hero crouched behind a car / AC unit
  alley(g, W, H, t, layer, front) {
    const props = front && front.props;
    if (!layer) {
      g.fillStyle = "#100e0c"; g.fillRect(-400, -400, W + 800, H + 800);
      // brick wall of the building opposite
      g.fillStyle = "#2a2320"; g.fillRect(-400, -400, W + 800, 1180);
      for (let r = 0; r < 16; r++) for (let c = -2; c < 14; c++) {
        const bx = -380 + c * 92 + (r % 2 ? 46 : 0), by = -380 + r * 96;
        g.strokeStyle = "#1b1614"; g.lineWidth = 4; g.strokeRect(bx, by, 92, 96);
      }
      // fire escape (left) — the background moves as the camera moves
      g.strokeStyle = "#121110"; g.lineWidth = 10;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-20, 120 + i * 300); g.lineTo(330, 120 + i * 300); g.stroke(); g.beginPath(); g.moveTo(330, 120 + i * 300); g.lineTo(360, 420 + i * 300); g.stroke(); }
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(-10 + i * 30, 60); g.lineTo(-10 + i * 30, 900); g.stroke(); }
      // wet asphalt
      g.fillStyle = "#171a1e"; g.fillRect(-400, 1180, W + 800, 900);
      g.save(); g.globalAlpha = 0.18; g.fillStyle = "#5c6f86";
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(120 + i * 210, 1300 + (i % 3) * 140, 120, 26, 0, 0, 7); g.fill(); }
      g.restore();
      drawProps(g, props, 0);
    } else if (layer === true) drawProps(g, props, 1);
    else if (layer === "over") drawProps(g, props, 2);
  },

  // ---------------- rooftop
  rooftop(g, W, H, t, layer, front) {
    const props = front && front.props;
    if (!layer) {
      nightSky(g, W, 760, 300, 300);
      skyline(g, W, 760, "#131a26");
      g.fillStyle = "#3a3d42"; g.fillRect(-400, 760, W + 800, 1300);        // roof slab
      g.fillStyle = "#31343a"; g.fillRect(-400, 760, W + 800, 40);
      g.strokeStyle = "#2b2e33"; g.lineWidth = 5;
      for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(-300 + i * 220, 800); g.lineTo(100 + i * 220, H + 400); g.stroke(); }
      // parapet
      g.fillStyle = "#44474d"; g.fillRect(-400, 560, W + 800, 220);
      // water tank
      g.fillStyle = "#3d5a75"; g.fillRect(1120, 180, 240, 460);
      g.fillStyle = "#2c4257"; g.fillRect(1120, 180, 60, 460);
      g.fillStyle = "#26292e"; g.fillRect(1080, 620, 320, 60);
      drawProps(g, props, 0);
    } else if (layer === true) drawProps(g, props, 1);
    else if (layer === "over") drawProps(g, props, 2);
  },
};

// ------------------------------------------------------------- depth test
const FRONT_KINDS = new Set(["car", "pole", "fence", "sign", "trash", "hydrant"]);
/** true → this call paints the prop's front half (closer to the lens than 0). */
export const isFrontProp = (o) => FRONT_KINDS.has(o.kind) && o.back !== true;

// ------------------------------------------------------------- fx layers
export const FX = {
  dust(g, W, H, k, col = "#cdbfa6") {
    // small puffs kicked up around the feet (k = 0..1 spread) — never covers the actor
    g.save()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + k * 2;
      const r = 70 + 150 * k + (i % 3) * 22;
      g.globalAlpha = Math.max(0, 0.30 * (1 - k)) ;
      g.fillStyle = col;
      g.beginPath(); g.ellipse(540 + Math.cos(a) * r, 1688 + Math.sin(a) * r * 0.22, 44 + 36 * k, 22 + 16 * k, 0, 0, 7); g.fill();
    }
    g.restore();
  },
  rain(g, W, H, t, k = 1) {
    g.save(); g.globalAlpha = 0.35 * k; g.strokeStyle = "#9fb4cc"; g.lineWidth = 3;
    for (let i = 0; i < 60; i++) {
      const x = ((i * 173 + t * 900) % (W + 200)) - 100, y = ((i * 331 + t * 2200) % (H + 200)) - 100;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 8, y + 34); g.stroke();
    }
    g.restore();
  },
  grain(g, W, H, f) {
    g.save(); g.globalAlpha = 0.05;
    for (let i = 0; i < 130; i++) { const x = ((i * 977 + f * 137) % W), y = ((i * 613 + f * 293) % H); g.fillStyle = i % 2 ? "#ffffff" : "#000000"; g.fillRect(x, y, 2, 2); }
    g.restore();
  },
  vignette(g, W, H, k = 1) {
    const rg = g.createRadialGradient(W / 2, H * 0.47, H * 0.34, W / 2, H * 0.47, H * 0.95);
    rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(1, `rgba(0,0,0,${0.42 * k})`);
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  },
  flash(g, W, H, k) { g.save(); g.globalAlpha = k; g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H); g.restore(); },

  /** Ambient drift BELOW the actors: dust motes + burning ash of the fallen city. */
  embers(g, W, H, t, k = 1) {
    g.save();
    for (let i = 0; i < 46; i++) {
      const sp = 40 + (i % 7) * 18;
      const x = ((i * 271 + t * sp * 1.6) % (W + 400)) - 200;
      const y = ((i * 419 + H) - t * sp) % (H + 300) - 150;
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3 + i));
      g.globalAlpha = a * k; g.fillStyle = i % 3 ? "#e0953a" : "#f2d27a";
      const r = 1.6 + (i % 4) * 0.9;
      g.beginPath(); g.arc(x + Math.sin(t * 1.3 + i) * 12, y, r, 0, 7); g.fill();
    }
    // a few slow smoke wisps in the background
    g.globalAlpha = 0.10 * k; g.fillStyle = "#8d96a3";
    for (let i = 0; i < 5; i++) {
      const bx = 120 + i * 230, by = 900 - ((t * 40 + i * 120) % 700);
      g.beginPath(); g.ellipse(bx + Math.sin(t * 0.7 + i) * 30, by, 90, 46, 0, 0, 7); g.fill();
    }
    g.restore();
  },

  /** Scorched paper scraps blown across the frame (always crossing L→R). */
  paper(g, W, H, t, k = 1) {
    g.save();
    for (let i = 0; i < 10; i++) {
      const sp = 260 + (i % 4) * 90;
      const x = ((i * 397 + t * sp) % (W + 500)) - 250;
      const y = 700 + ((i * 211) % 900) + Math.sin(t * 2 + i) * 30;
      const rot = t * (2 + (i % 3)) + i;
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(t * 3 + i)));
      g.globalAlpha = 0.75 * k; g.fillStyle = i % 2 ? "#cfc6ae" : "#a89c80";
      g.fillRect(-14, -9, 28, 18);
      g.fillStyle = "#6b5f48"; g.fillRect(-10, -4, 14, 2); g.fillRect(-10, 1, 10, 2);
      g.restore();
    }
    g.restore();
  },

  /** Radial speed lines from the frame centre (sprint / whip-pan). */
  speed(g, W, H, t, k = 1, dir = 1) {
    g.save(); g.globalAlpha = 0.30 * k; g.strokeStyle = "#dbe6f2"; g.lineCap = "round";
    const cx = W / 2, cy = H * 0.46;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 3.1) * 0.05;
      const r0 = 420 + ((i * 97 + t * 2600 * dir) % 700);
      const r1 = r0 + 130 + (i % 4) * 60;
      g.lineWidth = 2 + (i % 3);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 1.25); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 1.25); g.stroke();
    }
    g.restore();
  },

  /** Screen-space grade: { tint:"#rrggbb", a:0..1, desat:0..1, mode:"multiply|screen" }. */
  dustmotes(g, W, H, t, k = 1) {
    g.save();
    for (let i = 0; i < 34; i++) {
      const x = 200 + ((i * 331 + t * 26 + Math.sin(t * 0.6 + i) * 40) % 760);
      const y = 300 + ((i * 197 + t * 14 + Math.cos(t * 0.4 + i) * 26) % 1200);
      g.globalAlpha = (0.10 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7))) * k;
      g.fillStyle = i % 3 ? "#ffe9bd" : "#ffffff";
      g.beginPath(); g.arc(x, y, 1.4 + (i % 3) * 1.1, 0, 7); g.fill();
    }
    g.restore();
  },
  safelight(g, W, H, t, k = 1) {
    // warm, gentle pool around the frame centre — the room is lit, not threatening
    g.save(); g.globalAlpha = 0.20 * k;
    const rg = g.createRadialGradient(W / 2, H * 0.42, 120, W / 2, H * 0.42, H * 0.9);
    rg.addColorStop(0, "rgba(255,214,150,0.55)"); rg.addColorStop(0.55, "rgba(255,196,120,0.10)"); rg.addColorStop(1, "rgba(255,190,110,0)");
    g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
  },
  grit(g, W, H, t, k = 1) {
    // gravel + dust kicked toward the lens while he sprints
    g.save();
    for (let i = 0; i < 26; i++) {
      const ph = ((t * (1.2 + (i % 5) * 0.3) + i * 0.17) % 1);
      const x = ((i * 397) % W) + ph * 320 - 160;
      const y = 1500 + ((i * 211) % 380) - ph * ph * 260;
      g.globalAlpha = (1 - ph) * 0.55 * k;
      g.fillStyle = i % 4 ? "#8d8577" : "#c8bda8";
      g.fillRect(x, y, 3 + (i % 3) * 2, 3 + (i % 2) * 2);
    }
    g.restore();
  },
  /** flat screen tint on top of everything (the blood pulse on "bleeding") */
  tint(g, W, H, k) {
    g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.5 * k;
    const rg = g.createRadialGradient(W / 2, H * 0.6, 60, W / 2, H * 0.6, H * 0.8);
    rg.addColorStop(0, "rgba(232,30,20,0)"); rg.addColorStop(1, "rgba(232,30,20,0.95)");
    g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
  },
  grade(g, W, H, gr) {
    g.save();
    if (gr.desat) {
      g.globalCompositeOperation = "saturation"; g.globalAlpha = gr.desat; g.fillStyle = "#808080";
      g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = gr.mode || "multiply";
    g.globalAlpha = gr.a ?? 0.2; g.fillStyle = gr.tint || "#ff8a6a"; g.fillRect(0, 0, W, H);
    g.restore();
  },
};
