// ============================================================ 2D ENGINE MAIN
// Consumes ./story.js — the single story file the pipeline edits:
//   export const SHOTS     = [{n, backdrop, cam:{x,y,z}, ease}]
//   export const camAt(f)      -> {x, y, z}   world point shown at frame centre
//   export const actorsAt(f,T) -> [{x, y, scale, pose, expr, facing, gear, step, run, cone, blink, look}]
//   export const fxAt(f, T)    -> [{kind:"dust|rain|flash", ...}]
//   export const CAPTIONS  = [{t0,t1,text, cy?}]   (optional, off unless asked)
//   export const TAG       = "DAY 11"              (optional corner tag)
// Exposes window.renderFrame(f) + window.ready for render.mjs.

import { drawStick } from "./stickman.js";
import { BACKDROPS, FX } from "./world2d.js";
import * as story from "./story.js";

const W = 1080, H = 1920, FPS = 30;
const cv = document.getElementById("c");
cv.width = W; cv.height = H;
const g = cv.getContext("2d");

const TOTAL = story.SHOTS.reduce((a, s) => a + s.n, 0);

function shotAt(f) {
  let acc = 0;
  for (const s of story.SHOTS) { if (f < acc + s.n) return { ...s, f0: acc, i: (f - acc) / Math.max(1, s.n - 1) }; acc += s.n; }
  const s = story.SHOTS[story.SHOTS.length - 1];
  return { ...s, f0: acc, i: 1 };
}
const ease = { lin: (p) => p, out: (p) => 1 - (1 - p) ** 3, inout: (p) => 0.5 - 0.5 * Math.cos(Math.PI * p), in: (p) => p * p };

function renderFrame(f) {
  const T = f / FPS;
  const shot = shotAt(f);
  const e = (ease[shot.ease || "lin"] || ease.lin)(shot.i);
  const cam = story.camAt ? story.camAt(f) : { x: 540, y: 960, z: 1 };

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H / 2); g.scale(cam.z, cam.z); g.translate(-cam.x, -cam.y);

  const bd = BACKDROPS[shot.backdrop] || BACKDROPS.room;
  bd(g, W, H, T);

  // actors
  const actors = story.actorsAt(f, T) || [];
  for (const a of actors) {
    g.save();
    const s = a.scale || 1;
    // anchor: design-space (cx=300, soles=975) maps to the actor's (x, y)
    g.translate(a.x - 300 * s, a.y - 975 * s);
    g.scale(s, s);
    drawStick(g, {
      expr: a.expr, blink: a.blink ?? 0, look: a.look ?? 0, facing: a.facing ?? 0,
      seed: a.seed ?? 3, L: a.L || "hang", R: a.R || "hang", step: a.step ?? 0,
      run: a.run ?? 0, tilt: a.tilt ?? 0, headTilt: a.headTilt ?? 0, bob: a.bob ?? 0,
      gear: a.gear ?? null, cone: a.cone ?? 0,
    });
    g.restore();
  }

  // fx
  for (const fx of story.fxAt ? story.fxAt(f, T) || [] : []) {
    if (fx.kind === "dust") FX.dust(g, W, H, fx.k ?? 0, fx.col);
    if (fx.kind === "rain") FX.rain(g, W, H, T, fx.k ?? 1);
    if (fx.kind === "flash") FX.flash(g, W, H, fx.k ?? 0);
  }

  g.restore();

  // post: vignette + grain (outside the camera transform)
  FX.vignette(g, W, H);
  FX.grain(g, W, H, f);

  // captions (only when the story defines them — off by default)
  if (story.CAPTIONS) {
    for (const c of story.CAPTIONS) {
      if (T >= c.t0 && T < c.t1) {
        const a = Math.min(1, (T - c.t0) / 0.07, (c.t1 - T) / 0.07);
        g.save(); g.globalAlpha = a;
        g.font = "900 74px Arial Black, Arial"; g.textAlign = "center"; g.lineJoin = "round";
        g.lineWidth = 14; g.strokeStyle = "rgba(0,0,0,0.8)";
        const y = c.cy ?? 1360;
        g.strokeText(c.text, W / 2, y);
        g.fillStyle = "#ffffff"; g.fillText(c.text, W / 2, y);
        g.restore();
      }
    }
  }
  if (story.TAG) {
    g.save(); g.globalAlpha = 0.92;
    g.font = "900 40px Arial Black, Arial"; g.textAlign = "center"; g.lineJoin = "round";
    const tw = g.measureText(story.TAG).width + 30;
    g.lineWidth = 12; g.strokeStyle = "rgba(0,0,0,0.75)"; g.strokeText(story.TAG, W / 2, 232);
    g.fillStyle = "#ffffff"; g.fillText(story.TAG, W / 2, 232);
    g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(W / 2 - tw / 2 + 6, 252); g.lineTo(W / 2 + tw / 2 - 6, 252); g.stroke();
    g.restore();
  }
}

window.renderFrame = (f) => {
  const fi = Math.max(0, Math.min(TOTAL - 1, Math.round(f)));
  renderFrame(fi);
};
window.FRAMES = TOTAL;
window.err = null;
try { window.renderFrame(0); } catch (e) { window.err = e.message; console.error(e); }
window.ready = true;
