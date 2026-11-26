# stale/ — retired renders

Old versions of the finished video, kept for comparison.
**The current cut always lives in the repository root** — never here.

| File | Retired | Why it was replaced |
|---|---|---|
| `Influencer-During-The-Apocalypse_pre-v2-source-frame.mp4` | before v2 | Stale *pre-fix* encode: produced **before** the coverage fix (`world2d.js` ground slab only reached `y≈2080`, leaking black under the street at tall/zoomed shots) and before the legible duct-tape/blood bandage. Also met its duration only because ffmpeg stretched the last frame (`-shortest` against an over-long audio mix). |
| `Influencer-During-The-Apocalypse_pre-locomotion.mp4` | before v4 | Third cut (v3): correct coverage, duct-tape bandage, lip-sync, blood on "bleeding", safe room on "we're safe". **Still had dead legs** (figures walked with two straight vertical legs, only the arms swung; the `run` flag moved the body up/down but never stepped), a **frozen horde** glued 1:1 to the camera, no aerial-perspective depth, screen-space paper confetti at face height, three **identical red-cap clones** in the safe room, and no phone in the "like and subscribe" shot. |
| `qa_sheet_current.jpg` | current | QA sheet for the root `Influencer-During-The-Apocalypse.mp4` |

## Retention rule
On every new release: `mv <root>.mp4 stale/<name>_<tag>.mp4`, write the new render to the
repository root, then append a row to the table above. If a "new" stale file hashes
identically to an existing one, a previous row was mis-tagged — delete the duplicate
instead of keeping two copies of the same bytes.
