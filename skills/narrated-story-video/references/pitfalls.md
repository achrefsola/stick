# Pitfalls — what went wrong and why (read before rendering)

Each item below is a real failure from building a "10 Days" narrated story video
(41 stills + 10 DAY separators + one 205 s narration). They are ordered by how
much damage they caused.

---

## 1. The concat *demuxer* silently drops still images

**Symptom.** Whole segments missing from the output. No error, no warning. A
scene that was in the plan simply never appeared.

**Cause.** The timeline was built with `concat` as a *demuxer* (`-f concat -i
list.txt`). When the stills in the list have **different pixel sizes**, this
FFmpeg build drops some of them from the output instead of failing.

**Fix.** Use the concat **filter** instead: one looped input per segment, each
trimmed to an exact frame count, then `concat=n=N:v=1:a=0`. Never the demuxer
for stills. (`render_video.py` does this.)

**Belt and braces.** `normalize.py` makes every story input exactly 1920×1080,
so even if someone swaps the filter for a demuxer the sizes match.

---

## 2. A separator is a SEGMENT, never an overlay

**Symptom.** During the "DAY 2" separator, the first scene of day 2 was briefly
visible *behind* the day number — and the scene appeared to start before its
line. The transition "mixed" the separator and the scene.

**Cause.** The DAY card was drawn as an overlay on top of the scene. The scene
was already playing underneath.

**Fix.** Treat each card as a **full-frame segment of its own**, occupying its
own slice of the timeline between the last scene of one day and the first scene
of the next. Fade the card in from black and out to black, and fade the flanking
scenes (the one ending the day, the one opening the next), so a card and a scene
**never share a frame**. In `render_video.py` this is the `kind == "card"` branch
plus the flanking-scene fade-in/out.

**How to be sure.** `verify_render.py` check 4: the card's midpoint must match
the card image, and both flanks must be near-black.

---

## 3. Every separator gets identical treatment

**Symptom.** Day 3's separator didn't show as a black card at all — only a
"DAY 3" label floated over the first day-3 scene, while days 1, 2, 4… were
proper black cards. The video felt inconsistent at that boundary.

**Cause.** Day 3 had been special-cased as a stroke-only RGBA *badge* overlay
instead of a full-frame card, while every other day used the full card.

**Fix.** One code path for all separators. If nine days are full-frame cards, the
tenth is too. Consistency is the point of a separator; special-casing one of them
is immediately visible.

---

## 4. Frame-exact lengths: round BOUNDARIES, not durations

**Symptom.** Tiny gaps / a drifting tail; the last frame didn't line up with the
audio end.

**Cause.** Each segment's length was computed independently as
`round(duration * FPS)`. Independent rounding means the errors accumulate across
segments, so the timeline slowly drifts off the audio.

**Fix.** Round the *boundaries* once, then take differences:

```python
bounds = [round(s["start"] * FPS) for s in segs] + [round(audio_duration * FPS)]
counts = [bounds[i+1] - bounds[i] for i in range(len(segs))]
```

Rounding error can never accumulate, the segments tile the timeline exactly, and
the final frame lands on the audio end. (`render_video.py`, and the same idea is
what `verify_render.py` checks by finding zero gaps.)

---

## 5. Match images to narration by CONTENT, not by numbering

**Symptom.** Several images played under the wrong lines, which the user
immediately spotted. Because a wrong image also shifts the *feel* of the timing,
it made the whole video look out of sync — even the parts that were correct.

**Cause.** Assuming "image N goes with the Nth beat" instead of checking what
each image actually shows against what each line says.

**The concrete corrections** (left = what the line says, right = the image that
actually belongs there):

| Narration line | Correct image | What it shows |
|---|---|---|
| "you lock your apartment door" | `5.png` | hand on the front-door handle, locking up |
| "suddenly, the electricity cuts out" | `7.png` | infographic: unplugged outlet, silent fridge, no wifi |
| "your phone has 19% battery left" | `8.png` | phone on the table reading 19% |
| "you try calling everyone… nothing" | `9.png` | character holding the phone, calling |
| "stops completely" (water) | `11.png` | macro zoom on the faucet — the focus beat right after `10.png` |

Note the last one: `11.png` is a *focus/zoom beat* on the same subject as
`10.png`, so it plays on the short "stops completely" tail of the sentence, not
on a new sentence. Some images are beats, not beats-with-their-own-line.

**Fix / prevention.** Before rendering, build the contact sheet
(`build_review.py`) and read the narration next to each thumbnail. If an image
doesn't obviously illustrate its line, stop and re-map it. Also: the user may
supply an extra image (here `sofa.png` for "push the couch against the door")
and the numbering may skip a value (here 17 was absent) — handle both in the
boundary table rather than renumbering files.

---

## 6. Verify the encoded file, and exempt the opener

`verify_render.py` must run on the finished MP4. But note: the **first** segment
starts at t=0 and has no preceding scene, so it legitimately has no leading
fade-from-black. Do not fail it for that — the check exempts `i == 0`
(`lead_ok`). Every interior separator must still show black on both sides.

---

## 7. Long holds are a pacing choice, not a bug

Some lines are long, so their image holds for many seconds (e.g. a 13 s and an
11 s hold on long paragraph lines). That is expected when one image illustrates a
whole paragraph. Only "fix" it if the user asks — and if so, split by adding
extra images, not by trimming the audio.
