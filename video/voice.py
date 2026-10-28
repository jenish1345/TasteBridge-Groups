"""Voiceover: reads the narration from out/cues.json, speaks each line with macOS `say`, fits it to its slot, polishes it,
then mixes it over the music and sound effects (which duck underneath it). Writes out/vo.json (for the captions) and out/audio.wav.
Run after audio.py.   VOICE=Daniel RATE=172 python3 voice.py"""
import json, os, subprocess, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
VOICE = os.environ.get('VOICE', 'Daniel')
RATE = os.environ.get('RATE', '172')
data = json.load(open('out/cues.json'))
TOTAL, VO = data['total'], data['vo']
os.makedirs('out/vo', exist_ok=True)


def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float32) / (32768.0 if x.dtype == np.int16 else 1.0)
    return x if x.ndim == 1 else x.mean(1)


def trim(x, thr=0.012, pad=0.03):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x
    return x[max(0, idx[0] - int(pad * SR)): idx[-1] + int(pad * 2 * SR)]


def peaking(x, f0, gain_db, q=0.9):
    A, w0 = 10 ** (gain_db / 40), 2 * np.pi * f0 / SR
    al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def polish(x):
    x = signal.sosfilt(signal.butter(2, 85, 'high', fs=SR, output='sos'), x)
    x = peaking(x, 180, 2.5, 0.8)    # body
    x = peaking(x, 3200, 2.5, 0.9)   # presence
    x = peaking(x, 7500, -2.0, 1.2)  # soften sibilance
    # gentle compression: fast envelope follower
    env = np.sqrt(signal.sosfilt(signal.butter(1, 18, 'low', fs=SR, output='sos'), x * x) + 1e-9)
    gain = np.where(env > 0.08, (0.08 / env) ** 0.45, 1.0)
    x = x * signal.sosfilt(signal.butter(1, 30, 'low', fs=SR, output='sos'), gain)
    x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * 0.115  # even loudness line to line
    return x


lines = []
for i, ln in enumerate(VO):
    aiff, raw = f'out/vo/{i:02d}.aiff', f'out/vo/{i:02d}_raw.wav'
    run('say', '-v', VOICE, '-r', RATE, '-o', aiff, ln.get('say', ln['text']))
    run('ffmpeg', '-y', '-i', aiff, '-ar', str(SR), '-ac', '1', raw)
    x = trim(load(raw))
    nxt = VO[i + 1]['t'] if i + 1 < len(VO) else TOTAL - 0.2
    window = nxt - ln['t'] - 0.12
    dur = len(x) / SR
    if dur > window:  # speed up to fit, never beyond 1.3x
        tempo = min(1.3, dur / window)
        sp = f'out/vo/{i:02d}_fit.wav'
        run('ffmpeg', '-y', '-i', raw, '-filter:a', f'atempo={tempo:.3f}', sp)
        x = trim(load(sp))
        dur = len(x) / SR
        note = f'  (sped x{tempo:.2f})'
    else:
        note = ''
    over = ln['t'] + dur - nxt
    flag = '  OVERLAP %.2fs' % over if over > 0.05 else ''
    print(f"{i:2d} t={ln['t']:6.1f} dur={dur:4.1f} slot={window:4.1f}{note}{flag}  {ln['text'][:56]}")
    lines.append({'t': ln['t'], 'dur': round(dur, 3), 'text': ln['text'], 'nocap': bool(ln.get('nocap')), 'x': polish(x)})

N = int(TOTAL * SR) + SR
voice = np.zeros(N, dtype=np.float32)
for ln in lines:
    i = int(ln['t'] * SR)
    voice[i:i + len(ln['x'])] += ln['x'][: N - i]
json.dump([{k: v for k, v in ln.items() if k != 'x'} for ln in lines], open('out/vo.json', 'w'), indent=1)

# a touch of room so the voice sits in the mix rather than on top of it
r = np.random.default_rng(11)
ir = r.standard_normal(int(0.45 * SR)) * np.exp(-np.arange(int(0.45 * SR)) / SR / 0.11)
ir[: int(0.006 * SR)] = 0
ir = signal.sosfilt(signal.butter(2, 300, 'high', fs=SR, output='sos'), ir)
ir /= np.sqrt(np.sum(ir ** 2))
voice = voice + 0.07 * signal.fftconvolve(voice, ir)[:N]

music, sfx = np.load('out/bus_music.npy'), np.load('out/bus_sfx.npy')
M = min(music.shape[1], N)
env = signal.sosfilt(signal.butter(1, 4, 'low', fs=SR, output='sos'), np.abs(voice))
env = np.clip(env / 0.12, 0, 1)
duck_m = (1 - 0.62 * env[:M])[None, :]
duck_s = (1 - 0.30 * env[:M])[None, :]
mix = music[:, :M] * 0.92 * duck_m + sfx[:, :M] * 0.85 * duck_s + voice[None, :M] * 1.45
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix = mix[:, : int(TOTAL * SR)]
fo = int(1.6 * SR)
mix[:, -fo:] *= np.linspace(1, 0, fo)
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write('out/audio.wav', SR, (mix.T * 32767).astype(np.int16))
print('wrote out/audio.wav  peak %.2f  rms %.3f  voice rms %.3f' % (np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2)), np.sqrt(np.mean(voice ** 2))))

# ---- exports: voice-only track and subtitles (same word timing and chunking as the on-screen captions)
vo_only = voice[: int(TOTAL * SR)].copy()
vo_only /= np.max(np.abs(vo_only)) / 0.89
wavfile.write('out/voiceover.wav', SR, (vo_only * 32767).astype(np.int16))


def stamp(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


import re
cues_out = []
for ln in lines:
    words = ln['text'].split()
    wt = [len(re.sub(r"[^\w']", '', w)) + 1.5 + (3 if re.search(r'[.?!:;]$', w) else 1.5 if w.endswith(',') else 0) + (2 if w.endswith('...') else 0) for w in words]
    tot, span, acc, ws = sum(wt), ln['dur'] * 0.97, 0.0, []
    for w, k in zip(words, wt):
        a = ln['t'] + acc / tot * span; acc += k; ws.append((w, a, ln['t'] + acc / tot * span))
    chunks, cur = [], []
    for w in ws:
        if cur and sum(len(x[0]) + 1 for x in cur) + len(w[0]) > 42:
            chunks.append(cur); cur = []
        cur.append(w)
        if re.search(r'[.?!:]$', w[0]) and len(cur) >= 3:
            chunks.append(cur); cur = []
    if cur:
        if len(cur) < 2 and chunks: chunks[-1] += cur
        else: chunks.append(cur)
    for i, ch in enumerate(chunks):
        end = chunks[i + 1][0][1] if i + 1 < len(chunks) else ln['t'] + ln['dur'] + 0.25
        cues_out.append((ch[0][1], end, ' '.join(x[0] for x in ch)))
with open('out/captions.srt', 'w') as f:
    for i, (a, b, s) in enumerate(cues_out, 1):
        f.write(f'{i}\n{stamp(a)} --> {stamp(b - 0.04)}\n{s}\n\n')
print('wrote out/voiceover.wav and out/captions.srt (%d cues)' % len(cues_out))
