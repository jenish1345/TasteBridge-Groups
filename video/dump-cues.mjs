// Writes out/cues.json for the audio synthesiser from the shared timeline.
import { writeFileSync, mkdirSync } from 'node:fs';
import { cues, MUSIC, TOTAL, VO } from './timeline.js';
mkdirSync('out', { recursive: true });
writeFileSync('out/cues.json', JSON.stringify({ total: TOTAL, cues, music: MUSIC, vo: VO }, null, 1));
console.log(`cues: ${cues.length}, music sections: ${MUSIC.length}, total ${TOTAL}s`);
