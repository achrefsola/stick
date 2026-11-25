#!/usr/bin/env bash
# Creates a new stick-man short project:   bash tools/setup.sh <project_dir>
# Pure 2D — no three.js, no WebGL, no vendored libs.
# Needs: node 18+ (any), python3 + numpy + Pillow, ffmpeg on PATH,
#        playwright (npm i -g playwright && npx playwright install chromium).
set -e
KIT="$(cd "$(dirname "$0")/.." && pwd)"; P="${1:?project dir}"
mkdir -p "$P/web" "$P/work" "$P/stills" "$P/out" "$P/node_modules"
cp "$KIT"/engine/*.js "$KIT"/engine/index.html "$P/web/"
cp "$KIT"/template/story.js "$P/web/story.js"                 # starting point: rewrite for the new story
cp "$KIT"/example/audio_template.py "$P/audio.py"             # starting point: rewrite the cue table
cp "$KIT"/tools/*.mjs "$KIT"/tools/*.py "$KIT"/tools/finish.sh "$P/" 2>/dev/null || true
# playwright resolution for render.mjs (ESM ignores NODE_PATH — link it locally)
if [ ! -e "$P/node_modules/playwright" ]; then
  GLOBAL="$(npm root -g)/playwright"
  if [ -d "$GLOBAL" ]; then ln -sf "$GLOBAL" "$P/node_modules/playwright"
  else (cd "$P" && npm i playwright --no-fund --no-audit >/dev/null 2>&1); fi
fi
npx --yes playwright install chromium >/dev/null 2>&1 || true
echo "ready: $P
run:  WEB=\"$P/web\" node \"$KIT/tools/render.mjs\" \"$P/stills\" \"a-b\"   (frames)
      python3 \"$KIT/tools/sheet.py\" \"$P/stills\" \"$P/stills/sheet.jpg\"  (contact sheet)
      python3 \"$P/audio.py\" && python3 \"$KIT/tools/mix.py\" \"$P/voice.mp3\" \"$P/music.wav\" \"$P/sfx.wav\"
      bash \"$KIT/tools/finish.sh\" \"Title Of Short\"   (from \$P)"
