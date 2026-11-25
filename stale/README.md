# stale/ — retired renders

Old versions of the finished video, kept for comparison.
**The current cut always lives in the repository root** — never here.

| File | Retired | Why it was replaced |
|---|---|---|
| `Influencer-During-The-Apocalypse_pre-v2-source-frame.mp4` | before v2 | Stale *pre-fix* encode: produced **before** the coverage fix (`world2d.js` ground slab only reached `y≈2080`, leaking black under the street at tall/zoomed shots) and before the legible duct-tape/blood bandage. Also met its duration only because ffmpeg stretched the last frame (`-shortest` against an over-long audio mix). |
| `Influencer-During-The-Apocalypse_pre-safe-room.mp4` | before v3 | Second cut: correct coverage + duct-tape bandage, but the mouth never moved and every shot sat in the same street with the same "two files" horde. Left the bed and the dialogue unchanged on purpose (the voice is never re-timed). |
| `qa_sheet_current.jpg` | current | QA sheet for the root `Influencer-During-The-Apocalypse.mp4` |

## Retention rule
On every new release: `mv <root>.mp4 stale/<name>_<tag>.mp4`, write the new render to the
repository root, then append a row to the table above.
