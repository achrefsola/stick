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

/*
 * Front-layer props (cars, poles, ...). A backdrop may take a 5th argument
 * front=true and then paints ONLY the props that sit in front of the actors;
 * main.js calls it a second time around the near actors (see story depth).
 */

function renderFrame(f) {
  const T = f / FPS;
  const shot = shotAt(f);
  const e = (ease[shot.ease || "lin"] || ease.lin)(shot.i);
  const cam = story.camAt ? story.camAt(f) : { x: 540, y: 960, z: 1 };

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H / 2); g.scale(cam.z, cam.z); g.translate(-cam.x, -cam.y);

  const bd = BACKDROPS[shot.backdrop] || BACKDROPS.crash;
  const frontArgs = story.frontAt ? story.frontAt(f) : (story.FRONT || null);
  bd(g, W, H, T, false, frontArgs);

  // actors, far → near. Objects tagged {depth} are horde members: they sit
  // inside the backdrop, so they paint here (below the hero) but still animate.
  const actors = (story.actorsAt(f, T) || []).slice();
  const sortY = (a) => (a.depth != null ? -1e6 + a.depth : (a.y ?? 0));
  actors.sort((a, b) => sortY(a) - sortY(b));
  const drawOne = (a) => {
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
      props: a.props ?? null, bloodFx: a.bloodFx ?? null, zombie: a.zombie ?? false,
      viseme: a.viseme ?? null, cap: a.cap ?? "red", vest: a.vest ?? false,
    });
    // aerial perspective: a flat dark wash over a whole figure = it sits further back
    if (a.tint > 0) {
      g.globalCompositeOperation = "source-atop";
      g.globalAlpha = 1; g.fillStyle = `rgba(11,16,23,${a.tint})`;
      // exactly the design canvas the stick is drawn on (never a box round the actor)
      g.fillRect(0, 0, 600, 1000);
    }
    g.restore();
  };
  for (const a of actors) if (a.depth != null) drawOne(a);
  // ground contact shadows (own layer: painted over the road, under props + hero)
  bd(g, W, H, T, "shadow", { shadows: actors.filter((a) => a.shadow) });
  // props that stand between the horde and the hero
  bd(g, W, H, T, true, frontArgs);
  for (const a of actors) if (a.depth == null) drawOne(a);
  // props in front of the hero (cars the camera is behind, etc.)
  if (story.FRONT_OVER) { g.save(); g.globalAlpha = 1; bd(g, W, H, T, "over", frontArgs); g.restore(); }

  // fx
  const SCROLL = story.scrollAt ? story.scrollAt(f) : 0;
  for (const fx of story.fxAt ? story.fxAt(f, T) || [] : []) {
    if (fx.kind === "dust") FX.dust(g, W, H, fx.k ?? 0, fx.col);
    if (fx.kind === "rain") FX.rain(g, W, H, T, fx.k ?? 1);
    if (fx.kind === "flash") FX.flash(g, W, H, fx.k ?? 0);
    if (fx.kind === "embers") FX.embers(g, W, H, T, fx.k ?? 1);
    if (fx.kind === "paper") FX.paper(g, W, H, T, fx.k ?? 1, SCROLL);
    if (fx.kind === "speed") FX.speed(g, W, H, T, fx.k ?? 1, fx.dir ?? 1);
    if (fx.kind === "dustmotes") FX.dustmotes(g, W, H, T, fx.k ?? 1);
    if (fx.kind === "safelight") FX.safelight(g, W, H, T, fx.k ?? 1);
    if (fx.kind === "grit") FX.grit(g, W, H, T, fx.k ?? 1);
    if (fx.kind === "tint") FX.tint(g, W, H, fx.a ?? 0.3);
  }

  g.restore();

  // post: grade (slow-mo / punch tint), vignette + grain
  if (story.gradeAt) { const gr = story.gradeAt(f); if (gr) FX.grade(g, W, H, gr); }
  const inSafe = shot.kind === "safe";
  FX.vignette(g, W, H, inSafe ? 0.26 : 1);          // the safe room breathes: softer corners
  if (!inSafe) FX.grain(g, W, H, f);

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
