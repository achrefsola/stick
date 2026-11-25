"""Align a written script + ordered images to the narration, automatically.

Replaces the hand-authored boundary table in build_manifest.py. Because the
narration mp3 is a reading of the script, the transcript words match the script
tokens almost verbatim, so a monotonic walk through the word-level transcript
places every line — and every image — at its spoken moment.

Script convention (one beat per line; blank lines are ignored):
    Day one.                      <- a line that is just "Day N" becomes a card
    You wake up to the sound ...
    You look outside your ...

Images are matched to the non-card lines in order (natural sort, so img2 comes
before img10). The image count must equal the non-card line count.

Output: _pipeline/scene_manifest.json (same schema as build_manifest.py) and
_pipeline/align_report.txt listing every line that did not match cleanly.

Usage:
  python _pipeline/align_script.py --script script.txt --images-dir images
  python _pipeline/align_script.py --script s.txt --images-dir img --force
"""
import argparse
import difflib
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1920, 1080


def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower())


def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", os.path.basename(s))]


def read_lines(path):
    out = []
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if line:
            out.append(line)
    return out


def find_subseq(hay, sub, start):
    n = len(sub)
    if n == 0:
        return None
    for i in range(start, len(hay) - n + 1):
        if hay[i:i + n] == sub:
            return i
    return None


def best_window(hay, sub, start, pad=4):
    """difflib fallback: best-matching transcript window for this line."""
    best, idx = 0.0, None
    for extra in (0, -1, 1, -2, 2, 3, 4):
        n = len(sub) + extra
        if n <= 0:
            continue
        for i in range(start, max(start + 1, len(hay) - n + 1)):
            r = difflib.SequenceMatcher(None, hay[i:i + n], sub).ratio()
            if r > best:
                best, idx = r, i
    return idx, best


def make_card(day, out_path):
    """Synthesize a DAY separator if the project has no card for it yet."""
    if os.path.exists(out_path):
        return
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (W, H), (8, 8, 8))
    d = ImageDraw.Draw(im)
    text = "DAY %d" % day
    size = 300
    font = None
    for cand in ("arialbd.ttf", "Arial Bold.ttf", "seguisb.ttf"):
        try:
            font = ImageFont.truetype(cand, size)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()
    box = d.textbbox((0, 0), text, font=font)
    d.text(((W - box[2] + box[0]) / 2 - box[0], (H - box[3] + box[1]) / 2 - box[1]),
           text, font=font, fill=(246, 238, 222))
    im.save(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--images-dir", required=True)
    ap.add_argument("--audio", default=None, help="narration mp3 (recorded in the manifest)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--card-template", default=None,
                    help="optional 1920x1080 card image to stamp numerals onto")
    args = ap.parse_args()

    mpath = os.path.join(ROOT, "_pipeline", "scene_manifest.json")
    if os.path.exists(mpath) and not args.force:
        sys.exit("scene_manifest.json already exists - pass --force to rebuild it")

    words_path = os.path.join(ROOT, "_pipeline", "transcript", "words.json")
    data = json.load(open(words_path, encoding="utf-8"))
    words = data["words"]
    toks = [norm(w["w"]) for w in words]
    starts = [w["start"] for w in words]
    DUR = data["duration"]

    lines = read_lines(args.script)
    images = sorted([p for p in glob.glob(os.path.join(args.images_dir, "*"))
                     if p.lower().endswith((".png", ".jpg", ".jpeg"))], key=natkey)
    if not images:
        sys.exit("no images found in %s" % args.images_dir)

    beats, report = [], []
    used_images = 0
    WORDNUM = {w: i for i, w in enumerate(
        "one two three four five six seven eight nine ten eleven twelve thirteen "
        "fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(), 1)}
    # a line that is ONLY the chapter marker becomes a card; numbers may be
    # digits ("Day 10") or spelled ("Day ten")
    for ln in lines:
        dm = re.fullmatch(r"(?i)day\s+([a-z0-9]+)\.?", ln.strip())
        day = None
        if dm:
            tok = dm.group(1).lower()
            day = int(tok) if tok.isdigit() else WORDNUM.get(tok)
        if day:
            beats.append({"kind": "card", "day": day, "text": ln})
        else:
            if used_images >= len(images):
                sys.exit("more script beats than images: line %r has no image left" % ln[:60])
            beats.append({"kind": "scene", "image": images[used_images], "text": ln})
            used_images += 1
    if used_images != len(images):
        sys.exit("image/beat mismatch: %d images but %d scene lines\n  images: %s"
                 % (len(images), used_images, ", ".join(os.path.basename(i) for i in images)))

    # --- monotonic alignment ------------------------------------------------
    ptr, segs, bounds = 0, [], []
    for bi, b in enumerate(beats):
        lt = [norm(t) for t in re.split(r"\s+", b["text"]) if norm(t)]
        start, conf, how = None, "high", "exact"
        if lt:
            i = find_subseq(toks, lt, ptr)
            if i is not None:
                start, ptr = starts[i], i + len(lt)
            else:
                head = lt[:min(3, len(lt))]
                i = find_subseq(toks, head, ptr)
                if i is not None:
                    start, ptr, conf, how = starts[i], i + len(head), "medium", "first words"
                else:
                    i, ratio = best_window(toks, lt, ptr)
                    if i is None or ratio < 0.55:
                        report.append("NO MATCH  %r" % b["text"][:70])
                        start, conf, how = (starts[ptr] if ptr < len(starts) else DUR), "failed", "no match"
                    else:
                        start, ptr, conf, how = starts[i], i + max(1, len(lt)), "low", "fuzzy %.2f" % ratio
                        report.append("FUZZY %.2f  %r" % (ratio, b["text"][:60]))
        else:
            start, conf = (starts[ptr] if ptr < len(starts) else DUR), "low"
        bounds.append({"start": start, "conf": conf, "how": how})
        segs.append(b)

    # cards with no spoken line sit on the previous boundary; report them
    for bi, b in enumerate(segs):
        if b["kind"] == "card" and not [t for t in norm(b["text"]).split(" ") if t]:
            report.append("card %r has no transcript match - it inherits the next "
                          "line's start time" % b["text"])

    segments = []
    for k, b in enumerate(segs):
        nxt = bounds[k + 1]["start"] if k + 1 < len(bounds) else DUR
        start = bounds[k]["start"]
        if b["kind"] == "card":
            image = "_pipeline/cards/day_%02d.png" % b["day"]
            make_card(b["day"], os.path.join(ROOT, image.replace("/", os.sep)))
        else:
            image = os.path.relpath(b["image"], ROOT).replace("\\", "/")
        segments.append({
            "seg": k + 1, "kind": b["kind"],
            "day": b.get("day", 0), "image": image,
            "narration_segment": b["text"],
            "start": round(start, 2), "end": round(nxt, 2),
            "duration": round(nxt - start, 2),
            "matching_explanation": "aligned from script: %s" % bounds[k]["how"],
            "confidence": bounds[k]["conf"], "flag": "",
        })

    n_scenes = sum(1 for s in segments if s["kind"] == "scene")
    manifest = {
        "audio_file": os.path.relpath(args.audio, ROOT).replace("\\", "/")
                      if args.audio else "",
        "audio_duration_sec": round(DUR, 2),
        "language": data.get("language", "en"),
        "transcription_model": "script-aligned (transcript from faster-whisper)",
        "total_segments": len(segments),
        "total_scenes": n_scenes,
        "total_day_cards": len(segments) - n_scenes,
        "alignment": ("script-to-transcript monotonic walk; segment end = next "
                      "segment start; last segment ends at audio end"),
        "note": ("images matched to script beats in order; cards synthesized for "
                 "'Day N' lines"),
        "cards": {"dir": "_pipeline/cards",
                  "style": "full-frame black separator holding 'DAY n'"},
        "segments": segments,
    }
    json.dump(manifest, open(mpath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    rp = os.path.join(ROOT, "_pipeline", "align_report.txt")
    open(rp, "w", encoding="utf-8").write("\n".join(report) + ("\n" if report else ""))
    for s in segments:
        tag = "CARD %d" % s["day"] if s["kind"] == "card" else s["image"]
        print("%3d %-10s %7.2f-%7.2f (%5.2fs) [%s] %s"
              % (s["seg"], tag, s["start"], s["end"], s["duration"],
                 s["confidence"], s["narration_segment"][:48]))
    print("\n%d segments (%d scenes + %d cards) | %d flagged in %s"
          % (len(segments), n_scenes, len(segments) - n_scenes, len(report), rp))
    if any(s["confidence"] in ("low", "failed") for s in segments):
        print("REVIEW NEEDED: some lines matched fuzzily or not at all - read the report")
        sys.exit(2)


if __name__ == "__main__":
    main()
