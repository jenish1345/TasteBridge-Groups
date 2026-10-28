// One clock for picture and sound. Everything below is in seconds on the final film's timeline.
export const FPS = 30, W = 1920, H = 1080;

// scene → [start, end]
export const S = {
  cold: [0, 9], problem: [9, 22], title: [22, 31], how: [31, 61], bridge: [61, 85],
  qloo: [85, 101], stand: [101, 121], addons: [121, 135], proof: [135, 148], close: [148, 157],
};
export const TOTAL = 157;

// transitions at scene boundaries (centered on `at`)
export const TRANS = [
  { at: 9, type: 'glitch', d: 0.7 }, { at: 22, type: 'iris', d: 0.8 }, { at: 31, type: 'slats', d: 0.8 },
  { at: 61, type: 'wipe', d: 0.7 }, { at: 85, type: 'glitch', d: 0.7 }, { at: 101, type: 'iris', d: 0.8 },
  { at: 121, type: 'slats', d: 0.8 }, { at: 135, type: 'wipe', d: 0.7 }, { at: 148, type: 'iris', d: 1.0 },
];

// real footage: video time → footage time. Filled from footage/marks.json (see setMarks) so it survives re-recording.
export const FOOT = { how: [], bridge: [], qloo: [] };
export function setMarks(m) {
  const t = (k) => m[k].t;
  FOOT.how = [
    { v: [31, 37], f: [t('table') - 0.3, t('table') + 5.7] },
    { v: [37, 40], f: [t('hoverDan') - 0.3, t('beforePlan') + 0.1] },
    { v: [40, 46.5], f: [t('plan'), t('plan') + 6.5] },
    { v: [46.5, 50.5], f: [t('bridged') - 3.6, t('bridged') + 0.2] },
    { v: [50.5, 61], f: [t('verdict') - 1.2, t('verdict') + 9.3] },
  ];
  FOOT.bridge = [
    { v: [61, 67], f: [t('bridge') - 0.5, t('bridge') + 8.5] },
    { v: [67, 71], f: [t('dossier'), t('dossier') + 4.4] },
    { v: [71, 75], f: [t('serves') - 0.3, t('serves') + 3.7] },
    { v: [75, 81], f: [t('costs') - 3.4, t('costs') + 2.6] },
    { v: [81, 85], f: [t('rebalanced') - 5.0, t('rebalanced') - 1.0] },
  ];
  FOOT.qloo = [{ v: [95, 101], f: [t('compare') + 0.2, t('compare') + 6.2] }];
}

export function footageTime(scene, T) {
  for (const seg of FOOT[scene] ?? []) {
    if (T >= seg.v[0] && T < seg.v[1]) { const p = (T - seg.v[0]) / (seg.v[1] - seg.v[0]); return seg.f[0] + (seg.f[1] - seg.f[0]) * p; }
  }
  const segs = FOOT[scene]; if (!segs) return 0;
  return T < segs[0].v[0] ? segs[0].f[0] : segs[segs.length - 1].f[1];
}

// ------------------------------------------------------------------ sound cues (audio.py reads these)
// type: whoosh(dir,dur) pop(f) tick(f) slam thud ping(f) tension(dur) clang(f) chime riser(dur) downfall(dur)
//       bwomp stamp glitch(dur) type(n,dur) count(n,dur) swell(dur) scribe(dur) hit
export const cues = [];
const cue = (t, type, o = {}) => cues.push({ t: +t.toFixed(3), type, ...o });

// S1 cold open
cue(0.2, 'swell', { dur: 3 }); cue(0.8, 'scribe', { dur: 1.5 });
[0, 1, 2, 3, 4].forEach((i) => cue(1.6 + 0.35 * i, 'pop', { f: 330 * Math.pow(2, [0, 2, 4, 7, 9][i] / 12) }));
cue(3.6, 'slam'); cue(5.0, 'slam');
[0, 1, 2, 3, 4].forEach((i) => { cue(5.6 + 0.35 * i, 'tick', { f: 1400 }); cue(5.78 + 0.35 * i, 'tick', { f: 1900 }); });
cue(7.4, 'riser', { dur: 1.6 });
// S2 the problem  (named beats so the picture and the sound share them)
export const E2 = { conv: 9.6, merge: 11.4, typeA: 12.0, loses: 13.6, burst: 14.9, typeB: 15.8, grow: 16.2, loudLoses: 18.6, better: 20.2 };
cue(9.0, 'glitch', { dur: 0.3 }); cue(E2.conv, 'whoosh', { dir: 'in', dur: 1.8 }); cue(E2.merge, 'thud');
cue(E2.typeA, 'type', { n: 26, dur: 1.6 }); cue(E2.loses - 0.1, 'downfall', { dur: 1.4 }); cue(E2.loses, 'slam');
cue(E2.burst, 'whoosh', { dir: 'out', dur: 0.7 }); [0, 1, 2, 3, 4].forEach((i) => cue(E2.burst + 0.05 * i, 'pop', { f: 260 + 40 * i }));
cue(E2.typeB, 'type', { n: 28, dur: 1.8 }); cue(E2.grow, 'bwomp'); cue(E2.loudLoses - 0.1, 'downfall', { dur: 1.2 }); cue(E2.loudLoses, 'slam');
cue(E2.better - 1.0, 'riser', { dur: 1.0 }); cue(E2.better, 'slam');
// S3 title
cue(22.0, 'hit'); cue(22.4, 'tension', { dur: 2.2 });
for (let i = 0; i < 9; i++) cue(24.6 + i * 0.2, 'clang', { f: 520 + 55 * i });
cue(26.5, 'chime'); cue(26.6, 'slam'); cue(27.2, 'whoosh', { dir: 'up', dur: 1.0 }); cue(28.0, 'tick', { f: 900 }); cue(29.0, 'ping', { f: 1320 }); cue(30.0, 'riser', { dur: 0.9 });
// S4 how it works (real footage)
cue(31.2, 'tick', { f: 1000 }); cue(34.2, 'tick', { f: 1200 }); cue(37.0, 'tick', { f: 1000 }); cue(39.9, 'stamp');
for (let i = 0; i < 18; i++) cue(40.4 + i * 0.33 + (i % 3) * 0.04, 'ping', { f: 880 + (i % 5) * 110 });
cue(42.2, 'whoosh', { dir: 'in', dur: 0.8 });
cue(45.0, 'tension', { dur: 1.6 }); cue(46.8, 'clang', { f: 600 }); cue(47.1, 'clang', { f: 700 }); cue(47.4, 'clang', { f: 820 }); cue(47.9, 'chime');
cue(52.0, 'stamp'); cue(53.0, 'count', { n: 18, dur: 1.5 }); cue(57.0, 'tick', { f: 900 });
// S5 the bridge
cue(61.0, 'whoosh', { dir: 'up', dur: 0.8 }); for (let i = 0; i < 6; i++) cue(61.8 + i * 0.5, 'clang', { f: 400 + 70 * i });
cue(66.8, 'tick', { f: 1100 }); cue(67.3, 'ping', { f: 1100 }); cue(71.0, 'tick', { f: 1000 }); cue(75.0, 'stamp'); cue(77.2, 'tick', { f: 700 }); cue(79.0, 'downfall', { dur: 0.6 });
cue(81.2, 'whoosh', { dir: 'up', dur: 0.6 }); cue(82.4, 'clang', { f: 500 }); cue(82.8, 'chime');
// S6 how Qloo powers it
cue(85.0, 'hit'); cue(85.5, 'slam');
[0, 1, 2, 3].forEach((i) => { cue(86.6 + i * 1.7, 'tick', { f: 800 + 150 * i }); cue(87.1 + i * 1.7, 'ping', { f: 700 + 160 * i }); cue(87.9 + i * 1.7, 'pop', { f: 500 + 120 * i }); });
cue(93.0, 'type', { n: 40, dur: 1.9 }); cue(94.8, 'stamp'); cue(95.0, 'whoosh', { dir: 'in', dur: 0.5 });
cue(96.0, 'swell', { dur: 1.5 }); cue(98.4, 'tick', { f: 900 }); cue(99.9, 'whoosh', { dir: 'out', dur: 0.5 });
// S7 what makes it different
cue(101.0, 'hit'); cue(101.4, 'slam');
cue(103.0, 'slam'); cue(103.4, 'tension', { dur: 1.8 }); for (let i = 0; i < 5; i++) cue(105.2 + i * 0.15, 'clang', { f: 560 + 70 * i });
cue(108.2, 'slam'); [0, 1, 2, 3, 4].forEach((i) => cue(109.2 + i * 0.35, 'pop', { f: 330 * Math.pow(2, [0, 2, 4, 7, 9][i] / 12) })); cue(111.4, 'ping', { f: 740 });
cue(113.4, 'slam'); cue(114.6, 'stamp'); cue(116.0, 'stamp');
cue(118.0, 'riser', { dur: 0.9 }); cue(118.9, 'slam'); cue(119.0, 'chime');
// S8 add-ons
cue(121.0, 'hit'); cue(121.5, 'slam');
for (let i = 0; i < 9; i++) { cue(122.8 + i * 0.85, 'pop', { f: 392 * Math.pow(2, [0, 2, 3, 5, 7, 8, 10, 12, 14][i] / 12) }); cue(122.95 + i * 0.85, 'tick', { f: 1600 }); }
cue(131.2, 'riser', { dur: 1.6 }); cue(133.2, 'ping', { f: 1180 });
// S9 proof
cue(135.0, 'hit'); cue(135.5, 'slam'); cue(136.5, 'count', { n: 30, dur: 1.6 }); cue(138.2, 'stamp'); cue(139.4, 'count', { n: 14, dur: 1.2 }); cue(141.0, 'ping', { f: 1046 }); cue(141.3, 'ping', { f: 1318 });
cue(142.6, 'swell', { dur: 2.6 }); cue(143.4, 'type', { n: 60, dur: 3.5 });
// S10 close
cue(148.0, 'whoosh', { dir: 'up', dur: 1.0 }); cue(149.0, 'slam'); cue(149.1, 'chime'); cue(151.2, 'type', { n: 34, dur: 1.8 }); cue(153.4, 'tick', { f: 1000 }); cue(154.6, 'chime');
cues.sort((a, b) => a.t - b.t);

// impact moments that shake the frame (picture reads these too)
export const HITS = cues.filter((c) => ['slam', 'thud', 'stamp', 'hit', 'bwomp'].includes(c.type)).map((c) => c.t);

// music sections: intensity 0..1 and whether drums / arpeggio are on
export const MUSIC = [
  { t0: 0, t1: 9, gain: 0.55, arp: 0.0, drums: 0 }, { t0: 3.4, t1: 9, gain: 0.6, arp: 0.5, drums: 0 },
  { t0: 9, t1: 14.2, gain: 0.5, arp: 0, drums: 0, dark: 1 }, { t0: 14.2, t1: 15.6, gain: 0.05, arp: 0, drums: 0 },
  { t0: 15.6, t1: 22, gain: 0.5, arp: 0, drums: 0, dark: 1 },
  { t0: 22, t1: 26.5, gain: 0.6, arp: 0.6, drums: 0 }, { t0: 26.5, t1: 31, gain: 0.9, arp: 0.8, drums: 1 },
  { t0: 31, t1: 61, gain: 0.85, arp: 0.7, drums: 1 }, { t0: 61, t1: 85, gain: 0.85, arp: 0.7, drums: 1 },
  { t0: 85, t1: 101, gain: 0.6, arp: 0.7, drums: 0 }, { t0: 101, t1: 121, gain: 1.0, arp: 0.9, drums: 2 },
  { t0: 121, t1: 135, gain: 0.9, arp: 0.9, drums: 2 }, { t0: 135, t1: 142.4, gain: 0.55, arp: 0.5, drums: 0 },
  { t0: 142.4, t1: 148, gain: 0.35, arp: 0.0, drums: 0 }, { t0: 148, t1: 157, gain: 0.7, arp: 0.6, drums: 0, resolve: 1 },
];

// ------------------------------------------------------------------ narration
// t = when the line starts (s). `say` = what the voice reads when it differs from the caption. `nocap` = the screen already shows these exact words.
export const VO = [
  { t: 0.9, text: 'Picture this.', nocap: true },
  { t: 3.5, text: 'Five friends. One Saturday night.', nocap: true },
  { t: 6.1, text: 'Five wildly different tastes.', nocap: true },
  { t: 9.6, text: 'Plans like this usually go one of two ways.', nocap: true },
  { t: 12.5, text: "Average everyone's taste... and everyone loses.", nocap: true },
  { t: 15.6, text: 'Or let the loudest voice win... and someone always loses.', nocap: true },
  { t: 20.2, text: "There's a better way.", nocap: true },
  { t: 22.2, text: 'Maya wants it loud. Dan wants it quiet.' },
  { t: 26.5, text: 'This is TasteBridge Groups.', say: 'This is Taste Bridge Groups.', nocap: true },
  { t: 28.1, text: 'The taste diplomat for real-life plans.' },
  { t: 30.5, text: "Built on Qloo's Taste AI.", say: "Built on Kloo's Taste A I." },
  { t: 32.8, text: 'Seat your friends, and add what each person loves.' },
  { t: 37.2, text: 'Name a guest of honor. Their dislikes become vetoes.' },
  { t: 40.6, text: 'Now the agent asks Qloo. Every taste becomes a real entity, live.', say: 'Now the agent asks Kloo. Every taste becomes a real entity, live.' },
  { t: 44.4, text: 'Conflicts show up as cables under tension.' },
  { t: 47.3, text: 'Then the agent bridges them with a plan.' },
  { t: 50.8, text: "Eighty-six percent fair, and everyone has a stop that's theirs." },
  { t: 55.4, text: 'It even shows exactly where your tastes pull apart.' },
  { t: 61.5, text: 'The whole night is drawn as a bridge. One pier per stop.' },
  { t: 67.3, text: 'Every stop explains itself: why it fits, who it serves, and what it costs.' },
  { t: 72.4, text: 'Plus the Qloo evidence behind every score.', say: 'Plus the Kloo evidence behind every score.' },
  { t: 75.6, text: "It shows its work: closed venues are ruled out, using Qloo's own hours.", say: "It shows its work: closed venues are ruled out, using Kloo's own hours." },
  { t: 81.2, text: "Don't like a stop? Rebalance in one click. Everyone keeps their win." },
  { t: 86.6, text: 'Search finds the real entity.' },
  { t: 88.6, text: 'Tags describe foods and vibes.' },
  { t: 90.4, text: 'Insights find what each person loves, and explain why.' },
  { t: 93.9, text: 'Take Qloo away, and nothing is left to plan with.', say: 'Take Kloo away, and nothing is left to plan with.' },
  { t: 97.4, text: 'Same group, planned two ways: real reasons, or a guess.' },
  { t: 101.5, text: "Here's what makes it different." },
  { t: 103.4, text: 'Number one. Conflicts are bridged, not averaged, across five taste axes.' },
  { t: 108.3, text: "Number two. Everyone gets a stop that's theirs, or an honest closest fit." },
  { t: 113.5, text: 'Number three. It shows its work. Closed venues are ruled out, with the reason.' },
  { t: 119.0, text: 'Not a recommendation. A negotiation you can audit.', nocap: true },
  { t: 122.8, text: 'A live agent trace. Opening-hours awareness. One-click rebalance.' },
  { t: 127.1, text: 'With-versus-without Qloo. Two-person mode. A CLI and an MCP server.', say: 'With versus without Kloo. Two person mode. A C L I and an M C P server.' },
  { t: 131.4, text: 'Keys stay on the server. A sample-data fallback. Seventy-two tests.' },
  { t: 135.8, text: 'Measured, not claimed.' },
  { t: 137.5, text: 'Sixty random groups. Zero broken rules.' },
  { t: 140.1, text: 'Everyone covered, by a win or a closest fit.' },
  { t: 143.3, text: 'And an honest limit: average fit is level with a plain ranker.' },
  { t: 148.0, text: 'The gain is rules kept, and nobody left behind.' },
  { t: 151.4, text: 'TasteBridge Groups. Try it live, or read the code.', say: 'Taste Bridge Groups. Try it live, or read the code.' },
  { t: 155.2, text: 'Nobody loses.', nocap: true },
];
