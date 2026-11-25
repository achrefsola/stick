---
name: cinematic-effects-pass
description: Add or repair a scene-aware cinematic effects pass — camera motion, 2D overlays, lighting and contextual sound — on a narrated story video built from stills plus one narration track. Use whenever the user wants a video to feel "cinematic" or "professionally edited" instead of a slideshow, asks for camera moves, zooms, pans, effects, sound design or ambience on a narrated video, complains that a video is over-zoomed, cropped, shaky or that an effect or sound is too long, misplaced or unnecessary, or asks to validate, QC or review video editing — even if they only say "make it look better". Always validate the plan before rendering.
---

# Cinematic effects pass (scene-aware, validation-first)

An effects LAYER on top of a stills-to-video pipeline. It is not a second render
pipeline: it pre-renders the configured segments to intermediates, and the
existing render graph consumes them through the same concat path it already uses.
`scene_manifest.json` stays the single source of timing truth.

Build the base video first with the `narrated-story-video` skill (transcript,
`_pipeline/scene_manifest.json`, `_pipeline/norm/`). This skill adds meaning on
top of it.

## The three rules that outrank everything else

1. **Validation before rendering.** `validate.py` is the gate, not a nicety. Run
   it, fix the plan, run it again. It has caught real engine bugs that looked
   like "bad creative choices" — see `references/pitfalls.md`.
2. **Static by default.** Movement must say something. In a 40-scene episode the
   healthy balance is roughly a third animated. If a scene's `reason` reads like
   a justification for a move you already decided on, delete the move.
3. **Every effect is bounded by the narration line that motivates it** — not by
   the segment, and not by the presence of another effect.

## Setup

Copy `scripts/*.py` into the project's `_pipeline/cinematic/` folder (they
resolve the project root from their own location, same convention as
`narrated-story-video`), then:

```bash
python _pipeline/cinematic/sfx_build.py          # synthesized foley, once
python _pipeline/cinematic/validate.py           # QC gate — run BEFORE rendering
python _pipeline/cinematic/render_cine_frames.py # intermediates for enhanced segs
python _pipeline/render_video.py out.mp4 --cinematic
python _pipeline/verify_render.py --cinematic out.mp4
```

`validate.py --no-previews` is the fast plan check. It writes
`_pipeline/cine/validation_report.md`, start/mid/end frames for every effect, and
a contact sheet of all scenes with their protected regions, anchors and camera
paths. Exit code 1 on any FAIL.

## The effects manifest (effects.json)

`scripts/draft_effects.py` writes a first-pass plan from `scene_manifest.json`:
every scene a static full-frame hold, day openers marked `establish`, the cut to
black at the end. It validates immediately (0 FAIL, every scene flagged
`assumed`) and renders as a clean cut — so the creative pass starts from a
working baseline instead of a blank file, and it never overwrites an existing
plan.

```bash
python _pipeline/draft_effects.py
```

Read `references/effects-schema.md` before authoring one. Shape in one line:
per scene — `_note`, `confidence`, optional `establish`/`hold`, `protected`
regions, `anchors`, and effect entries (`motion`, `light`, `overlays`) each
carrying a `reason`; plus top-level `sfx` (one-shots) and `beds` (looping
ambience with narration-anchored envelopes).

Everything creative is declarative; nothing is derived by a rule. Times are
absolute seconds or **phrase anchors** against the transcript, so effects can
never drift from the narration.

## Correcting a rendered video (the review loop)

When the user reviews a render and reports problems, work in this order:

1. **Reproduce the complaint in the artifact** before editing anything: grab the
   frame at the reported time, and measure the audio in a window around it. Do
   not fix from the description alone — "the sound is too long" needs the real
   boundary, which comes from the transcript, not from the timestamp the user
   guessed.
2. **Ask what the narration is doing at that moment.** An effect that outlives
   its line is fixed by re-anchoring to the line, not by shortening a number. See
   the water-bed pitfall in `references/pitfalls.md`.
3. **Ask whether the effect is motivated at all.** A visual flourish that
   exists because a sound started is noise — delete it rather than soften it.
4. **Fix the plan, re-run `validate.py`, then re-render only the changed
   segments** (`render_cine_frames.py --only 14,23 --force`) and the final video.
   Intermediates are cached per segment.
5. **Re-check in the artifact**, not in the plan.

## Non-negotiables (each one cost a re-render)

- **`rh = rw`.** The visible rect lives in normalized image units, which already
  span the full 16:9 frame on both axes. Multiplying by H/W silently makes every
  move 1.78× tighter than configured and crops the frame top and bottom — the
  exact "overused zoom" complaint that triggers this skill.
- **Composite sprites with straight alpha.** `paste()` folds the mask into the
  RGB of a transparent layer, so `alpha_composite` squares it and weak glows
  vanish. Use the `composite_sprite()` helper in `overlays.py`.
- **A recurring word needs `"nth"`.** "containers" is spoken on Day 3 before
  Day 5; first-match matching will anchor your effect three days early.
- **Never crop a protected region on any frame**, shake included. If the subject
  and the context cannot both fit the 16:9 frame at any zoom, the scene is
  static — that is the answer, not a smaller zoom.
- **One justified shake beats a rhythm of them.** Camera shake needs zoom margin
  (use the `hold` preset), a physical cause in the story, and no repeats.
- **Verify declared regions against the image.** Validation can only check what
  you declare; a misplaced region validates cleanly and is still wrong. Confirm
  every animated scene's regions on the contact sheet, and mark anything
  unconfirmed `confidence: "assumed"` so it is flagged instead of trusted.
- **Audio QC measures windows, never `volumedetect`.** That filter sees every
  sample before an output seek and reports whole-file stats. Decode PCM and take
  windowed RMS; to isolate one sound, difference the mix against a reference mix
  built without it.
- **Verify the encoded output** with `verify_render.py --cinematic`, and keep
  the plain render as a loudness baseline (the narration must not move).

## Full details

- `references/effects-schema.md` — manifest schema, presets, lighting, overlays,
  validation checks, and the render/verify commands.
- `references/pitfalls.md` — the concrete failures behind every rule above,
  with symptom → cause → fix.
