# Demo film

The 157-second demo is generated from code: real footage of the running app, a canvas-drawn blueprint film, synthesized music and sound effects, a spoken narration and styled captions. One shared timeline (`timeline.js`) drives picture and sound.

Needs Node 20+, Python 3 with NumPy and SciPy, ffmpeg, Google Chrome, and macOS (`say`) for the voice.

```bash
cd video && npm install
node capture-footage.mjs      # record the live app (starts the local server, uses the warm Qloo cache)
node dump-cues.mjs            # timeline -> out/cues.json
python3 audio.py              # music and sound effects
python3 voice.py              # narration, ducked mix, out/audio.wav, out/voiceover.wav, out/captions.srt
node render.mjs               # out/tastebridge-groups-demo.mp4
node render.mjs --stills 12,50,120   # quick frame checks in out/qa/
```

`VOICE=Ava RATE=165 python3 voice.py` swaps the narrator (any voice `say -v '?'` lists). `YOUTUBE.md` has the upload text.
