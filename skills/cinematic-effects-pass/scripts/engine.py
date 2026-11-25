"""Cinematic engine: declarative scene effects -> deterministic frames + audio plan.

This module is the effects LAYER of the existing pipeline. It never decides
timing itself: every segment boundary comes from scene_manifest.json, and every
event time is either an absolute second or resolved from the word-level
transcript (phrase anchor), so enhancements can never desynchronize the edit.

Per enhanced segment, the engine renders exactly counts[i] frames of 1920x1080
(the same frame counts the render graph derives from the manifest):

  1. motion    - zoom/pan camera state per frame (presets in _kf), sampled from
                 a 3x-supersampled source; animation is specified in seconds so
                 it is frame-rate independent, and the source rect is clamped
                 so no border can ever be exposed.
  2. lighting  - flashlight vignette, warm lamp glows, flicker and dimming.
  3. overlays  - hand-drawn 2D events from overlays.py, alpha-composited.
  4. baked     - the day-boundary dips the legacy graph would otherwise apply
    fades        to stills, plus the configured final cut to black.

render_video.py --cinematic then consumes the intermediates through the SAME
concat path as before and mixes the audio plan (beds with piecewise-linear
envelopes + phrase-anchored one-shots) under the narration.
"""
import math
import os
import random
import re
import zlib

import numpy as np
from PIL import Image

import overlays as Ov

ROOT = None          # set by init()
FPS = 30
SS = 3               # supersample factor for the motion source
DIR = os.path.dirname(os.path.abspath(__file__))

CFG = None
MANIFEST = None
WORDS = None


# --------------------------------------------------------------------------
# setup
# --------------------------------------------------------------------------

def init(root):
    global ROOT, CFG, MANIFEST, WORDS
    ROOT = root
    CFG = json_load(os.path.join(DIR, "effects.json"))
    MANIFEST = json_load(os.path.join(ROOT, "_pipeline", "scene_manifest.json"))
    wp = os.path.join(ROOT, "_pipeline", "transcript", "words.json")
    WORDS = json_load(wp)["words"] if os.path.exists(wp) else []
    return CFG


def available(root):
    """True when effects.json exists and parses (legacy mode otherwise)."""
    try:
        init(root)
        return True
    except Exception:
        return False


def json_load(p):
    import json
    with open(p, "r", encoding="utf-8") as fh:
        return json.load(fh)


def segments():
    return MANIFEST["segments"]


def counts():
    """Frame counts per segment - the single source of timing truth."""
    segs = segments()
    bounds = [round(s["start"] * FPS) for s in segs]
    bounds.append(round(MANIFEST["audio_duration_sec"] * FPS))
    return [bounds[i + 1] - bounds[i] for i in range(len(segs))], bounds


def stable_seed(v):
    if isinstance(v, (int, float)):
        return int(v) & 0xFFFFFFFF
    return zlib.crc32(str(v).encode("utf-8"))


# --------------------------------------------------------------------------
# time resolution: {"t": seconds} or {"phrase": "...", ...}, optional offset
# --------------------------------------------------------------------------

def _norm_word(w):
    return re.sub(r"[^a-z0-9']", "", w.lower())


def resolve_time(spec):
    if spec is None:
        raise ValueError("missing time spec")
    if isinstance(spec, (int, float)):
        return float(spec)
    if isinstance(spec, list):
        return resolve_time(spec[0])
    t = spec.get("t")
    if t is not None:
        return float(t) + float(spec.get("offset", 0))
    phrase = spec["phrase"]
    ptoks = [_norm_word(x) for x in phrase.split()]
    words = [(_norm_word(w["w"]), w["start"]) for w in WORDS]
    n = len(ptoks)
    hits = [i for i in range(len(words) - n + 1)
            if [words[i + j][0] for j in range(n)] == ptoks]
    if not hits:
        raise ValueError("phrase not found in transcript: %r" % phrase)
    # "nth" selects the occurrence: a word like "containers" can recur days later
    idx = int(spec.get("nth", 0))
    if idx >= len(hits):
        raise ValueError("phrase %r has only %d occurrence(s), nth=%d"
                         % (phrase, len(hits), idx))
    return words[hits[idx]][1] + float(spec.get("offset", 0))


def resolve_times(spec):
    """A time, a list of times, or a phrase-anchored run (count/interval)."""
    if isinstance(spec, list):
        return [resolve_time(s) for s in spec]
    if "phrase" in spec and "count" in spec:
        t0 = resolve_time({"phrase": spec["phrase"], "offset": spec.get("offset", 0)})
        step = float(spec.get("interval", 0.32))
        return [t0 + k * step for k in range(int(spec["count"]))]
    return [resolve_time(spec)]


# --------------------------------------------------------------------------
# motion presets -> keyframes (z0,z1,cx0,cy0,cx1,cy1) + per-frame camera state
# --------------------------------------------------------------------------

def ease(p, kind="smooth"):
    p = min(1.0, max(0.0, p))
    if kind == "linear":
        return p
    if kind == "in":
        return p * p
    if kind == "out":
        return 1 - (1 - p) ** 2
    if kind == "smoother":
        return p * p * p * (6 * p * p - 15 * p + 10)
    return p * p * (3 - 2 * p)  # smoothstep


def _kf(preset, m):
    """Keyframes in normalized frame coordinates."""
    fx, fy = m.get("focus", [0.5, 0.5])
    z = float(m.get("zoom", 1.12))
    room = 1 - 1 / z
    tr = float(m.get("travel", 0.8))
    if preset == "push_in":
        return 1.0, z, 0.5, 0.5, fx, fy
    if preset == "pull_out":
        return z, 1.0, fx, fy, 0.5, 0.5
    if preset == "zoom_focus":
        return float(m.get("zoom_start", 1.0)), z, fx, fy, fx, fy
    if preset == "pan_lr":
        return z, z, 0.5 - room * tr / 2, fy, 0.5 + room * tr / 2, fy
    if preset == "pan_rl":
        return z, z, 0.5 + room * tr / 2, fy, 0.5 - room * tr / 2, fy
    if preset == "tilt_up":
        ry = 1 - 1 / z
        return z, z, fx, 0.5 + ry * tr / 2, fx, 0.5 - ry * tr / 2
    if preset == "tilt_down":
        ry = 1 - 1 / z
        return z, z, fx, 0.5 - ry * tr / 2, fx, 0.5 + ry * tr / 2
    if preset == "ken_burns":
        return 1.0, z, 0.5 - 0.02, 0.5, fx, fy
    if preset in ("drift", "handheld", "static", "hold"):
        # `hold` = static at a chosen zoom: no camera movement, but enough
        # margin for a justified shake to read without exposing a border
        zd = 1.0 if preset == "static" else float(m.get("zoom", 1.06))
        return zd, zd, m.get("focus", [0.5, 0.5])[0], m.get("focus", [0.5, 0.5])[1], \
            m.get("focus", [0.5, 0.5])[0], m.get("focus", [0.5, 0.5])[1]
    raise ValueError("unknown motion preset %r" % preset)


class Motion:
    """Per-frame camera state. Deterministic; all durations in seconds."""

    def __init__(self, m, dur):
        self.dur = max(dur, 1e-6)
        self.ease_kind = m.get("ease", "smooth")
        self.preset = m.get("preset", "static")
        self.z0, self.z1, self.cx0, self.cy0, self.cx1, self.cy1 = _kf(self.preset, m)
        self.wander = 0.0
        if self.preset in ("drift", "handheld"):
            self.wander = float(m.get("wander", 0.008 if self.preset == "drift" else 0.012))
            r = random.Random(stable_seed(m.get("seed", 17)))
            self.wph = [r.uniform(0, 6.28) for _ in range(4)]
            self.wT = [r.uniform(6.0, 11.0), r.uniform(3.5, 6.5)]
        self.shakes = []
        for ev in m.get("camera_events", []):
            for t0 in resolve_times(ev["at"]):
                jitter = 0.9 + 0.2 * random.Random(int(t0 * 100) + 7).random()
                self.shakes.append((t0, float(ev.get("amp", 6)) * jitter,
                                    float(ev.get("freq", 9)), float(ev.get("decay", 7))))

    def state(self, t_abs, t_local):
        p = ease(t_local / self.dur, self.ease_kind)
        z = self.z0 + (self.z1 - self.z0) * p
        cx = self.cx0 + (self.cx1 - self.cx0) * p
        cy = self.cy0 + (self.cy1 - self.cy0) * p
        if self.wander:
            w = self.wander
            cx += w * (0.6 * math.sin(2 * math.pi * t_local / self.wT[0] + self.wph[0])
                       + 0.4 * math.sin(2 * math.pi * t_local / self.wT[1] + self.wph[1]))
            cy += w * 0.8 * (0.6 * math.sin(2 * math.pi * t_local / self.wT[1] + self.wph[2])
                             + 0.4 * math.sin(2 * math.pi * t_local / self.wT[0] + self.wph[3]))
        shx = shy = 0.0
        for t0, amp, freq, dec in self.shakes:
            u = t_abs - t0
            if 0 <= u < 1.2:
                shx += amp * math.exp(-dec * u) * math.sin(2 * math.pi * freq * u)
                shy += amp * 0.7 * math.exp(-dec * u) * math.sin(2 * math.pi * freq * 0.83 * u + 1.1)
        room = 1 - 1 / z
        cx = min(max(cx, room / 2), 1 - room / 2)
        cy = min(max(cy, room / 2), 1 - room / 2)
        return z, cx, cy, shx, shy


def sample_rect(motion, t_abs, t_local):
    """Integer crop box on the supersampled source, clamped (no borders)."""
    z, cx, cy, shx, shy = motion.state(t_abs, t_local)
    rw = 1.0 / z
    # normalized coords already span the full 16:9 image on both axes, so the
    # visible rect is rw x rw - an H/W factor here would silently multiply every
    # zoom by 1.78 and crop the frame top and bottom
    rh = rw
    x0 = (cx - rw / 2 + shx / Ov.W) * SS * Ov.W
    y0 = (cy - rh / 2 + shy / Ov.H) * SS * Ov.H
    wpx, hpx = rw * SS * Ov.W, rh * SS * Ov.H
    x0 = min(max(x0, 0.0), SS * Ov.W - wpx)
    y0 = min(max(y0, 0.0), SS * Ov.H - hpx)
    xi, yi = int(x0), int(y0)
    xi2 = min(SS * Ov.W, xi + int(round(wpx)))
    yi2 = min(SS * Ov.H, yi + int(round(hpx)))
    return xi, yi, xi2, yi2


# --------------------------------------------------------------------------
# lighting
# --------------------------------------------------------------------------

_MAP_CACHE = {}


def radial_map(cx, cy, radius_norm, power=2.0):
    """uint16 radial map (0 at the focus, 4095 at/ beyond the radius)."""
    key = (round(cx, 4), round(cy, 4), round(radius_norm, 4), power)
    if key in _MAP_CACHE:
        return _MAP_CACHE[key]
    yy, xx = np.mgrid[0:Ov.H:4, 0:Ov.W:4].astype(np.float32)
    dx = (xx - cx * Ov.W) / (radius_norm * Ov.W)
    dy = (yy - cy * Ov.H) / (radius_norm * Ov.H)
    r = np.sqrt(dx * dx + dy * dy)
    m = (np.clip(r, 0, 1) ** power * 4095).astype(np.uint16)
    _MAP_CACHE[key] = m
    return m


def beam_map(fx, fy, tx, ty, width, power=1.5):
    """uint16 elliptical falloff along a flashlight beam (0 dark, 4095 lit).

    `from` is where the light is held, `to` where it points; the pool is hot
    near the source and fades along the beam, which is what makes a handheld
    light read as a beam instead of a centred tunnel.
    """
    key = ("beam", round(fx, 3), round(fy, 3), round(tx, 3), round(ty, 3), round(width, 3))
    if key in _MAP_CACHE:
        return _MAP_CACHE[key]
    yy, xx = np.mgrid[0:Ov.H:4, 0:Ov.W:4].astype(np.float32)
    ax, ay = (tx - fx) * Ov.W, (ty - fy) * Ov.H
    px, py = xx - fx * Ov.W, yy - fy * Ov.H
    l2 = max(ax * ax + ay * ay, 1e-6)
    t = np.clip((px * ax + py * ay) / l2, 0.0, 1.0)
    qx, qy = px - t * ax, py - t * ay
    perp = np.sqrt(qx * qx + qy * qy) / max(width * Ov.W, 1e-6)
    m = np.clip(1.0 - perp, 0.0, 1.0) ** power
    m *= 0.35 + 0.65 * (1.0 - t)
    m = np.clip(m, 0.0, 1.0) * 4095.0
    _MAP_CACHE[key] = m.astype(np.uint16)
    return _MAP_CACHE[key]


class Lighting:
    """Vignette / warm glow / flicker / flashlight beam; global dim is merged
    into baked fades."""

    def __init__(self, cfg):
        self.flicker = cfg.get("flicker")
        self.vig = cfg.get("vignette")
        self.warm = cfg.get("warm")
        self.beam = cfg.get("beam")
        if self.vig:
            v = self.vig
            m = radial_map(0.5, 0.5, v.get("radius", 0.75), 1.0)
            self._vig_idx = (m.astype(np.float32) / 4095 * 511).astype(np.int32)
        if self.warm:
            w = self.warm
            m = radial_map(w["pos"][0], w["pos"][1], w.get("radius", 0.5), 1.7)
            self._warm_idx = (m.astype(np.float32) / 4095 * 1023).astype(np.int32)
            self._warm_col = np.array(w.get("color", Ov.WARM), np.float32)
            self._warm_gain = float(w.get("gain", 0.55))

    def apply(self, im, t):
        f = 1.0
        if self.flicker:
            fl = self.flicker
            t0 = resolve_time(fl["t0"])
            t1 = resolve_time(fl["t1"])
            if t0 <= t <= t1:
                u = (t - t0) / max(1e-6, t1 - t0)
                f *= 1 - fl.get("depth", 0.10) * \
                    (0.5 + 0.5 * math.sin(2 * math.pi * fl.get("cycles", 3) * u)) * \
                    math.sin(math.pi * u) ** 0.5
        if f < 0.999:
            im = im.point(_global_lut(f))
        if self.vig:
            v = self.vig
            t_on = resolve_time(v["t_on"])
            t_off = v.get("t_off")
            t_off = resolve_time(t_off) if t_off is not None and not isinstance(t_off, (int, float)) else t_off
            if t >= t_on and (t_off is None or t <= t_off):
                k = min(1.0, (t - t_on) / v.get("ramp", 0.5))
                if t_off is not None:
                    k *= min(1.0, (t_off - t) / v.get("ramp", 0.5))
                strength = v.get("strength", 0.38) * k
                if strength > 0.01:
                    u = np.linspace(0, 1, 512)
                    lutv = 1 - strength * np.clip(u / v.get("edge", 1.0), 0, 1) ** 1.8
                    lut = (np.clip(lutv, 0, 1) * 255).astype(np.uint8)
                    mask = lut[self._vig_idx]
                    from PIL import ImageChops
                    mimg = Image.fromarray(np.dstack([mask] * 3), "RGB") \
                                 .resize((Ov.W, Ov.H), Image.BILINEAR)
                    im = ImageChops.multiply(im, mimg)
        if self.beam:
            b = self.beam
            bm = beam_map(b["from"][0], b["from"][1], b["to"][0], b["to"][1],
                          float(b.get("width", 0.16)))
            strength = float(b.get("strength", 0.5))
            from PIL import ImageChops
            lut = (np.clip(1.0 - strength * (1.0 - bm / 4095.0), 0.0, 1.0) * 255).astype(np.uint8)
            im = ImageChops.multiply(im, Image.fromarray(np.dstack([lut] * 3), "RGB")
                                     .resize((Ov.W, Ov.H), Image.BILINEAR))
            wash = float(b.get("warm", 0.35))
            if wash > 0:
                lit = (np.clip(bm / 4095.0, 0.0, 1.0) * 255.0 * wash).astype(np.uint8)
                col = np.array(Ov.WARM, np.float32)
                layer = np.zeros((Ov.H // 4, Ov.W // 4, 3), np.uint8)
                for c in range(3):
                    layer[..., c] = np.clip(lit * (col[c] / 255.0), 0, 255).astype(np.uint8)
                im = ImageChops.screen(im, Image.fromarray(layer, "RGB")
                                       .resize((Ov.W, Ov.H), Image.BILINEAR))
        if self.warm:
            w = self.warm
            env = w.get("env")
            if env:
                k = Ov._piecewise([[resolve_time({"t": p[0]}), p[1]] for p in env], t)
            else:
                t_on = resolve_time(w["t_on"])
                k = min(1.0, max(0.0, (t - t_on) / w.get("ramp", 0.6)))
                t_off = w.get("off_at")
                if t_off is not None:
                    t_off = resolve_time(t_off) if not isinstance(t_off, (int, float)) else t_off
                    if t >= t_off:
                        k *= max(0.0, w.get("off_to", 0.0)) if t > t_off + 0.12 else \
                            max(0.0, 1 - (t - t_off) / 0.12) * (1 - w.get("off_to", 0.0)) + w.get("off_to", 0.0)
            if k > 0.01:
                u = np.linspace(0, 1, 1024)
                lutv = (1 - u ** 1.4) * min(1.5, k) * self._warm_gain
                layer = np.zeros((Ov.H // 4, Ov.W // 4, 3), np.uint8)
                for c in range(3):
                    layer[..., c] = np.clip(lutv[self._warm_idx] * self._warm_col[c], 0, 255).astype(np.uint8)
                from PIL import ImageChops
                wl = Image.fromarray(layer, "RGB").resize((Ov.W, Ov.H), Image.BILINEAR)
                im = ImageChops.screen(im, wl)
        return im


# --------------------------------------------------------------------------
# overlays + dust state
# --------------------------------------------------------------------------

_DUST = {}


def _dust_tracks(ev):
    rnd = random.Random(stable_seed(ev.get("seed", 1)) * 977 + 5)
    x0, y0, x1, y1 = ev.get("box", [0.1, 0.1, 0.9, 0.9])
    n = int(ev.get("count", 12))
    gain = ev.get("gain", 1.0)
    tracks = []
    for _ in range(n):
        bx = rnd.uniform(x0 * Ov.W, x1 * Ov.W)
        by = rnd.uniform(y0 * Ov.H, y1 * Ov.H)
        vx = rnd.uniform(-6, 6)
        vy = rnd.uniform(-14, -4)
        ph = rnd.uniform(0, 6.28)
        r = rnd.uniform(1.6, 3.4)
        tw = rnd.uniform(0.15, 0.5)
        base = rnd.uniform(28, 70) * gain
        tracks.append((bx, by, vx, vy, ph, r, tw, base))
    return tracks


def dust_state(ev, t):
    key = ev["seed"]
    if key not in _DUST:
        _DUST[key] = _dust_tracks(ev)
    W, H = Ov.W, Ov.H
    pts = []
    for (bx, by, vx, vy, ph, r, tw, base) in _DUST[key]:
        x = (bx + vx * t + 26 * math.sin(0.4 * t + ph)) % W
        y = (by + vy * t + 16 * math.sin(0.33 * t + ph * 2)) % H
        a = base * (0.6 + 0.4 * math.sin(2 * math.pi * t / tw + ph))
        pts.append((x, y, r, max(0.0, a)))
    return {"tracks": pts}


# --------------------------------------------------------------------------
# segment plan
# --------------------------------------------------------------------------

class SegPlan:
    """Everything needed to render one enhanced segment's frames."""

    def __init__(self, seg, cfg, t0, t1, nframes, fade_pts):
        self.seg = seg
        self.t0, self.t1 = t0, t1
        self.n = nframes
        self.dur = t1 - t0
        self.motion = Motion(cfg["motion"], self.dur) if cfg.get("motion") else None
        # a truly static segment (no shake, no wander) needs no motion sampling:
        # keep the source at native resolution instead of a supersample round-trip
        if self.motion is not None and self.motion.preset in ("static", "hold") \
                and not self.motion.shakes and not self.motion.wander:
            self.motion = None
        self.light = Lighting(cfg["light"]) if cfg.get("light") else None
        self.events = []
        for i, ev in enumerate(cfg.get("overlays", [])):
            ev = dict(ev)
            ev["seed"] = seg["seg"] * 31 + i
            if "times" in ev:
                ev["times"] = resolve_times(ev["times"])
            elif "at" in ev:
                ev["times"] = resolve_times(ev["at"])
            if "env" in ev:
                ev["env"] = [[resolve_time({"t": p[0]}), p[1]] for p in ev["env"]]
            self.events.append(ev)
        self.fade_pts = fade_pts
        self.src = None

    def load_source(self):
        p = os.path.join(ROOT, "_pipeline", "norm", self.seg["image"])
        im = Image.open(p).convert("RGB")
        if self.motion is not None:
            im = im.resize((SS * Ov.W, SS * Ov.H), Image.LANCZOS)
        self.src = im

    def frame(self, i):
        t_abs = self.t0 + i / FPS
        im = self.src
        if self.motion is not None:
            xi, yi, xi2, yi2 = sample_rect(self.motion, t_abs, i / FPS)
            im = self.src.crop((xi, yi, xi2, yi2)) \
                        .resize((Ov.W, Ov.H), Image.LANCZOS)
        else:
            im = self.src.copy()
        if self.light is not None:
            im = self.light.apply(im, t_abs)
        if self.events:
            layer = Image.new("RGBA", (Ov.W, Ov.H), (0, 0, 0, 0))
            for ev in self.events:
                state = dust_state(ev, t_abs) if ev["type"] == "dust" else {}
                Ov.draw_event(layer, ev, t_abs, state)
            im = im.convert("RGBA")
            im.alpha_composite(layer)
            im = im.convert("RGB")
        if self.fade_pts:
            f = Ov._piecewise(self.fade_pts, t_abs)
            if f < 0.999:
                im = im.point(_global_lut(f))
        return im


_LUT_CACHE = {}


def _global_lut(f):
    key = round(f, 4)
    if key not in _LUT_CACHE:
        _LUT_CACHE[key] = [int(round(v * f)) for v in range(256)] * 3
    return _LUT_CACHE[key]


_PLAN = None


def plan():
    """SegPlans for every enhanced segment. Cards are never enhanced."""
    global _PLAN
    if _PLAN is not None:
        return _PLAN
    segs = segments()
    cnts, _ = counts()
    fade = float(CFG.get("defaults", {}).get("fade", 0.30))
    end_cfg = CFG.get("end", {})
    end_black = resolve_time(end_cfg["at"]) if end_cfg.get("at") is not None else None
    plans = {}
    for i, s in enumerate(segs):
        cfg = CFG.get("segments", {}).get(str(s["seg"]))
        if not cfg or s["kind"] != "scene":
            continue
        t0, t1 = s["start"], s["end"]
        # bake the day-boundary dip for flanking scenes when we take over the
        # rendering from the still path
        fpts = []
        if i > 0 and segs[i - 1]["kind"] == "card":
            fpts += [[t0, 0.0], [t0 + fade, 1.0]]
        if i + 1 < len(segs) and segs[i + 1]["kind"] == "card":
            fpts += [[t1 - fade, 1.0], [t1, 0.0]]
        if end_black is not None and i == len(segs) - 1:
            fpts += [[end_black, 1.0], [end_black + 0.05, 0.0]]
        # a configured global dim rides the same baked-fade curve
        if cfg.get("light", {}).get("dim"):
            fpts += [list(p) for p in cfg["light"]["dim"]]
            cfg = dict(cfg)
            cfg["light"] = {k: v for k, v in cfg["light"].items() if k != "dim"}
        fpts.sort(key=lambda p: p[0])
        plans[str(s["seg"])] = SegPlan(s, cfg, t0, t1, cnts[i], fpts)
    _PLAN = plans
    return plans


def enhanced_seg_ids():
    return sorted(int(k) for k in plan())


def intermediate_path(seg_id):
    return os.path.join(ROOT, "_pipeline", "cine", "seg_%02d.mp4" % seg_id)


# --------------------------------------------------------------------------
# audio plan (Phase 5)
# --------------------------------------------------------------------------

def _vol_expr(points):
    """Piecewise-linear volume automation as an ffmpeg expression of t."""
    if not points:
        return "1.0"
    expr = "%.4f" % points[-1][1]
    for (ta, va), (tb, vb) in reversed(list(zip(points, points[1:]))):
        expr = ("if(lt(t,%.4f),%.4f+(%.4f-%.4f)*(t-%.4f)/max(1e-6,%.4f-%.4f),%s)"
                % (tb, va, vb, va, ta, tb, ta, expr))
    return expr


def audio_events():
    """[(path, delay_s, gain)] for every one-shot event."""
    out = []
    for ev in CFG.get("sfx", []):
        if "at" not in ev:
            raise ValueError("sfx event %r needs an 'at' time spec" % ev.get("name"))
        path = os.path.join(ROOT, "_pipeline", "sfx", ev["name"] + ".wav")
        if not os.path.exists(path):
            print("  [sfx] MISSING %s (run cinematic/sfx_build.py)" % path)
            continue
        ts = resolve_times(ev["at"])
        gains = ev.get("gain", 0.25)
        for k, t in enumerate(ts):
            if isinstance(gains, list):
                g = float(gains[min(k, len(gains) - 1)])
            else:
                g = float(gains) * float(ev.get("gain_seq", 1.0)) ** k
            out.append((path, t, g))
    return out


def audio_beds():
    out = []
    for b in CFG.get("beds", []):
        path = os.path.join(ROOT, "_pipeline", "sfx", b["file"])
        if not os.path.exists(path):
            print("  [bed] MISSING %s (run cinematic/sfx_build.py)" % b["file"])
            continue
        # envelope points may be absolute seconds or phrase anchors, so a bed
        # stays glued to the narration instead of to a hand-copied number
        env = [[resolve_time(p[0]), float(p[1])] for p in b.get("envelope", [[0, 1.0]])]
        out.append((path, float(b.get("gain", 1.0)), env))
    return out
