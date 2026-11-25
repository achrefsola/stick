"""Transcribe the narration with WORD-level timestamps.

Word timestamps are required: alignment picks a segment start from the first
word of a phrase, so segment-level timestamps are too coarse. VAD filtering
drops silence so the first word lands where speech actually starts.

Run from the project root. Writes _pipeline/transcript/words.json:
  {language, duration, segments:[{start,end,text}], words:[{w,start,end}]}

Usage:
  STORY_VIDEO_AUDIO=narration.mp3 python transcribe.py
  python transcribe.py path/to/narration.mp3
"""
import json, os, sys

ROOT = os.environ.get("STORY_VIDEO_ROOT", os.getcwd())
MODEL = os.environ.get("STORY_VIDEO_MODEL", "small")

audio = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("STORY_VIDEO_AUDIO")
if not audio:
    sys.exit("pass the audio path as argv[1] or set STORY_VIDEO_AUDIO")
if not os.path.isabs(audio):
    audio = os.path.join(ROOT, audio)

out = os.path.join(ROOT, "_pipeline", "transcript", "words.json")
os.makedirs(os.path.dirname(out), exist_ok=True)

from faster_whisper import WhisperModel

model = WhisperModel(MODEL, device="cpu", compute_type="int8")
segments, info = model.transcribe(audio, word_timestamps=True, vad_filter=True)

words, segs = [], []
for s in segments:
    segs.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()})
    for w in (s.words or []):
        words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})

data = {"language": info.language, "duration": info.duration, "segments": segs, "words": words}
json.dump(data, open(out, "w"), indent=1)
print("transcribed %d words, %.3fs, lang=%s -> %s" % (len(words), info.duration, info.language, out))
