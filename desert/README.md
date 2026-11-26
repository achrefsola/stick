# Would You Walk or Wait? — desert survival dilemma (stickman short)

A pure-2D canvas stick-man short built with the `skills/stickman-short` kit.
The voiceover is the user's ElevenLabs MP3 (unchanged). Music + SFX sit at 50 %
of the voice level; the final master is loudnorm ≈ −14 LUFS / −1.5 dBTP.

**Deliverable:** `out/Would-You-Walk-or-Wait.mp4` — 1080×1920, 30 fps, 59.0 s.

## The story (narration only)
Your plane just crashed in the middle of the desert. The nearest road is two miles
away. The sun is setting and you have one bottle of water. You can walk toward the
road hoping someone finds you before darkness. Or stay beside the wreck and wait for
a rescue that might never come. One decision could save your life. The other could
leave you stranded in the desert. What would you choose?

You start walking. At first the road seems close but the sand slows every step.
The sun disappears. And when you finally reach the road there's nobody there.

You decide to stay. The wreck gives you some shade. You use a piece of metal to
reflect the sunlight toward the horizon. Hours pass. Then at sunrise a search plane
appears. But from thousands of feet above, which survivor is easier to find? The one
beside the wreck or the one who walked away? Would you walk or wait?

## Shots (word-anchored)
| frames | line | what you see |
|--------|------|--------------|
| 0–69 | "Your plane just crashed…" | close on the hero sitting dazed beside the smoking wreck |
| 91–146 | "The nearest road is two miles away." | pull out to a wide reveal: fuselage, wing, empty desert, sun |
| 167–253 | "…one bottle of water." | he holds the one bottle up to the low sun |
| 274–375 | "You can walk toward the road…" | he points down the long walk — the road crosses the sand |
| 398–508 | "Or stay beside the wreck…" | cut back: crouched beside the wing, weighing the wait |
| 527–576 | "One decision could save your life." | stands at the fork of two tracks, thinking |
| 595–655 | "…leave you stranded in the desert." | a tiny figure in an ocean of dunes, scared |
| 713–734 | "What would you choose?" | hard push-in: he looks straight at the lens |
| 753–778 | "You start walking." | he strides off into the dunes |
| 800–932 | "…the sand slows every step." | leaning, dragging steps, heat shimmer |
| 949–976 | "The sun disappears." | dusk: silhouetted, cold blue |
| 999–1084 | "…there's nobody there." | the empty road — he drops to his knees |
| 1113–1139 | "You decide to stay." | he trudges back to the wreck |
| 1162–1192 | "The wreck gives you some shade." | sits in the wing's shade, relief |
| 1210–1294 | "…reflect the sunlight…" | the metal plate catches the sun: a hard flash ON "sunlight" |
| 1314–1330 | "Hours pass." | wide time-lapse, the plate pulsing on the cairn |
| 1390–1474 | "…a search plane appears." | dawn: a plane crosses the sky; he waves |
| 1496–1609 | "…which survivor is easier to find?" | the plane's POV: two figures far below |
| 1623–1697 | "beside the wreck or the one who walked away?" | split-screen: the two futures side by side |
| 1697–1757 | "Would you walk or wait?" | slow push-in, music stops, a low sting under "Would" |

## Rebuild
```bash
python3 audio.py                      # music.wav + sfx.wav (cues from the transcript)
python3 mix.py voice.mp3 music.wav sfx.wav   # mix_raw.wav (prints the level lock)
WEB=$PWD/web RESUME=1 node render.mjs frames "0-1769"
bash finish.sh "Would You Walk or Wait"      # master + QA sheet in out/
```

Notes
- `web/stickman.js` is the unchanged reference stick man (one character, locked).
- `web/world2d.js` adds the desert in the same flat style: `crash / dune / road /
  dawn / pv / compare` backdrops and `wreck / beacon / dune / road / cairn / plane` props.
- Timeline comes from faster-whisper word timestamps (`work/words_fw.json`).
- `work/PLAN.md` holds the shot table this README is built from.