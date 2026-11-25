"""Automated quality control for the cinematic pass (run BEFORE rendering).

This is the gate: it validates the *plan* in effects.json against the images and
the narration, so composition mistakes are caught before a render instead of
after a review. Nothing here invents positions - anything it cannot justify is
flagged for manual inspection.

Checks
  1. camera paths      every frame of every scene is checked against that
                       scene's protected regions: an important object may never
                       leave the visible rectangle, including during shake
  2. establishing      a scene flagged `establish` must open full-frame and hold
  3. anchors           every positioned overlay must name an anchor that exists
                       in that scene and must sit inside it
  4. narrative purpose every motion / light / overlay / sfx / bed entry must
                       carry a `reason`; repetition is reported, not assumed
  5. sfx boundaries    a one-shot may not outlive the narration segment it
                       belongs to; a bed must end where its narration ends
  6. repetition        same effect type/params reused across scenes is listed
  7. previews          start / mid / end frame for every effect, plus a contact
                       sheet of all 40 scenes with source + camera path

Outputs _pipeline/cine/validation_report.md and exit code 1 on any FAIL.

Run:  python _pipeline/cinematic/validate.py [--no-previews]
"""
import json
import os
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))

import engine as E          # noqa: E402
import overlays as Ov       # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

E.init(ROOT)
SEGS = E.segments()
CNTS, BOUNDS = E.counts()
PLANS = E.plan()
CFG = E.CFG
PREV = os.path.join(ROOT, "_pipeline", "cine", "previews")
os.makedirs(PREV, exist_ok=True)

fails, warns, notes = [], [], []


def fail(seg, msg):
    fails.append("seg %-3s %s" % (seg, msg))


def warn(seg, msg):
    warns.append("seg %-3s %s" % (seg, msg))


def note(msg):
    notes.append(msg)


def seg_by_id(sid):
    for s in SEGS:
        if s["seg"] == sid:
            return s
    return None


def wav_duration(path):
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


# ---------------------------------------------------------------------------
# per-scene camera geometry
# ---------------------------------------------------------------------------

def visible_rect(plan, i):
    """Normalized visible rectangle at frame i (shake included, clamped)."""
    if plan.motion is None:
        return (0.0, 0.0, 1.0, 1.0)
    t_abs = plan.t0 + i / E.FPS
    xi, yi, xi2, yi2 = E.sample_rect(plan.motion, t_abs, i / E.FPS)
    sw, sh = E.SS * Ov.W, E.SS * Ov.H
    return (xi / sw, yi / sh, xi2 / sw, yi2 / sh)


def rect_inside(inner, outer, eps=1e-4):
    return (inner[0] >= outer[0] - eps and inner[1] >= outer[1] - eps
            and inner[2] <= outer[2] + eps and inner[3] <= outer[3] + eps)


def rect_area(r):
    return max(0.0, r[2] - r[0]) * max(0.0, r[3] - r[1])


def point_in(p, r, eps=1e-3):
    return r[0] - eps <= p[0] <= r[2] + eps and r[1] - eps <= p[1] <= r[3] + eps


# ---------------------------------------------------------------------------
# 1 + 2. camera paths vs protected regions / establishing
# ---------------------------------------------------------------------------

def check_camera(sid, cfg, plan):
    n = plan.n
    prot = cfg.get("protected", [])
    motion = cfg.get("motion")
    name = seg_by_id(sid)["image"]

    # scene without declared protected regions cannot be proven safe
    if not prot:
        warn(sid, "UNCERTAIN: no protected regions declared for %s "
                  "(manual inspection needed before this camera is trusted)" % name)
    if cfg.get("confidence") == "assumed":
        warn(sid, "composition of %s is marked confidence=assumed - verify the "
                  "protected regions against the image before trusting them" % name)

    if motion is None:
        return {"zoom": 1.0, "path": "static full-frame"}

    # zoom envelope + worst-case crop, computed over every frame
    min_rect, max_zoom = (1.0, 1.0, 0.0, 0.0), 1.0
    for i in range(n):
        r = visible_rect(plan, i)
        min_rect = (min(min_rect[0], r[0]), min(min_rect[1], r[1]),
                    max(min_rect[2], r[2]), max(min_rect[3], r[3]))
        max_zoom = max(max_zoom, 1.0 / max(1e-6, rect_area(r) ** 0.5
                                           if rect_area(r) > 0 else 1e-6))
    # zoom is the linear magnification: report via the rect width instead
    zmax = 1.0 / min(1.0, (min_rect[2] - min_rect[0]))

    # every protected region must survive every single frame
    for pr in prot:
        label = pr[4] if len(pr) > 4 else "region"
        box = pr[:4]
        bad = []
        for i in range(n):
            if not rect_inside(box, visible_rect(plan, i)):
                bad.append(i)
        if bad:
            fail(sid, "protected region '%s' %s leaves frame on %d/%d frames "
                      "(first f%d, last f%d) - camera crops an important object"
                 % (label, box, len(bad), n, bad[0], bad[-1]))

    # establishing shots must open full-frame and hold
    if cfg.get("establish"):
        hold = int(cfg.get("hold", 0.0) * E.FPS)
        for i in range(0, min(hold, n)):
            if not rect_inside((0.0, 0.0, 1.0, 1.0), visible_rect(plan, i), eps=2e-3):
                fail(sid, "establishing shot is not full-frame at f%d (rect %s) "
                          "- the room/context must be established first"
                     % (i, tuple(round(v, 3) for v in visible_rect(plan, i))))
                break

    return {"zoom": round(zmax, 3), "path": "%s -> rect(%.2f,%.2f,%.2f,%.2f)"
            % (motion.get("preset"), *min_rect)}


# ---------------------------------------------------------------------------
# 3 + 4. anchors, narrative purpose, repetition
# ---------------------------------------------------------------------------

def check_anchors_and_reasons(sid, cfg, kind_stats):
    name = seg_by_id(sid)["image"]
    anchors = cfg.get("anchors", {})
    for ov in cfg.get("overlays", []):
        kind_stats.setdefault("overlay:" + ov["type"], []).append(sid)
        if "reason" not in ov:
            fail(sid, "%s overlay has no `reason` - every effect needs a "
                      "narrative purpose" % ov["type"])
        if "pos" in ov:
            anc = ov.get("anchor")
            if not anc:
                warn(sid, "%s overlay at %s has no `anchor` - position is not "
                          "tied to a declared source" % (ov["type"], ov["pos"]))
            elif anc not in anchors:
                fail(sid, "%s overlay references anchor '%s' which the scene "
                          "does not declare" % (ov["type"], anc))
            elif "pos" in ov and isinstance(anchors[anc][0], (int, float)) \
                    and len(anchors[anc]) == 4:
                if not point_in(ov["pos"], anchors[anc]):
                    fail(sid, "%s overlay pos %s is outside its anchor '%s' %s "
                              "- overlay must sit on its source"
                         % (ov["type"], ov["pos"], anc, anchors[anc]))
    for key in ("motion", "light"):
        e = cfg.get(key)
        if e and "reason" not in e:
            fail(sid, "%s has no `reason`" % key)
    if cfg.get("motion"):
        kind_stats.setdefault("motion:" + cfg["motion"].get("preset", "?"),
                              []).append(sid)


def check_repetition(kind_stats):
    for kind, ids in sorted(kind_stats.items()):
        if kind.startswith("motion:") and kind != "motion:static" and len(ids) >= 6:
            warn("-", "repetition: %s used in %d scenes (%s) - check each has a "
                      "distinct narrative purpose" % (kind, len(ids), ids))
        if kind.startswith("overlay:") and len(ids) >= 4:
            warn("-", "repetition: %s overlay used in %d scenes (%s)"
                 % (kind, len(ids), ids))


# ---------------------------------------------------------------------------
# 5. sfx / bed boundaries against narration
# ---------------------------------------------------------------------------

def check_audio_bounds():
    segs = SEGS
    for ev in CFG.get("sfx", []):
        name = ev["name"]
        path = os.path.join(ROOT, "_pipeline", "sfx", name + ".wav")
        if not os.path.exists(path):
            fail("-", "sfx '%s' missing (run sfx_build.py)" % name)
            continue
        dur = wav_duration(path)
        reason = ev.get("reason")
        if not reason:
            fail("-", "sfx '%s' has no `reason`" % name)
        for t in E.resolve_times(ev["at"]):
            host = next((s for s in segs if s["start"] - 0.01 <= t < s["end"]), None)
            if host is None:
                fail("-", "sfx '%s' at %.2fs falls outside the timeline" % (name, t))
                continue
            end = t + dur
            if end > host["end"] + 0.20:
                fail("-", "sfx '%s' at %.2fs runs to %.2fs but its narration "
                          "segment (seg %d) ends at %.2fs - effect outlives its event"
                     % (name, t, end, host["seg"], host["end"]))
    for b in CFG.get("beds", []):
        if not b.get("reason"):
            fail("-", "bed '%s' has no `reason`" % b["file"])
        env = [[E.resolve_time(pt[0]), float(pt[1])] for pt in b.get("envelope", [])]
        last_on = max((t for t, v in env if v > 0.02), default=None)
        if b.get("ends_with") is not None:
            host = next((s for s in segs if s["seg"] == b["ends_with"]), None)
            if host is None:
                fail("-", "bed '%s' bound to unknown segment %s"
                     % (b["file"], b["ends_with"]))
            elif last_on is not None and last_on > host["end"] + 0.05:
                fail("-", "bed '%s' still audible at %.2fs but its narration "
                          "(seg %d '%s') ends at %.2fs - terminate the SFX with "
                          "the narration"
                     % (b["file"], last_on, host["seg"], host["image"], host["end"]))


# ---------------------------------------------------------------------------
# 6. static-vs-animated accounting
# ---------------------------------------------------------------------------

def check_animation_policy():
    animated = [sid for sid, c in CFG["segments"].items() if c.get("motion")]
    static = [sid for sid, c in CFG["segments"].items() if not c.get("motion")]
    note("animation policy: %d animated / %d static full-frame of %d scenes"
         % (len(animated), len(static), len(CFG["segments"])))
    if len(animated) > 0.75 * len(CFG["segments"]):
        warn("-", "animation policy: %d/%d scenes are animated - the default "
                  "should be static unless movement earns its place"
             % (len(animated), len(CFG["segments"])))


# ---------------------------------------------------------------------------
# 7. preview frames + contact sheet
# ---------------------------------------------------------------------------

def effect_spans(cfg, seg):
    """[(kind, label, t_start, t_end)] for every effect in the scene."""
    spans = []
    if cfg.get("motion"):
        spans.append(("motion", cfg["motion"].get("preset", "?"),
                      seg["start"], seg["end"]))
    li = cfg.get("light") or {}
    if "flicker" in li:
        spans.append(("light", "flicker", E.resolve_time(li["flicker"]["t0"]),
                      E.resolve_time(li["flicker"]["t1"])))
    if "vignette" in li:
        v = li["vignette"]
        t1 = E.resolve_time(v["t_off"]) if v.get("t_off") is not None else seg["end"]
        spans.append(("light", "vignette", E.resolve_time(v["t_on"]), min(t1, seg["end"])))
    if "warm" in li:
        w = li["warm"]
        t1 = E.resolve_time(w["off_at"]) if w.get("off_at") is not None else seg["end"]
        spans.append(("light", "warm", E.resolve_time(w["t_on"]), min(t1, seg["end"])))
    for j, ov in enumerate(cfg.get("overlays", [])):
        if "env" in ov:
            ts = [p[0] for p in ov["env"]]
        elif "times" in ov:
            ts = E.resolve_times(ov["times"]) if not isinstance(ov["times"], list) \
                else [E.resolve_time(x) for x in ov["times"]]
        else:
            ts = [seg["start"]]
        ts = [t for t in ts if seg["start"] - 0.01 <= t <= seg["end"] + 0.01] \
            or [seg["start"]]
        if ov["type"] in ("dust", "steam"):
            t0, t1 = seg["start"], seg["end"]
        else:
            t0, t1 = min(ts), max(ts) + float(ov.get("dur", 0.5))
        spans.append(("overlay", "%s#%d" % (ov["type"], j),
                      max(seg["start"], t0), min(seg["end"], t1)))
    return spans


def render_previews(sid, plan, cfg):
    """start/mid/end frame for every effect in this scene."""
    made = []
    for kind, label, t0, t1 in effect_spans(cfg, seg_by_id(sid)):
        for tag, t in (("start", t0), ("mid", (t0 + t1) / 2.0), ("end", t1)):
            i = int(round((min(max(t, plan.t0), plan.t1 - 1e-3) - plan.t0) * E.FPS))
            i = max(0, min(plan.n - 1, i))
            if plan.src is None:
                plan.load_source()
            im = plan.frame(i)
            p = os.path.join(PREV, "seg%02d_%s_%s_%s.png" % (sid, kind, label, tag))
            im.save(p)
            made.append(p)
    return made


def contact_sheet():
    """all 40 scenes: source image + camera path (start / mid / end)."""
    TH_W, TH_H, PAD, LBL = 200, 112, 4, 14
    cells = []
    for s in SEGS:
        if s["kind"] != "scene":
            continue
        sid = str(s["seg"])
        plan = PLANS.get(sid)
        row = []
        src = os.path.join(ROOT, "_pipeline", "norm", s["image"])
        im = Image.open(src).convert("RGB").resize((TH_W, TH_H), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        for pr in CFG["segments"].get(sid, {}).get("protected", []):
            x0, y0, x1, y1 = [c * (TH_W if i % 2 == 0 else TH_H) for i, c in enumerate(pr[:4])]
            d.rectangle([x0, y0, x1, y1], outline=(255, 60, 60), width=2)
        for anc, box in CFG["segments"].get(sid, {}).get("anchors", {}).items():
            if len(box) == 4:
                x0, y0, x1, y1 = [c * (TH_W if i % 2 == 0 else TH_H) for i, c in enumerate(box)]
                d.rectangle([x0, y0, x1, y1], outline=(80, 200, 255), width=1)
        row.append((im, "src " + s["image"]))
        if plan is not None:
            for tag, frac in (("start", 0.0), ("mid", 0.5), ("end", 0.999)):
                i = int(plan.n * frac)
                i = max(0, min(plan.n - 1, i))
                if plan.src is None:
                    plan.load_source()
                row.append((plan.frame(i).resize((TH_W, TH_H), Image.LANCZOS),
                            "%s z%.2f" % (tag, 1.0 / max(1e-6, (visible_rect(plan, i)[2]
                                                               - visible_rect(plan, i)[0])))))
        cells.append(row)
        plan.src = None
    cols = max(len(r) for r in cells)
    W = cols * (TH_W + PAD) + PAD
    rows = (len(cells) + 1) // 2
    H = rows * (TH_H + LBL + PAD) + PAD
    sheet = Image.new("RGB", (W * 2 // 2, H), (18, 18, 18))
    # two scene-blocks per row to keep the sheet a usable shape
    block_w = cols * (TH_W + PAD) + PAD
    sheet = Image.new("RGB", (block_w * 2, H), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    for bi, row in enumerate(cells):
        col = bi % 2
        rr = bi // 2
        ox = col * block_w
        oy = rr * (TH_H + LBL + PAD) + PAD
        for ci, (im, lbl) in enumerate(row):
            x = ox + PAD + ci * (TH_W + PAD)
            sheet.paste(im, (x, oy))
            d.text((x + 2, oy + TH_H + 1), lbl, fill=(230, 230, 140))
        d.text((ox + PAD, oy - LBL + 2), "seg %s" % row[0][1][4:], fill=(255, 255, 255))
    out = os.path.join(ROOT, "_pipeline", "cine", "scene_contact_sheet.jpg")
    sheet.save(out, quality=88)
    return out, len(cells)


# ---------------------------------------------------------------------------

def main():
    do_previews = "--no-previews" not in sys.argv
    kind_stats = {}
    cam_info = {}

    print("validating %d scenes against images + narration..." % len(PLANS))
    for sid in sorted(PLANS, key=int):
        cfg = CFG["segments"][sid]
        plan = PLANS[sid]
        cam_info[sid] = check_camera(int(sid), cfg, plan)
        check_anchors_and_reasons(int(sid), cfg, kind_stats)
    check_repetition(kind_stats)
    check_audio_bounds()
    check_animation_policy()

    if do_previews:
        total = 0
        for sid in sorted(PLANS, key=int):
            total += len(render_previews(int(sid), PLANS[sid], CFG["segments"][sid]))
        note("previews: %d frames (start/mid/end per effect) in _pipeline/cine/previews" % total)
        sheet, n = contact_sheet()
        note("contact sheet: %d scenes -> %s" % (n, sheet))

    # ---- report ----------------------------------------------------------
    lines = ["# Cinematic validation report",
             "", "Generated by `validate.py` from effects.json + scene_manifest.json.",
             "",
             "## %d FAIL / %d WARN" % (len(fails), len(warns)), ""]
    if fails:
        lines += ["### FAIL - must fix before rendering", ""]
        lines += ["- " + f for f in fails] + [""]
    if warns:
        lines += ["### WARN / manual inspection", ""]
        lines += ["- " + w for w in warns] + [""]
    lines += ["### camera summary", "", "| seg | image | max zoom | path |", "|---:|---|---:|---|"]
    for sid in sorted(cam_info, key=int):
        s = seg_by_id(int(sid))
        lines.append("| %s | %s | %.2f | %s |" % (sid, s["image"], cam_info[sid]["zoom"],
                                                  cam_info[sid]["path"]))
    lines += [""] + ["- " + n for n in notes]
    out = os.path.join(ROOT, "_pipeline", "cine", "validation_report.md")
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")

    for l in lines:
        if l.startswith(("#", "##", "- ", "|")) or "policy" in l:
            print(l)
    print("\nwrote %s" % out)
    print("=== %d FAIL, %d WARN ===" % (len(fails), len(warns)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
