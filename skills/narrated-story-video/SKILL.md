---
name: narrated-story-video
description: Build a video from a set of ordered still images plus one continuous narration audio track, syncing each image to the moment its line is spoken, at 1920x1080/30fps with gapless frames and clean chapter/day transitions. Use whenever the user wants a "story video", "narrated slideshow", "slideshow with voiceover", "image-to-audio sync", "match pictures to narration", a video with "DAY 1 / DAY 2" separator cards, a Whisper-aligned stills video, or asks to turn images + an mp3/voiceover into a timed video — even if they only say "make a video from these pictures and this audio".
---

# Narrated Story Video (image ↔ narration sync)

Produce an MP4 where N ordered still images are shown exactly when the matching
narration line is spoken. The images are numbered in storytelling order but their
timestamps inside the narration are unknown, so the timestamps must be derived
from the audio (transcript) and the images mapped onto them.

The pipeline is five steps. Run them from the project root (the folder holding
the images and the audio) so the `_pipeline/` working directory is created there:

| Step | Script | Output |
|---|---|---|
| 1. Transcribe | `scripts/transcribe.py` | `_pipeline/transcript/words.json` |
| 2. Normalize images | `scripts/normalize.py` | `_pipeline/norm/<image>` |
| 3. Build edit plan | `scripts/build_manifest.py` | `_pipeline/scene_manifest.json` |
| 3b. Review the mapping | `scripts/build_review.py` | `_pipeline/contact_sheet.jpg`, `_pipeline/storyboard.html` |
| 4. Render | `scripts/render_video.py` | `story_1080p.mp4` |
| 5. Verify | `scripts/verify_render.py` | console report (exit 0 = pass) |

All scripts take the project root from `STORY_VIDEO_ROOT` if set, else the
current working directory. Copy them into the project's `_pipeline/` folder
before running, or run them in place with `STORY_VIDEO_ROOT` set.

## Step 0 — set up the working folder

Create `_pipeline/` in the project root. Put the FFmpeg build under
`_pipeline/tools/<build>/bin/` (the scripts look for
`ffmpeg-master-latest-win64-gpl/bin`) and point the scripts at wherever your
binary actually is if it differs. The scripts only need `ffmpeg` + `ffprobe`.

## Step 1 — transcribe with word timestamps

`transcribe.py` runs faster-whisper (`small`, `int8`, CPU) with
`word_timestamps=True` and `vad_filter=True`. Word-level timestamps are what make
frame-accurate alignment possible — segment-level timestamps are too coarse.
Output schema (`_pipeline/transcript/words.json`):

```json
{"language": "en", "duration": 205.087,
 "segments": [{"start": 0.0, "end": 2.1, "text": "..."}],
 "words": [{"w": "Day", "start": 0.0, "end": 0.28}, ...]}
```

`duration` is authoritative: it is the exact length the video must have.

## Step 2 — normalize every story image to one size

`normalize.py` cover-crops each distinct story image to exactly 1920×1080 into
`_pipeline/norm/`. Two reasons: it removes resize work from the FFmpeg graph
(the graph loops each image at 1080p instead of decoding at raw size for every
frame), and it means every input in the graph has an identical size — which is
what keeps the concat filter honest. Separator cards are already 1080p and are
skipped.

## Step 3 — build the edit plan (the semantic mapping)

This is the step that decides *which image plays when*, and it is where most
mistakes happen. `build_manifest.py` holds a boundary table `S`: one row per
segment, in playback order, of

```
(boundary_phrase, kind, image, day, explanation, confidence, flag)
```

- `boundary_phrase` — the first few words of the narration line that the image
  illustrates. It is located in the word-level transcript.
- `kind` — `"scene"` (a story image) or `"card"` (a full-frame separator like a
  black "DAY n" card).
- `image` — the file for a scene; `None` for a card (the card path is derived
  from `day`).

The locator is a **strictly monotonic greedy walk**: each phrase is searched
starting from where the previous one matched, so segments can never go
backwards in time and the alignment is stable. Each segment ends where the next
one starts (`end = next.start`), and the last segment ends at
`audio_duration_sec`, which makes the timeline gapless by construction.

**Replace the example table in the script with your own.** The image→phrase
mapping is a judgement call, not a mechanical one — see
`references/pitfalls.md` for the concrete mis-mapping corrections from a real
project (users notice wrong images immediately; a wrong mapping also makes the
whole video feel out of sync).

### Shortcut — align a written script automatically

If the user has the **script text** (not just the audio), `scripts/align_script.py`
builds `scene_manifest.json` without a hand-authored table: one beat per line,
`Day N` lines become separator cards (digits or spelled out), the images are
matched to the non-card beats in order, and a monotonic walk places every line at
its spoken moment. It writes `_pipeline/align_report.txt` and exits 2 when any
line matched only fuzzily — read that report before rendering.

```
python _pipeline/align_script.py --script script.txt --images-dir images
```

Round-trip checked: on a 50-segment episode it reproduced the hand-authored
boundaries with a worst delta of 0.000 s.

### Step 3b — review the mapping before rendering

`build_review.py` writes a contact sheet (all segments, labeled, in order) and an
HTML storyboard (each asset next to its narration line). Read the narration
beside each thumbnail: if an image doesn't obviously illustrate its line, fix the
table and rebuild. This is far cheaper than re-rendering, and it is how the
mis-mappings in `references/pitfalls.md` surface.

## Step 4 — render

`render_video.py` builds one **looped input per segment** and concatenates them
with the concat **filter** (not the demuxer — see the rules below). Segment
lengths are frame-exact, and separator cards fade from/to black so a card never
shares a frame with a scene.

## Step 5 — verify before delivering

`verify_render.py` checks the encoded file itself, not the plan:

1. container/stream sanity — 1920×1080, 30 fps, duration within 0.15 s of the audio;
2. frame continuity — no gaps in the decoded frame timestamps;
3. per-segment identity — the frame at each segment's midpoint must match that
   segment's own asset (catches drift/desync);
4. separator purity — each card's midpoint matches the card and its flanks dip
   to black, so a card never shares a frame with a scene.

Never hand over the video until this passes. A render that "looks fine" can
still have a dropped segment.

## Non-negotiable rules

These come from real failures; each one cost a re-render. The *why* matters more
than the rule — see `references/pitfalls.md` for the full stories.

1. **Concat filter, never the concat demuxer.** For stills of differing sizes,
   the demuxer silently drops images (whole segments vanish, no error).
2. **Separators/cards are their own segments — never an overlay** on a scene.
   An overlay lets the scene show through and makes the separator share a frame
   with the scene image.
3. **Treat every separator identically.** If nine days are full-frame cards,
   the tenth must be too — no special-cased badge/overlay for one of them.
4. **Frame-exact lengths: round boundaries, not durations.**
   `bounds[i] = round(start_i * FPS)`, `count_i = bounds[i+1] - bounds[i]`.
   Rounding each *duration* independently accumulates error and produces gaps.
5. **Match images to narration semantically.** Do not trust that numbering alone
   implies the mapping; verify each image against its line's content.
6. **Pre-normalize to a single size** (step 2) so the concat filter behaves.
7. **Verify the encoded output**, including the opener exemption: the very first
   segment legitimately has no preceding flank, so don't fail it for lacking a
   fade-in from black.

## Optional: cinematic effects pass

For camera motion, 2D overlays, lighting and contextual sound — and for the
validation-first QC that catches over-zooming and misplaced effects — use the
**`cinematic-effects-pass`** skill. It builds on this pipeline's outputs
(`scene_manifest.json`, `_pipeline/norm/`, `transcript/words.json`) and keeps
`scene_manifest.json` as the single timing truth. The notes below are the
short version; the skill is the authority.

### Short version of the cinematic pass

Once the base render passes, an episode can be given camera motion, 2D overlays,
lighting and contextual sound **without touching this pipeline**. The pattern
(see `_pipeline/cinematic/` in a project that uses it):

1. A declarative `effects.json` keyed by manifest segment id. Its times are
   absolute seconds or **phrase anchors resolved against `words.json`**, so an
   effect can never desynchronize from the narration.
2. A frame pre-renderer writing `_pipeline/cine/seg_XX.mp4` for the configured
   segments, at exactly `counts[i]` frames (same rounding rule as rule 4).
3. `render_video.py --cinematic`: use the intermediate for enhanced segments
   (no graph fade — the day dip is baked in) and the still path for cards, then
   mix ambience/one-shots under the narration. Same concat graph, one pipeline.
4. Extend the verifier: for enhanced segments check the frame against what the
   engine *recomputes* for that index, assert the manifest is unchanged, and
   confirm one-shot windows are louder than the baseline while the narration
   level is not ducked.

Gotchas worth knowing up front:

- Mixing PNG stills (rgb24) with MP4 intermediates (yuv420p) in one concat
  **fails** unless every branch ends in `setsar=1,format=yuv420p`.
- A **mono** narration upmixed by `aformat=channel_layouts=stereo` is rematrixed
  at −3 dB, quietly ducking the voice. Use `pan=stereo|c0=c0|c1=c0` instead.
- `volumedetect` collects stats in the filter, which sees every sample *before*
  an output `-ss`, so it reports whole-file numbers for every window. Measure
  window loudness by decoding PCM and computing RMS.
- Keep everything frame-rate independent: author motion in seconds and sample the
  camera state per frame, and use a stable integer hash (e.g. `zlib.crc32`) for
  any randomness — Python's `hash()` is randomized per process and will make
  renders non-reproducible.
