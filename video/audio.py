"""Synthesises the film's soundtrack and every sound effect from scratch (no samples, no libraries beyond NumPy/SciPy).
Reads out/cues.json (written by dump-cues.mjs from timeline.js) so sound lands exactly on the picture.
Writes out/audio.wav (44.1 kHz stereo)."""
import json
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(7)
data = json.load(open('out/cues.json'))
TOTAL = data['total']
N = int(TOTAL * SR) + SR * 3  # a little tail for reverb
t_all = np.arange(N) / SR


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, a, d, curve=3.0):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-t * curve / max(d, 1e-3))
    return e


def lp(x, fc, order=4):
    return signal.sosfilt(signal.butter(order, min(fc, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=4):
    return signal.sosfilt(signal.butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=3):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos'), x)


def noise(n):
    return rng.standard_normal(n)


def place(buf, x, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= buf.shape[1] or i < 0:
        return
    j = min(buf.shape[1], i + len(x))
    seg = x[: j - i] * gain
    l, r = (1 - max(0, pan)), (1 + min(0, pan))
    buf[0, i:j] += seg * l * 0.9
    buf[1, i:j] += seg * r * 0.9


def saw(f, t, harmonics=7):
    y = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        y += np.sin(2 * np.pi * f * k * t) / k
    return y * 0.6


def bell(f, dur, decay=1.1, partials=(1, 2.01, 2.76, 4.07, 5.4)):
    t = tt(dur)
    y = np.zeros_like(t)
    for k, p in enumerate(partials):
        y += np.sin(2 * np.pi * f * p * t) * np.exp(-t * (2.0 + k * 1.8) / decay) / (1 + k * 0.7)
    return y * 0.5


# ------------------------------------------------------------------ SFX
def sfx(c):
    ty, o = c['type'], c
    f = o.get('f', 800)
    if ty == 'pop':
        t = tt(0.22)
        y = np.sin(2 * np.pi * (f * (1 + 0.5 * np.exp(-t * 40))) * t) * env_ad(len(t), 0.002, 0.14, 4)
        return y * 0.55 + noise(len(t)) * env_ad(len(t), 0.0005, 0.01, 6) * 0.08
    if ty == 'tick':
        t = tt(0.05)
        return (np.sin(2 * np.pi * f * t) * env_ad(len(t), 0.0005, 0.03, 6) * 0.35 + hp(noise(len(t)), 3000) * env_ad(len(t), 0.0002, 0.012, 6) * 0.25)
    if ty == 'ping':
        t = tt(0.9)
        return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2 * t)) * env_ad(len(t), 0.003, 0.55, 4) * 0.28
    if ty == 'slam':
        t = tt(1.1)
        body = np.sin(2 * np.pi * (46 + 90 * np.exp(-t * 14)) * t) * env_ad(len(t), 0.002, 0.55, 5)
        crack = hp(noise(len(t)), 900) * env_ad(len(t), 0.0005, 0.09, 6)
        ring = np.sin(2 * np.pi * 220 * t) * env_ad(len(t), 0.002, 0.6, 5) * 0.12
        return body * 0.95 + crack * 0.4 + ring
    if ty == 'hit':
        t = tt(1.4)
        boom = np.sin(2 * np.pi * (38 + 60 * np.exp(-t * 9)) * t) * env_ad(len(t), 0.003, 0.9, 5)
        sweep = bp(noise(len(t)), 600, 7000) * env_ad(len(t), 0.002, 0.35, 5)
        return boom * 0.85 + sweep * 0.3
    if ty == 'thud':
        t = tt(0.7)
        return np.sin(2 * np.pi * (52 + 70 * np.exp(-t * 20)) * t) * env_ad(len(t), 0.002, 0.35, 5) * 0.9 + lp(noise(len(t)), 500) * env_ad(len(t), 0.001, 0.08, 6) * 0.3
    if ty == 'bwomp':
        t = tt(1.0)
        fr = 170 * np.exp(-t * 2.6) + 30
        y = lp(saw(1, t, 1) * 0 + np.sign(np.sin(2 * np.pi * np.cumsum(fr) / SR)) * 0.6 + np.sin(2 * np.pi * np.cumsum(fr) / SR), 700)
        return y * env_ad(len(t), 0.01, 0.55, 4) * 0.7
    if ty == 'stamp':
        t = tt(0.5)
        return (np.sin(2 * np.pi * (80 + 70 * np.exp(-t * 30)) * t) * env_ad(len(t), 0.001, 0.2, 6) * 0.8 + bp(noise(len(t)), 1500, 5000) * env_ad(len(t), 0.0003, 0.05, 6) * 0.45)
    if ty == 'clang':
        t = tt(1.3)
        y = np.zeros_like(t)
        for k, p in enumerate((1, 2.76, 5.4, 8.93, 13.3)):
            y += np.sin(2 * np.pi * f * p * t) * np.exp(-t * (3.0 + k * 3.5)) / (1 + k * 0.8)
        return y * 0.4 + hp(noise(len(t)), 4000) * env_ad(len(t), 0.0002, 0.02, 6) * 0.2
    if ty == 'chime':
        out = np.zeros(int(2.4 * SR))
        for k, nf in enumerate((659.3, 784.0, 987.8, 1318.5)):
            b = bell(nf, 2.0, 1.4)
            i = int(k * 0.09 * SR)
            out[i:i + len(b)] += b * (0.8 - k * 0.08)
        return out * 0.55
    if ty == 'whoosh':
        dur = o.get('dur', 1.0)
        n = int(dur * SR)
        t = np.arange(n) / SR
        p = t / dur
        up = o.get('dir') in ('up', 'in')
        a = np.sin(np.pi * p) ** (1.2 if up else 0.8)
        z = noise(n)
        out = np.zeros(n)
        chunk = 1024
        zi = None
        for s in range(0, n, chunk):
            pc = p[min(s + chunk // 2, n - 1)]
            fc = 300 + (6000 if up else 5500) * (pc if up else (1 - pc)) ** 1.5
            sos = signal.butter(2, [max(150, fc * 0.5), min(fc * 1.4, SR / 2 - 100)], 'band', fs=SR, output='sos')
            seg, _ = signal.sosfilt(sos, z[s:s + chunk], zi=np.zeros((sos.shape[0], 2)))
            out[s:s + chunk] = seg
        return out * a * 0.55
    if ty == 'riser':
        dur = o.get('dur', 1.5)
        n = int(dur * SR)
        t = np.arange(n) / SR
        p = t / dur
        z = noise(n)
        out = np.zeros(n)
        chunk = 1024
        for s in range(0, n, chunk):
            pc = p[min(s + chunk // 2, n - 1)]
            fc = 250 + 7000 * pc ** 2
            sos = signal.butter(2, [max(150, fc * 0.6), min(fc * 1.5, SR / 2 - 100)], 'band', fs=SR, output='sos')
            out[s:s + chunk] = signal.sosfilt(sos, z[s:s + chunk])
        tone = np.sin(2 * np.pi * np.cumsum(180 + 900 * p ** 2) / SR)
        return (out * 0.5 + tone * 0.18) * (p ** 1.6) * 0.9
    if ty == 'downfall':
        dur = o.get('dur', 1.2)
        n = int(dur * SR)
        t = np.arange(n) / SR
        p = t / dur
        fr = 700 * np.exp(-p * 2.2) + 80
        y = saw(1, t, 1) * 0 + np.sin(2 * np.pi * np.cumsum(fr) / SR) + 0.4 * np.sign(np.sin(2 * np.pi * np.cumsum(fr * 0.5) / SR))
        return lp(y, 1400) * (1 - p) ** 1.3 * 0.42
    if ty == 'tension':
        dur = o.get('dur', 2.0)
        n = int(dur * SR)
        t = np.arange(n) / SR
        p = t / dur
        fr = 170 + 80 * p + 6 * np.sin(2 * np.pi * (5 + 14 * p) * t)
        y = saw(1, t, 1) * 0 + sum(np.sin(2 * np.pi * np.cumsum(fr * k) / SR) / k for k in range(1, 7))
        y = bp(y, 300, 2600) * (0.55 + 0.45 * np.sin(2 * np.pi * (9 + 18 * p) * t))
        return y * np.minimum(1, t / 0.08) * np.minimum(1, (dur - t) / 0.15) * (0.2 + 0.5 * p) * 0.9
    if ty == 'glitch':
        dur = o.get('dur', 0.3)
        n = int(dur * SR)
        out = np.zeros(n)
        for s in range(0, n, int(0.02 * SR)):
            e = min(n, s + int(0.02 * SR))
            fq = rng.choice([220, 440, 880, 1760, 3520])
            seg = np.sign(np.sin(2 * np.pi * fq * np.arange(e - s) / SR)) * 0.3 if rng.random() > 0.4 else noise(e - s) * 0.4
            out[s:e] = seg
        return out * 0.5
    if ty == 'type':
        n_keys, dur = int(o.get('n', 20)), o.get('dur', 1.5)
        out = np.zeros(int((dur + 0.2) * SR))
        for k in range(n_keys):
            tc = (k + rng.uniform(-0.3, 0.3)) / n_keys * dur
            clk = bp(noise(int(0.03 * SR)), 1800 + 1500 * rng.random(), 6500) * env_ad(int(0.03 * SR), 0.0003, 0.012, 6)
            i = max(0, int(tc * SR))
            out[i:i + len(clk)] += clk * (0.3 + 0.25 * rng.random())
        return out
    if ty == 'count':
        n_keys, dur = int(o.get('n', 18)), o.get('dur', 1.5)
        out = np.zeros(int((dur + 0.1) * SR))
        for k in range(n_keys):
            tc = (k / n_keys) ** 0.85 * dur
            tk = tt(0.035)
            y = np.sin(2 * np.pi * (700 + 900 * k / n_keys) * tk) * env_ad(len(tk), 0.0005, 0.02, 6) * 0.3
            i = int(tc * SR)
            out[i:i + len(y)] += y
        return out
    if ty == 'swell':
        dur = o.get('dur', 2.5)
        n = int(dur * SR)
        t = np.arange(n) / SR
        p = t / dur
        chord = sum(np.sin(2 * np.pi * fq * t) for fq in (110, 164.8, 220, 329.6))
        y = (lp(noise(n), 1400) * 0.5 + chord * 0.35) * np.sin(np.pi * np.clip(p, 0, 1)) ** 1.5
        return y * 0.5
    if ty == 'scribe':
        dur = o.get('dur', 1.5)
        n = int(dur * SR)
        t = np.arange(n) / SR
        y = bp(noise(n), 1800, 6500) * (0.5 + 0.5 * np.sin(2 * np.pi * 38 * t)) ** 2
        return y * np.sin(np.pi * np.clip(t / dur, 0, 1)) * 0.28
    return np.zeros(10)


def reverb_ir(length=1.8, decay=0.45, seed=1):
    r = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / decay)
    ir = hp(ir, 300, 2)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt(np.sum(ir ** 2))


# ------------------------------------------------------------------ music
BEAT = 0.6  # 100 bpm
CH = {  # chord tones (Hz): root(bass), then three upper voices
    'Am': (55.0, 220.0, 261.63, 329.63), 'F': (43.65, 174.61, 220.0, 261.63),
    'C': (65.41, 261.63, 329.63, 392.0), 'G': (49.0, 196.0, 246.94, 293.66),
}
PROG = ['Am', 'F', 'C', 'G']


def section_curve(key, default=0.0):
    c = np.full(N, default)
    for s in data['music']:
        i0, i1 = int(s['t0'] * SR), min(N, int(s['t1'] * SR))
        c[i0:i1] = s.get(key, default)
    return signal.sosfilt(signal.butter(1, 1.2, 'low', fs=SR, output='sos'), c)  # smooth the steps


gain_c, arp_c, drums_c = section_curve('gain'), section_curve('arp'), section_curve('drums')
dark_c = section_curve('dark')
resolve_c = section_curve('resolve')

music = np.zeros((2, N))
bar = 4 * BEAT
n_bars = int(TOTAL / bar) + 2
for b in range(n_bars):
    t0 = b * bar
    i0 = int(t0 * SR)
    if i0 >= N:
        break
    name = PROG[b % 4]
    root, v1, v2, v3 = CH[name]
    L = int((bar + 1.4) * SR)
    t = np.arange(L) / SR
    e = np.minimum(1, t / 0.9) * np.minimum(1, np.maximum(0, (bar + 1.2 - t)) / 1.2)
    pad = np.zeros(L)
    for fq in (v1, v2, v3):
        for dt in (-0.004, 0.004):
            pad += saw(fq * (1 + dt), t, 6)
    pad = lp(pad, 1500) * e * 0.05
    # dissonant version for the "problem" scenes
    dis = (np.sin(2 * np.pi * 110 * t) + np.sin(2 * np.pi * 116.54 * t) + 0.6 * np.sin(2 * np.pi * 164.8 * t) + 0.5 * np.sin(2 * np.pi * 155.56 * t)) * e * 0.05
    j = min(N, i0 + L)
    d_mix = dark_c[i0:j]
    seg = pad[: j - i0] * (1 - d_mix) + dis[: j - i0] * d_mix
    music[0, i0:j] += seg
    music[1, i0:j] += seg
    # bass: root on beats 1 and 3
    for k in (0, 2):
        tb = tt(1.0)
        bs = np.sin(2 * np.pi * root * tb) * env_ad(len(tb), 0.01, 0.9, 3) * 0.2
        i = int((t0 + k * BEAT) * SR)
        jj = min(N, i + len(bs))
        music[:, i:jj] += bs[: jj - i] * (0.6 + 0.4 * gain_c[i])
    # arpeggio: 8ths
    for k in range(8):
        fq = (v1, v2, v3, v2 * 2, v3 * 2, v2 * 2, v3, v2)[k]
        ta = tt(0.5)
        pl = (np.sin(2 * np.pi * fq * ta) + 0.35 * np.sin(2 * np.pi * fq * 2 * ta)) * env_ad(len(ta), 0.003, 0.28, 5) * 0.09
        i = int((t0 + k * BEAT / 2) * SR)
        if i >= N:
            continue
        jj = min(N, i + len(pl))
        a = arp_c[i] * (1 - dark_c[i])
        music[0, i:jj] += pl[: jj - i] * a * (1 + 0.15 * np.sin(k))
        music[1, i:jj] += pl[: jj - i] * a * (1 - 0.15 * np.sin(k))
    # drums
    for k in range(4):
        i = int((t0 + k * BEAT) * SR)
        if i >= N:
            continue
        dl = drums_c[i]
        if dl < 0.2:
            continue
        if k in (0, 2) or dl > 1.5:
            kk = tt(0.3)
            kick = np.sin(2 * np.pi * (48 + 80 * np.exp(-kk * 35)) * kk) * env_ad(len(kk), 0.001, 0.2, 5) * (0.5 if dl < 1.5 else 0.62)
            jj = min(N, i + len(kick))
            music[:, i:jj] += kick[: jj - i]
        if dl > 1.5 and k in (1, 3):
            sn = bp(noise(int(0.2 * SR)), 1200, 6000) * env_ad(int(0.2 * SR), 0.001, 0.09, 5) * 0.22
            jj = min(N, i + len(sn))
            music[:, i:jj] += sn[: jj - i]
        for off in (0.5,):
            hh = hp(noise(int(0.05 * SR)), 7000) * env_ad(int(0.05 * SR), 0.0005, 0.02, 6) * (0.05 if dl < 1.5 else 0.08)
            ih = int((t0 + (k + off) * BEAT) * SR)
            jj = min(N, ih + len(hh))
            if ih < N:
                music[:, ih:jj] += hh[: jj - ih]

music *= (0.35 + 0.65 * gain_c)[None, :]
# the final resolve: hold a C major chord, bright and open
rs = int(148.0 * SR)
tr = np.arange(N - rs) / SR
ch = sum(np.sin(2 * np.pi * fq * tr) / (1 + 0.3 * i) for i, fq in enumerate((65.41, 130.8, 196.0, 261.6, 329.6, 392.0, 523.3)))
fade_in = np.minimum(1, tr / 1.5) * np.exp(-np.maximum(0, tr - 6.5) / 2.0)
music[0, rs:] += ch * fade_in * 0.06 * resolve_c[rs:]
music[1, rs:] += ch * fade_in * 0.06 * resolve_c[rs:]

# ------------------------------------------------------------------ mix
sfx_bus = np.zeros((2, N))
for c in data['cues']:
    y = sfx(c)
    pan = (hash((c['type'], int(c['t'] * 100))) % 100 - 50) / 220.0
    place(sfx_bus, y, c['t'], 1.0, pan)

ir_l, ir_r = reverb_ir(seed=3), reverb_ir(seed=4)


def verb(bus, wet):
    out = np.zeros_like(bus)
    out[0] = signal.fftconvolve(bus[0], ir_l)[:N]
    out[1] = signal.fftconvolve(bus[1], ir_r)[:N]
    return bus + out * wet


sfx_bus = verb(sfx_bus, 0.22)
music = verb(music, 0.2)
np.save('out/bus_music.npy', music.astype(np.float32)); np.save('out/bus_sfx.npy', sfx_bus.astype(np.float32))
mix = music * 0.9 + sfx_bus * 1.0
# gentle bus compression: duck the music slightly under loud effects
env = np.abs(signal.sosfilt(signal.butter(2, 8, 'low', fs=SR, output='sos'), np.abs(sfx_bus).max(axis=0)))
duck = 1 - np.clip(env * 1.4, 0, 0.35)
mix = music * duck[None, :] * 0.9 + sfx_bus
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix = mix[:, : int(TOTAL * SR)]
# fades
fi, fo = int(0.04 * SR), int(1.6 * SR)
mix[:, :fi] *= np.linspace(0, 1, fi)
mix[:, -fo:] *= np.linspace(1, 0, fo)
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write('out/audio.wav', SR, (mix.T * 32767).astype(np.int16))
print('wrote out/audio.wav  %.1fs  peak %.2f  rms %.3f' % (mix.shape[1] / SR, np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2))))
