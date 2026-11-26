---
name: stickman-audio-short
description: Make a vertical stick-man cartoon short. Writes the script, then turns the user's voiceover into a finished MP4 with music and SFX at half the voice level. Characters are ALWAYS the reference stick man (red cap, white bean head) drawn in pure 2D canvas — no 3D, no WebGL. Use for any stick figure / animated story short request.
---

# Stick-man short: script → voiceover → finished MP4 (pure 2D)

The one and only character is the **MAIN CHARACTER reference sheet** (stick man: big white
bean head, thin black stick body, black mitt hands, white shoes, red baseball cap with a
brown hair tuft, 8 expressions, gear: red backpack / flashlight / notebook / water bottle).
**This character overrides any character choice** — never invent an alternate design.
Companions (e.g. Sarah: same stick body, brown ponytail, no cap) must be added as variants
in `engine/stickman.js` in the exact same style. Source of truth: `example/character_sheet.jpg`.

Output: 1080×1920, 30 fps, exactly as long as the voiceover. The user's voice is unchanged.
Music + SFX sit at **50 % of the voice level**. Rendering is **pure 2D canvas via Playwright
screenshots — no three.js, no WebGL, no vendored libs** (~1.4 s/frame incl. browser overhead).

## Rules
- Stories and shots are always original. Never recreate another creator's video.
- No real, named living people; no brand mascots or logos.
- No captions unless the user asks. Diegetic text must read correctly.
- Never edit or re-time the voice; every reaction lands 0–3 frames before its word.
- **Audio contract:** music = 50 % of the voice's gated RMS (−6 dB), SFX = 50 % with peaks
  capped at 0.7× voice peak, mixed only with `tools/mix.py`. One linear gain + limiter on
  the whole mix (finish.sh, ≈ −14 LUFS / −1.5 dBTP). No ducking, no compression.
- Keep a task list. Send a stills contact sheet before the full render.

## Stage 1: Intake
If a voiceover is attached, go to Stage 4. Otherwise ask one question: **"Where are you
starting from?"** (voiceover ready / have a script / need ideas + script). Ask the target
length (default 20–30 s; 45–60 s allowed).

## Stage 2: 10 video ideas
Exactly 10 numbered ideas: title (5–8 words), paradox hook line, the twist in one line,
why it animates well (2–3 big visual moments), true-or-legend flag. Verify facts with a web
search; mix eras/themes; nothing graphic or political. Ask the user to pick a number.

## Stage 3: Script
Narration only, ~3.7 words/s (30 s ≈ 110 words): hook → setting → escalation (2–4 beats) →
pivot ("But when…" / "You see,") → twist as the final words. Give the script + word count +
a one-paragraph visual plan + recording tips (steady warm narrator, ElevenLabs speed 1.05,
stability 50 %, export without music). Ask for the voiceover upload.

## Stage 4: Build (no stopping)
### 4.1 Setup
`bash tools/setup.sh <project_dir>` — copies the engine, links Playwright, installs Chromium.
Needs: node 18+, python3 + numpy + Pillow, ffmpeg on PATH.

### 4.2 Timing
`python3 tools/timing.py voice.mp3 script.txt --out work` → `work/phrases.json`
(word timestamps if whisper is importable, else DP phrase alignment). Check pauses fall at
sentence ends. Total frames = round(duration × 30).

### 4.3 Shot plan (`work/PLAN.md`)
One row per shot: frames, words, backdrop, camera move, pose/expr per actor, gear, fx, SFX cue.
Frame 0 is already the hook. Vary sizes (hook close → wide reveal → insert → reaction → payoff).
The twist gets a sting (music stops, low hit, push-in). The last visual lands on the final word.

### 4.4 The cast — ONE character, locked
`engine/stickman.js` is the source of truth; **do not create other characters**. Key API:
```js
drawStick(g, { expr, blink, look, facing, L, R, step, run, tilt, headTilt, bob, gear, cone, viseme })
```
- **views** (`facing`): 0 front · ±0.45 three-quarter · ±1 side · 2 back
- **expressions** (`expr`): neutral happy angry surprised scared sad tired thinking relieved
- **poses** (`L`/`R`): hang walksw point up explore climb reach pull hip chin cross open +
  road / roadpoint / roadreach (running swings) + chest / lean / kayak (the safe room)
- **gear** (`gear`): "backpack" | "flashlight" | "notebook" | "bottle" (array = several);
  `cone` 0–1 lights the flashlight beam
- **palette** (SM): cap #b23330, hair #5b4232, face #ffffff, body #151313, shoes #f6f4ef
- geometry: 600×1000 design canvas, soles y=975; actors anchor at (cx=300, soles)
- the main.js actor transform maps design (300, 975) → the actor's (x, y) at `scale`
- **lip-sync** (`viseme`): `{viseme:"open|wide|round|teeth|close", open:0..1}` replaces ONLY the
  mouth; the eyes/brows keep the feeling from `expr`. `null` = silent, expression mouth
  (smile / frown / o / wavy …) shows instead. Body poses follow a `feel` too, so a scared
  sprint still mouths the words without losing the fear.
To restyle anything, edit `engine/stickman.js` only — keep the reference sheet as truth.

### 4.5 Story (`web/story.js`)
Rewrite `template/story.js`: `SHOTS` (n, backdrop, cam {x,y,z}, ease), `camAt(f)`,
`actorsAt(f,T)` (poses/expr per beat, poses lead their word by 0–3 frames), `fxAt(f,T)`
(dust/rain/flash), optional `CAPTIONS`/`TAG`. Backdrops: room · door · hallway · stairs ·
street · rooftop (extend `engine/world2d.js` in the same flat style).

### 4.5b Timing = the transcript, and the picture must match it
Transcribe `voice.mp3` with word timestamps (whisper) into a `PHRASES` table of
`[text, startFrame, endFrame]`. Everything else is derived from it:
- **cuts** land on the word that motivates them; reactions land 1–2 frames BEFORE it;
- **mouth**: letters of each phrase become timed visemes (`open/wide/round/teeth/close`),
  spaces become short silent gaps so the lips close between words;
- **the action follows the words**: "my arm is bleeding" → the blood appears ON "bleeding"
  (with a heartbeat pulse + red pulse), never earlier; "I think we're safe" → the shot
  changes to the safe place 1 frame before "we're".
Never invent a beat the voice does not say: if the audio says a quieter line (e.g. a calm
aside at −12 dB), give it its own calmer shot instead of reusing the chase staging.

### 4.5c Body & crowd physics (a dead leg or a frozen crowd is a bug, not a style)
- **Legs carry the lean and the stride.** Draw the legs INSIDE the body rotation
  (`rot(tilt,...)` before the leg loop) so a sprint leans into its own legs, split the
  two legs by a real phase (`step` and `step+0.5`), keep the planted foot on the ground
  line while the recovery leg swings through, and drive the knee forward-and-up.
  A constant `footX` offset is not a stride — verify with a phase sheet (8 phases ×
  hero sprint / zombie sprint / walk) before the full render.
- **The crowd must move relative to the hero AND the camera.** A pack that tracks the
  camera 1:1 is wallpaper. Give every member a persistent per-figure drift so near
  waves overtake him and far waves fall behind; in a chase, at least one figure must
  enter and one leave the frame per shot. Never let a member cross the hero silhouette.
- **Depth is not optional:** back rows get an aerial-perspective tint (darker as they
  recede) and every standing figure gets a ground contact shadow, or the shot reads flat.
- **Companions are variants, not clones.** If other survivors appear, change the
  silhouette (head-wear + vest), never reuse the hero's red cap; give them a small
  action (a hand-off) so the room reads as people, not mannequins.
- **Screen-space FX must scroll with the world.** Embers/paper/litter that never move
  while he runs break the illusion — feed them `scrollAt(f)`.

### 4.6 Look check (before the full render)
`WEB=<proj>/web node tools/render.mjs stills/a "0,45,90,..."` then
`python3 tools/sheet.py stills/a stills/sheet.jpg 6`. Look for: character off-frame (anchor
bug), hair covering the eyes, cone too hot, limbs crossing faces, pose not matching the word.
Fix, re-render the sheet, THEN start the full render.

### 4.7 Sound
Rewrite the cue table in `audio.py` (from `example/audio_template.py`): music bed + SFX cues
in seconds. It writes only `music.wav` + `sfx.wav`. Then
`python3 tools/mix.py voice.mp3 music.wav sfx.wav` → `mix_raw.wav` (prints the levels —
confirm music = −6 dB vs voice). Lock picture timing first; timing changes re-run audio.

### 4.8 Render + finish
`WEB=<proj>/web node tools/render.mjs frames "0-<N-1>"` in background (RESUME=1 continues
after interruption). Then `bash tools/finish.sh "Title"` — loudnorm ≈ −14 LUFS + limiter,
H.264 CRF 17 + AAC, freeze/black + loudness QA, `out/qa_sheet.jpg`. Eyeball the QA sheet.
Deliver the MP4 with a few lines on what each shot shows; offer captions or tweaks.

## Tools
`tools/render.mjs` (Playwright screenshot loop; `WEB` env = project web dir; `RESUME=1`) ·
`tools/timing.py` · `tools/sheet.py` · `tools/mix.py` (the 50 % level lock) ·
`tools/finish.sh` (master + QA) · `tools/setup.sh`.

## Requirements
node 18+ · python3 + numpy + Pillow · ffmpeg on PATH · `npm i playwright` (project-local)
+ `npx playwright install chromium`.
