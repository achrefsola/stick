"""Hand-drawn 2D overlay drawing routines (Phase 4).

Every overlay is drawn per-frame onto an RGBA layer that the engine alpha-
composites over the motion frame. All randomness is seeded from (seg, event
index), so rendering is deterministic. Coordinates in the config are normalized
image positions (fx, fy in [0,1] of the 1920x1080 frame); times are absolute
seconds on the episode timeline.

Visual identity: dark ink strokes on the illustration, cream/white for light
effects, the character's cap red for warning accents. Strokes are wobbled with
low-frequency sine terms so nothing looks vector-perfect.
"""
import math
import numpy as np
from PIL import Image, ImageDraw

INK = (46, 38, 32)
CREAM = (246, 238, 222)
WARM = (255, 216, 150)
RED = (198, 62, 48)

W, H = 1920, 1080


def _rng(seed):
    import random
    return random.Random(seed)


# --------------------------------------------------------------------------
# radial glow sprites (built once per (radius, color, seed), reused per frame)
# --------------------------------------------------------------------------
_GLOW_CACHE = {}


def glow_sprite(radius, color, seed=1, wobble=0.10):
    """RGBA sprite of a soft radial light with a hand-wobbled rim."""
    color = tuple(color)
    key = (int(radius), color, seed)
    if key in _GLOW_CACHE:
        return _GLOW_CACHE[key]
    S = int(radius) * 2 + 8
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    dx, dy = xx - S / 2, yy - S / 2
    r = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    rw = radius * (1 + wobble * np.sin(3 * ang + seed * 1.7)
                     + wobble * 0.7 * np.sin(5 * ang + seed * 3.1))
    u = np.clip(r / np.maximum(rw, 1e-3), 0, 1)
    a = (1 - u) ** 2.2 * 255
    rgb = np.zeros((S, S, 3), np.uint8)
    rgb[..., 0], rgb[..., 1], rgb[..., 2] = color
    sprite = np.dstack([rgb, a.astype(np.uint8)])
    out = Image.fromarray(sprite, "RGBA")
    _GLOW_CACHE[key] = out
    return out


def _scaled_alpha(k):
    return [int(v * k) for v in range(256)]


_SPRITE_BUF = np.zeros((H, W, 4), np.uint8)


def composite_sprite(layer, sp, x, y, k):
    """Composite a straight-alpha sprite onto the layer at (x, y).

    paste() would fold the mask into the sprite RGB on a transparent layer, and
    alpha_composite would then apply the alpha a second time - squaring it. A
    glow at k=0.3 would render at 0.09 and simply vanish.
    """
    w, h = sp.size
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    sp2 = sp.copy()
    sp2.putalpha(sp.getchannel("A").point(_scaled_alpha(k)))
    _SPRITE_BUF[:] = 0
    _SPRITE_BUF[y0:y1, x0:x1] = np.asarray(sp2)[y0 - y:y1 - y, x0 - x:x1 - x]
    layer.alpha_composite(Image.fromarray(_SPRITE_BUF, "RGBA"))


def _impulse_env(t, times, dur, attack):
    """Sum of attack/decay pulses at each time."""
    v = 0.0
    for tf in times:
        u = t - tf
        if 0 <= u < dur:
            rise = min(1.0, u / attack) if attack > 0 else 1.0
            v += (1 - u / dur) ** 2 * rise
    return min(1.0, v)


def _piecewise(points, t):
    if not points:
        return 0.0
    if t <= points[0][0]:
        return points[0][1]
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        if t <= t1:
            if t1 <= t0:
                return v1
            f = (t - t0) / (t1 - t0)
            return v0 + (v1 - v0) * f
    return points[-1][1]


# --------------------------------------------------------------------------
# event draw functions: draw(layer, ev, t_abs, state) -> None
# layer: RGBA image sized 1920x1080; ev: resolved config; state: engine dict
# --------------------------------------------------------------------------

def ev_flash_glow(layer, ev, t, state):
    k = _impulse_env(t, ev["times"], ev.get("dur", 0.5), ev.get("attack", 0.06))
    if k <= 0.01:
        return
    k *= ev.get("gain", 0.9)
    R = int(ev["radius"] * W)
    sp = glow_sprite(R, ev.get("color", WARM), ev.get("seed", 3))
    composite_sprite(layer, sp, int(ev["pos"][0] * W - R), int(ev["pos"][1] * H - R), k)


def ev_glow(layer, ev, t, state):
    """Localized glow with a piecewise-linear envelope (bloom/pulse/afterglow)."""
    k = _piecewise(ev["env"], t)
    if k <= 0.01:
        return
    k = min(1.0, k) * ev.get("gain", 1.0)
    R = int(ev["radius"] * W)
    sp = glow_sprite(R, ev.get("color", WARM), ev.get("seed", 5))
    composite_sprite(layer, sp, int(ev["pos"][0] * W - R), int(ev["pos"][1] * H - R), k)


def ev_knock_waves(layer, ev, t, state):
    """Expanding hand-drawn arcs from the door at each knock."""
    d = ImageDraw.Draw(layer)
    max_r = ev.get("max_r", 0.16) * W
    dur = ev.get("dur", 0.55)
    for tf in ev["times"]:
        u = t - tf
        if not (0 <= u <= dur):
            continue
        fade = 1 - u / dur
        alpha = int(215 * fade * fade)
        r0 = 0.02 * W + (max_r - 0.02 * W) * (u / dur)
        cx, cy = ev["pos"][0] * W, ev["pos"][1] * H
        for frac, wdt in ((1.0, 7), (0.66, 4)):
            r = r0 * frac
            bbox = [cx - r, cy - r * 1.15, cx + r, cy + r * 1.15]
            d.arc(bbox, 205, 335, fill=CREAM + (alpha,), width=wdt)
            d.arc([bbox[0] + 3, bbox[1] + 2, bbox[2] - 3, bbox[3] - 2],
                  210, 330, fill=INK + (int(alpha * 0.55),), width=max(2, wdt - 2))


def ev_battery(layer, ev, t, state):
    """Hand-drawn low-battery indicator with blink envelope."""
    k = _piecewise(ev["env"], t)
    if k <= 0.01:
        return
    x, y = ev["pos"][0] * W, ev["pos"][1] * H
    bw, bh = ev.get("w", 0.065) * W, ev.get("w", 0.065) * W * 0.52
    d = ImageDraw.Draw(layer)
    a = int(255 * min(1.0, k))
    # body
    d.rounded_rectangle([x, y, x + bw, y + bh], radius=10,
                        outline=INK + (a,), width=5)
    d.rounded_rectangle([x + 3, y + 3, x + bw - 3, y + bh - 3], radius=8,
                        outline=CREAM + (int(a * 0.5),), width=2)
    # nub
    d.rounded_rectangle([x + bw + 2, y + bh * 0.3, x + bw + 14, y + bh * 0.7],
                        radius=4, fill=INK + (a,))
    # 19% fill
    fw = (bw - 14) * ev.get("level", 0.19)
    d.rounded_rectangle([x + 7, y + 7, x + 7 + fw, y + bh - 7], radius=5,
                        fill=RED + (a,))
    # tick marks along the top of the remaining span
    for i in range(1, 5):
        lx = x + 7 + (bw - 14) * i / 5
        d.line([lx, y + 4, lx, y + 10], fill=INK + (int(a * 0.7),), width=2)


_VEIL_CACHE = {}


def _veil_sprite(pos, radius, power, color):
    """Full-frame soft radial alpha mask, cached per (pos, radius, power, color)."""
    key = (round(pos[0], 3), round(pos[1], 3), round(radius, 3), round(power, 3), color)
    if key in _VEIL_CACHE:
        return _VEIL_CACHE[key]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (xx - pos[0] * W) / (radius * W)
    dy = (yy - pos[1] * H) / (radius * H)
    r = np.sqrt(dx * dx + dy * dy)
    a = ((1 - np.clip(r, 0, 1) ** power) * 255).astype(np.uint8)
    rgb = np.zeros((H, W, 3), np.uint8)
    rgb[..., 0], rgb[..., 1], rgb[..., 2] = color
    img = Image.fromarray(np.dstack([rgb, a]), "RGBA")
    _VEIL_CACHE[key] = img
    return img


def ev_flash_veil(layer, ev, t, state):
    """Broad soft bloom covering the frame, brightest at the light source.

    A distant lamp flashed against an already-lit window barely reads with a hot
    core alone; this lifts the surrounding air so the beat is unmistakable while
    staying a gentle veil rather than a jump-cut white.
    """
    k = _impulse_env(t, ev["times"], ev.get("dur", 0.5), ev.get("attack", 0.05))
    if k <= 0.01:
        return
    k = min(1.0, k) * ev.get("gain", 0.35)
    sp = _veil_sprite(tuple(ev["pos"]), ev.get("radius", 0.90),
                      ev.get("power", 1.8), tuple(ev.get("color", (255, 250, 235))))
    sp = sp.copy()
    sp.putalpha(sp.getchannel("A").point(lambda v: int(v * k)))
    layer.alpha_composite(sp)


def ev_dust(layer, ev, t, state):
    """Slow drifting motes; particle tracks are precomputed by the engine."""
    d = ImageDraw.Draw(layer)
    for (x, y, r, a) in state["tracks"]:
        if a <= 0:
            continue
        d.ellipse([x - r, y - r, x + r, y + r], fill=CREAM + (int(a),))
        d.ellipse([x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45],
                  fill=(255, 255, 250, int(a * 0.8)))


def ev_steam(layer, ev, t, state):
    """Wobbly steam wisps rising from a source point."""
    d = ImageDraw.Draw(layer)
    ox, oy = ev["pos"][0] * W, ev["pos"][1] * H
    rise = ev.get("rise", 0.30) * H
    seed = ev.get("seed", 7)
    for wisp in range(ev.get("wisps", 3)):
        ph = _rng(seed * 13 + wisp).uniform(0, 6.28)
        sway_w = 0.020 * W * (0.7 + 0.3 * math.sin(ph))
        speed = ev.get("speed", 0.35) * (0.85 + 0.3 * (wisp / max(1, ev.get("wisps", 3) - 1)))
        cycle = rise / (speed * H)  # seconds to rise fully
        n = int(ev.get("puffs", 9))
        for j in range(n):
            # stagger puffs along the rise, looping with time
            f = ((t * speed / (rise / H)) + j / n + ph / 6.28) % 1.0
            yy = oy - f * rise
            sway = math.sin(2 * math.pi * (f * 2.2) + ph) * sway_w * f
            r = (7 + f * 20) * (1 + 0.15 * math.sin(3 * f * 6.28 + ph))
            a = int(80 * math.sin(math.pi * min(1.0, f * 1.15)) * (1 - f * 0.35))
            if a <= 4:
                continue
            cxp = ox + sway + (wisp - 1) * 0.012 * W
            d.ellipse([cxp - r, yy - r * 0.8, cxp + r, yy + r * 0.8],
                      fill=(250, 246, 238, a))
            d.ellipse([cxp - r * 0.5, yy - r * 0.4, cxp + r * 0.5, yy + r * 0.4],
                      fill=(255, 253, 248, int(a * 0.7)))


def ev_motion_lines(layer, ev, t, state):
    """Sparse comic speed lines around a focal area (used sparingly)."""
    k = _impulse_env(t, ev["times"], ev.get("dur", 1.2), 0.15)
    if k <= 0.02:
        return
    d = ImageDraw.Draw(layer)
    cx, cy = ev["pos"][0] * W, ev["pos"][1] * H
    spread = ev.get("spread", 0.28) * W
    a = int(70 * k)
    rnd = _rng(ev.get("seed", 11))
    for i in range(ev.get("count", 7)):
        ang = rnd.uniform(0, 6.28)
        r1 = spread * (0.75 + 0.25 * math.sin(t * 5 + i))
        r2 = r1 + (0.05 + 0.03 * k) * W
        x1 = cx + r1 * math.cos(ang)
        y1 = cy + r1 * math.sin(ang) * 0.8
        x2 = cx + r2 * math.cos(ang)
        y2 = cy + r2 * math.sin(ang) * 0.8
        d.line([x1, y1, x2, y2], fill=INK + (a,), width=4)


DRAWERS = {
    "flash_glow": ev_flash_glow,
    "glow": ev_glow,
    "flash_veil": ev_flash_veil,
    "knock_waves": ev_knock_waves,
    "battery": ev_battery,
    "dust": ev_dust,
    "steam": ev_steam,
    "motion_lines": ev_motion_lines,
}


def draw_event(layer, ev, t_abs, state):
    DRAWERS[ev["type"]](layer, ev, t_abs, state)
