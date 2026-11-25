# effects.json — manifest schema and workflow

Consumed by `engine.py`, checked by `validate.py`. Keys are manifest segment ids
(see `scene_manifest.json`). DAY cards are never enhanced.

```json
{
 "defaults": { "fade": 0.30, "fps": 30 },
 "end": { "at": 204.72 },

 "beds": [
  { "file": "water_loop.wav", "gain": 0.85, "ends_with": 24,
    "reason": "the tank flowing only while the water is the subject",
    "envelope": [[0,0.0],
                 [{"phrase":"still water"},0.0],
                 [{"phrase":"still water","offset":0.45},0.9],
                 [{"phrase":"fill one of your containers","offset":1.0},0.62],
                 [{"phrase":"although","offset":0.35},0.0]] }
 ],

 "sfx": [
  { "name": "power_down", "at": {"t": 27.78}, "gain": 0.794,
    "reason": "the mains collapsing on 'the electricity cuts out'" }
 ],

 "segments": {
  "5": { "_note": "DAY 1 - locking the door",
         "confidence": "verified",
         "motion": { "preset": "push_in", "zoom": 1.16, "focus": [0.56,0.47],
                     "ease": "out",
                     "reason": "push toward the hand on the handle",
                     "camera_events": [ {"at": {"phrase": "attacking"}, "amp": 5,
                                         "freq": 8, "decay": 8,
                                         "reason": "the street turns violent"} ] },
         "protected": [ [0.46,0.26,0.80,0.70,"hand on the handle"],
                        [0.53,0.24,0.78,0.70,"door leaf"] ],
         "anchors": { "tv_screen": [0.87,0.22,0.98,0.56] },
         "light": { "reason": "low-key interior",
                    "vignette": {"t_on": 32.54, "radius": 0.72, "strength": 0.42} },
         "overlays": [ {"type": "glow", "pos": [0.93,0.40], "anchor": "tv_screen",
                        "radius": 0.17, "color": [198,62,48], "gain": 0.45, "seed": 61,
                        "reason": "the red broadcast pulsing on the screen",
                        "env": [[22.60,0.15],[22.95,0.50],[26.10,0.10]] } ] }
 }
}
```

## Scene keys

| key | meaning |
|---|---|
| `protected` | `[x0,y0,x1,y1,label]` rects the camera may never crop — validated on **every frame**, shake included |
| `anchors` | `{name: [x0,y0,x1,y1]}` — overlays reference one by name and must sit inside it |
| `establish` + `hold` | the scene must open full-frame (zoom 1.0) and hold for N seconds |
| `confidence` | `"verified"` (read off the image) or `"assumed"` (flagged for manual inspection) |
| `reason` | required on every motion / light / overlay / sfx / bed; also put one on each `camera_event` |

Omitting `motion` entirely means a static full-frame shot — and the engine skips
the supersample pass, so the still keeps native sharpness.

## Time specs

Every time accepts one of:

- a number: `27.78`
- `{"t": 27.78, "offset": 0.1}`
- `{"phrase": "goes dark"}` — first occurrence of the phrase in the transcript
- `{"phrase": "containers", "nth": 1}` — second occurrence (a word can recur days later)
- a run: `{"phrase": "three flashes", "count": 3, "interval": 0.42}`

Bed envelope points accept the same specs. Anchoring to the transcript is what
keeps effects glued to the narration when the edit moves.

## motion

| field | meaning |
|---|---|
| `preset` | `push_in`, `pull_out`, `zoom_focus`, `pan_lr`, `pan_rl`, `tilt_up`, `tilt_down`, `ken_burns`, `drift`, `handheld`, `hold`, `static` |
| `zoom` | final magnification. Keep 1.05–1.25; higher starts eating subjects |
| `focus` | `[fx,fy]` normalized point the move settles on |
| `travel` | fraction of available room a pan/tilt sweeps |
| `ease` | `smooth` (default), `linear`, `in`, `out`, `smoother` |
| `wander` | sub-pixel drift for `drift`/`handheld` |
| `camera_events` | `[{"at": …, "amp": 6, "freq": 9, "decay": 7, "reason": …}]` |

`hold` = static at `zoom` (default 1.06): no movement, but enough margin for a
justified shake to read without exposing a border. `static` = zoom 1.0.

## light

- `flicker` `{t0,t1,depth,cycles}` — lights stuttering between two times.
- `vignette` `{t_on,t_off,radius,strength,edge,ramp}` — general darkening.
- `beam` `{from,to,width,strength,warm}` — directional flashlight pool: `from` is
  where the light is held, `to` where it points. Read both off the image.
- `warm` `{pos,radius,color,gain,t_on,ramp,off_at,off_to}` — lantern/candle glow;
  `off_at` + `off_to: 0.0` is an abrupt kill, `off_to: 0.15` a gentle dim.
- `dim` `[[t,v],...]` — global brightness envelope, merged into the baked fades.

## overlays

`flash_glow` (impulse), `glow` (piecewise `env`), `flash_veil` (broad bloom — use
when a light must read against an already-bright area), `battery`, `dust`,
`steam`, `knock_waves`, `motion_lines`. Palette matches the illustrations: ink
`(46,38,32)`, cream `(246,238,222)`, warm `(255,216,150)`, red `(198,62,48)`.

## sfx and beds

- one-shot: `{"name": "knock2", "at": …, "gain": 0.7, "reason": …}` →
  `_pipeline/sfx/<name>.wav`. Missing file = warning, not a crash.
- bed: `{"file": "amb_wind.wav", "gain": 0.63, "reason": …, "envelope": …}`.
  `ends_with: <segment id>` documents which segment's narration must contain the
  bed's last audible point.
- gains: one-shots peak −4 to −18 dBFS depending on prominence; beds ~10 dB under
  the narration; `alimiter` runs `level=disabled` so it never re-normalises.

## What validate.py checks

1. protected regions survive every frame of the camera path
2. `establish` scenes really open full-frame and hold
3. every positioned overlay names a declared anchor and sits inside it
4. every effect carries a `reason`
5. one-shots do not outlive their narration segment; beds end with their
   narration (`ends_with`)
6. effect repetition is listed for manual judgement
7. animation policy: warns when more than ~75% of scenes are animated
8. writes start/mid/end frames per effect + the all-scenes contact sheet

Exit 1 on any FAIL. Fix the plan, not the render.
