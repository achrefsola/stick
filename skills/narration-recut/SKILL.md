---
name: narration-recut
description: >
  Recut, repair, and QC narration/VO audio for short-form video (Shorts, Reels,
  TikTok) built from a clean voice stem. Use whenever cutting VO lines out of a
  narration stem, when the user reports clipped syllables or words cut off
  mid-word ("basemen" instead of "basement", "infec" instead of "infected"),
  when they report dead silence / audio holes between lines, or when
  publishing QC of a generated short's audio. Also applies to any edit that
  changes only audio and can be re-muxed without re-rendering video.
---

# Narration recut and audio QC for shorts

Two failure modes this skill exists to prevent, both learned from a real
delivery that shipped broken and had to be fixed:

1. **Clipped syllables.** Aligner word timestamps (e.g. `words.json` from a
   transcription pass) routinely end a word 0.1–0.25 s before the voice
   actually stops sounding. Cutting at the timestamp — or worse, placing a
   fade-out *before* the timestamp — amputates final syllables ("basement" →
   "basemen"). Never trust word-end stamps; measure the energy.
2. **Dead-silence gaps.** Background beds mixed below about −35 dBFS RMS are
   inaudible at normal playback. Gaps between narration lines then read as
   audio dropouts, not atmosphere.

## Procedure

### 1. Measure, don't trust timestamps

Decode the stem to raw float and profile 20 ms RMS windows around every
planned cut boundary:

```bash
ffmpeg -v error -i stem.mp3 -f f32le -ac 1 -ar 48000 - | analyze
```

For each line determine from the envelope:

- **First speech onset** — start the cut ~40 ms before it (pre-roll, in silence).
- **Decay-to-silence point** — where speech drops to the stem's room-tone
  floor (often −10 to −20 dB below the noise floor). End the cut *after*
  this point with ≥100 ms of margin. This is the cut that must be energy-
  derived; the timestamp end is a starting guess only.
- **Next word's actual onset** in the stem — extending the end must never
  reach it, or you splice in a fragment of the following word.

Typical room-tone floor is around −36 dBFS RMS in 20 ms windows; speech
peaks −15 to −20. Judge "silence" relative to the stem's own floor, not an
absolute number.

### 2. Fades

- Fade-in ~35 ms, fade-out ~45 ms — just anti-click, placed **in room tone**,
  not over speech. Long fades (75 ms+) starting at the word-end timestamp are
  exactly what ate the syllables. Uses `x ** 1.5` power curves so tails fall
  naturally.

### 3. Timeline collisions

After extending cut ends, re-check the *output* timeline: each line's
landing end must not collide with the next line's landing start, an SFX
onset, or an intentional quiet zone. Tails overlapping by tens of
milliseconds of pure decay are fine; overlap of audible speech is not.

### 4. Beds and the silence audit

- Beds at **−30 to −33 dBFS RMS** are audible as ambience; −38 and below are
  not. Duck beds ~40% under speech (moving-average envelope of |vo|).
- Hard gates for dramatic dips are fine, but keep the floor ≥ −24 dBFS in
  the body of the piece. The only acceptable near-silence is an intentional
  pre-cliffhanger dip and the final tail fade.
- A 40 Hz sub swell under a tense hold helps continuity without competing
  with speech.

### 5. Audio-only change → re-mux, don't re-render

If the video is unchanged, rebuild the WAV and remux with `-c:v copy`. This
turns a 9-minute re-render into a 2-second remux:

```bash
ffmpeg -y -v error -i silent.mp4 -i new.wav -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart out.mp4
```

## Verification battery — run all four before delivering

`scripts/verify_cuts.py` runs the first three in one pass:

```bash
python scripts/verify_cuts.py --wav final.wav \
  --cuts cuts.json            # [{"start": stem_in, "end": stem_out, "land": out_time}, ...]
  [--stem stem.mp3]           # optional, adds the syllable-completion check
```

1. **Syllable completion** (needs `--stem`) — the decisive check. For each VO
   slice, take the slice's voiced level (75th percentile of 20 ms RMS
   windows) and require the **fade-out region (last 45 ms) to contain no
   audio above voiced − 15 dB**. Reverb tails 15+ dB under the voiced level
   are fine to cut; anything louder means a syllable is being amputated by
   the fade. Calibrate on both directions when you change the threshold:
   the original broken cuts in the source project failed 10/10 lines
   (worst: fade-region max 1 dB below voiced level), the fixed cuts passed
   10/10 — if your new threshold passes known-bad cuts or fails known-good
   ones, it is wrong.
2. **Click check** — max |x[n]−x[n−1]| in a window around every splice,
   compared against the global p99.99. Splice steps must be tiny (< 0.01);
   the global max may be large if a bang transient exists — that's expected.
3. **Silence audit** — RMS per 0.5 s window across the whole piece; flag any
   body window below −45 dBFS.
4. **Loudness on the final muxed MP4** (not the pre-mux WAV — AAC encode and
   channel mapping shift the numbers):

```bash
ffmpeg -i final.mp4 -map 0:a -af "ebur128=peak=true:framelog=quiet" -f null - 2>&1
```

   Target −14 LUFS integrated, TP ≤ −1.0 dBFS for YouTube.

Only deliver after all four pass. If the user later reports a specific word
still sounding tight, re-profile just that boundary and widen that one cut —
the measurement loop above is per-line, so a targeted fix is a one-line
change plus remux.
