# Pitfalls — the failures behind the rules

Each entry: symptom → cause → fix. All of these happened in one project.

---

## 1. Every zoom was 1.78× tighter than configured

**Symptom.** "You overused zooming and repeatedly cropped important visual
information." Frames looked plausibly composed, so nothing jumped out — but a
configured `zoom: 1.14` was really a 2.03× crop, and a `zoom: 1.0` start was
already a 1.78× crop of the frame top and bottom.

**Cause.** The visible rect was computed as `rh = rw * H / W`. Normalized
coordinates already span the full 16:9 image on both axes, so the factor was
applied twice: a rect of `rw × rw*0.5625` covers the full width but only 56% of
the height, then gets stretched back to 16:9.

**Fix.** `rh = rw`, and the y-clamp mirrors the x-clamp (`room/2`, not
`room*9/16/2`). The lesson is bigger than the one line: **a framing bug looks
like a creative bug.** You cannot tell them apart by watching — you need
protected regions checked against the real per-frame crop, which is what
`validate.py` does. Fix the geometry first, then judge the creative choices.

---

## 2. Weak glows rendered at alpha² and vanished

**Symptom.** A distant red/blue emergency light that was configured at gain 0.6
was invisible on a bright street; per-channel measurement showed ±1 luma where
±30 was expected.

**Cause.** `layer.paste(sprite, pos, scaled_alpha)` on a transparent RGBA layer
folds the mask into the sprite RGB (the layer becomes pre-multiplied), and the
following `alpha_composite` applies the alpha again. Effective alpha = k². A
glow at k=0.3 renders at 0.09.

**Fix.** Composite sprites with straight alpha — `composite_sprite()` in
`overlays.py` places the sprite (colour intact, alpha scaled) into a cleared
full-frame buffer and `alpha_composite`s it. Note the bright-on-bright trap too:
blending toward a *dark* colour (198,62,48) on a sunlit street darkens; use an
emissive colour (255,96,88) so a light reads as light.

---

## 3. A sound effect covered the whole day

**Symptom.** "The water sound effect is covering the whole day, from 1:27 to
1:38 — it should not go that far. You should really understand where to put it."

**Cause.** The bed was given the *segment* as its duration. The segment ran to
98.8 s, but the narration it belonged to was *"There's still water inside. You
fill one of your containers,"* ending at 90.2 s — the remaining 8 s of segment
were the reflection (*"although you have no idea…"*) and the hope line, which
should play dry.

**Fix.** Anchor the envelope to the lines: rise on `"still water"`, fall to zero
just after *"although"* begins. Verified by differencing the mix against a
reference mix built without that bed — the isolated sound sat at −30 dB through
88–91 s and at the noise floor afterwards.

**The rule:** a sound's duration is the duration of the line that motivates it,
plus a short tail. Segment ≠ motivation. A segment routinely contains several
narrative beats; only one of them may own the sound.

---

## 4. A visual effect appeared because a sound did

**Symptom.** "At the beginning of the water sound there is like a visual light
effect … the same effect appears near 0:47 when the sound effect of the water in
the sink — that visual brief light appears also, that is unnecessary."

**Cause.** "Glaze the moment" thinking: a small sparkle was added at the spout
to accompany the drip/water sounds. The result reads as a stray flash that
coincides with audio, not as a deliberate beat.

**Fix.** Deleted in both scenes; the sounds carry them. **The rule:** an effect
must be motivated by the narration or the picture — never by the presence of
another effect, and never as an accompaniment to a sound. When in doubt, delete.
(The user's phrasing to watch for: "that is unnecessary", "why does X appear".)

---

## 5. First-match phrase anchoring landed days early

**Symptom.** A bed envelope point written as `{"phrase": "containers"}` resolved
to 50.06 s instead of 90.18 s — "containers" is spoken on Day 3 before Day 5.

**Cause.** The resolver returned the first transcript match.

**Fix.** `{"phrase": "containers", "nth": 1}` selects the occurrence, and the
resolver now errors if `nth` is out of range. Prefer a longer unique phrase
(`"fill one of your containers"`) over `nth` when one exists. After adding any
anchor, print the resolved times and read them.

---

## 6. A misplaced protected region validated cleanly

**Symptom.** The Day-2 scene pushed toward `focus: [0.28, 0.42]` — away from the
television, which was at the *right* edge of the image — and the validator
reported nothing.

**Cause.** The region had been read off a small contact sheet and put on the
left. Validation checks declared regions against the camera path; it cannot know
the declaration is wrong.

**Fix.** Verify every *animated* scene's regions and focus on a large view of the
source image (the all-scenes contact sheet, with regions drawn, is written by
`validate.py`). Mark anything unconfirmed `confidence: "assumed"` so it is
listed for manual inspection instead of trusted. Four other scenes were
corrected the same way after zooming in: a door at the frame's left edge, a
flashlight that was actually a phone lying on the floor, a lantern lower than
assumed, and pouring water that spanned the full frame (→ static).

---

## 7. `volumedetect` reported whole-file numbers for every window

**Symptom.** Windowed loudness checks all returned the same value.

**Cause.** `volumedetect` accumulates inside the filter, which sees every sample
*before* an output `-ss`, so output-side trimming does not limit what it
measures.

**Fix.** Decode PCM (`-f f32le`) and compute windowed RMS in numpy. To prove a
specific cue exists, difference the render against a reference mix built with
the same chain minus that cue — same encoder, same sample rate, so the
difference is the effect with no alignment residual. (Cross-file differences
against a baseline of a different sample rate are confounded by the resampler's
~5 ms group delay.)

---

## 8. Mono narration came out 3 dB quiet

**Symptom.** The mixed render measured −3 dB against the original in every
window.

**Cause.** `aformat=channel_layouts=stereo` upmixes a mono source with a −3 dB
rematrix.

**Fix.** Probe the channel count and duplicate the channel instead:
`pan=stereo|c0=c0|c1=c0`. Beds/one-shots are already stereo and unaffected.

---

## 9. Concat rejected mixed still + video branches

**Symptom.** The render graph failed once intermediates (yuv420p) were mixed
with looped stills (rgb24).

**Cause.** The concat filter requires identical link parameters.

**Fix.** Every branch ends `…,setsar=1,format=yuv420p` before concat.

---

## 10. Two shakes where one was earned

**Symptom.** "Remove the repeated screen shake during 'others are getting
backup' unless it has a clear narrative purpose."

**Cause.** Shakes were attached to dramatic words as a rhythm.

**Fix.** One shake, on the physical beat (a startle, an impact, raising a light),
with a written reason. A heartbeat is not a camera event. Also remember a shake
needs zoom margin: on a `zoom: 1.0` static the rect clamps and the shake does
nothing — use the `hold` preset.
