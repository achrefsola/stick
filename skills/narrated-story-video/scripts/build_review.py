"""Build review artifacts straight from scene_manifest.json's `segments`.

Use these to EYEBALL the semantic mapping before/after rendering - the contact
sheet is the fastest way to catch an image bound to the wrong line.

  _pipeline/contact_sheet.jpg   grid of all segments (scenes + cards), labeled
  _pipeline/storyboard.html     per-segment timeline: asset + narration + notes

Because both are derived from the same manifest the renderer uses, they can
never drift from the rendered video.

Run from the project root.
"""
import json, base64, html, io, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.environ.get("STORY_VIDEO_ROOT", os.getcwd())
NORM = os.path.join(ROOT, "_pipeline", "norm")
m = json.load(open(os.path.join(ROOT, "_pipeline", "scene_manifest.json")))
segs = m["segments"]


def src_of(s):
    if s["kind"] == "card":
        return os.path.join(ROOT, s["image"].replace("/", os.sep))
    return os.path.join(NORM, s["image"])


def tc(t):
    return "%d:%04.1f" % (int(t // 60), t % 60)


# ---------- contact sheet ----------
COLS, TW, TH, LABEL = 6, 320, 180, 34
ROWS = (len(segs) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * TW + (COLS + 1) * 8, ROWS * (TH + LABEL) + (ROWS + 1) * 8), (18, 18, 20))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("consola.ttf", 13)
    fontb = ImageFont.truetype("consolab.ttf", 13)
except Exception:
    font = fontb = ImageFont.load_default()

for i, s in enumerate(segs):
    r, c = divmod(i, COLS)
    x = 8 + c * (TW + 8)
    y = 8 + r * (TH + LABEL + 8)
    sheet.paste(Image.open(src_of(s)).convert("RGB").resize((TW, TH), Image.Resampling.LANCZOS), (x, y))
    is_card = s["kind"] == "card"
    d.rectangle([x, y + TH, x + TW, y + TH + LABEL], fill=(70, 60, 20) if is_card else (28, 28, 32))
    label = "#%2d CARD %s" % (s["seg"], s.get("day", "")) if is_card else "#%2d %-8s" % (s["seg"], s["image"])
    d.text((x + 5, y + TH + 3), label, font=fontb, fill=(255, 235, 160) if is_card else (255, 255, 255))
    d.text((x + 5, y + TH + 18), "%s-%s" % (tc(s["start"]), tc(s["end"])), font=font, fill=(200, 200, 200))
sheet.save(os.path.join(ROOT, "_pipeline", "contact_sheet.jpg"), quality=88)
print("contact_sheet.jpg", sheet.size, "%d segments" % len(segs))

# ---------- storyboard html ----------
BADGE = {"high": ("HIGH", "#1d7a3a"), "medium": ("MEDIUM", "#b07d10"),
         "medium-low": ("MEDIUM-LOW", "#b04a10"), "low": ("LOW", "#b02020")}


def thumb_b64(s):
    im = Image.open(src_of(s)).convert("RGB").resize((320, 180), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return base64.b64encode(buf.getvalue()).decode()


cards = []
for s in segs:
    b = BADGE.get(s.get("confidence"), ("?", "#555"))
    warn = '<div class="flag">! %s</div>' % html.escape(s["flag"]) if s.get("flag") else ""
    kind = "CARD" if s["kind"] == "card" else "Scene %02d" % s["seg"]
    cards.append("""
<div class="card %(cls)s">
  <img src="data:image/jpeg;base64,%(b64)s">
  <div class="info">
    <div class="head"><span class="scn">%(kind)s</span>
      <span class="file">%(img)s</span>
      <span class="time">%(t0)s - %(t1)s <em>(%(dur).1fs)</em></span>
      <span class="badge" style="background:%(bc)s">%(bl)s</span></div>
    <div class="narr">"%(narr)s"</div>
    <div class="expl">%(expl)s</div>
    %(warn)s
  </div>
</div>""" % {"cls": ("cardseg " if s["kind"] == "card" else "") + ("flagged" if s.get("flag") else ""),
             "b64": thumb_b64(s), "kind": kind, "img": html.escape(os.path.basename(s["image"])),
             "t0": tc(s["start"]), "t1": tc(s["end"]), "dur": s["duration"],
             "bc": b[1], "bl": b[0], "narr": html.escape(s["narration_segment"]),
             "expl": html.escape(s.get("matching_explanation", "")), "warn": warn})

page = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>Storyboard</title>
<style>
body{background:#141418;color:#e6e6e6;font-family:Segoe UI,Arial,sans-serif;margin:24px;}
h1{font-size:22px;margin:0 0 4px}
.card{display:flex;gap:14px;background:#1e1e24;border:1px solid #2e2e36;border-radius:10px;padding:10px;margin-bottom:10px;align-items:flex-start}
.card.flagged{border-color:#8a3232;background:#241a1a}
.card.cardseg{border-color:#6a5a20;background:#22201a}
.card img{width:320px;height:180px;object-fit:cover;border-radius:6px;flex-shrink:0}
.info{flex:1;min-width:0}
.head{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.scn{font-weight:700;font-size:15px} .file{color:#8ab4f8;font-family:Consolas,monospace}
.time{font-family:Consolas,monospace;color:#ccc} .time em{color:#888;font-style:normal}
.badge{color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:auto}
.narr{font-size:15px;margin:6px 0;line-height:1.45}
.expl{color:#9a9a9a;font-size:13px;margin-top:4px}
.flag{color:#ff9b9b;font-size:13px;margin-top:6px;background:#3a1d1d;border-radius:6px;padding:6px 9px}
</style></head><body>
<h1>Timestamped Storyboard</h1>
<div class="sub">%(nscene)d scenes + %(ncard)d cards - gapless to %(end)s</div>
%(cards)s
</body></html>""" % {"nscene": sum(1 for s in segs if s["kind"] == "scene"),
                     "ncard": sum(1 for s in segs if s["kind"] == "card"),
                     "end": tc(m["audio_duration_sec"]), "cards": "".join(cards)}
open(os.path.join(ROOT, "_pipeline", "storyboard.html"), "w", encoding="utf-8").write(page)
print("storyboard.html", round(os.path.getsize(os.path.join(ROOT, "_pipeline", "storyboard.html")) / 1e6, 2), "MB")
