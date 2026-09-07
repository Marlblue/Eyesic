/**
 * Generate a minimal silent MP3 file.
 * 
 * MPEG1 Layer III, 32kbps, 44100Hz, Mono, no CRC
 * Frame size = 144 * 32000 / 44100 = 104 bytes
 * ~40 frames = ~1.05 seconds of silence
 */

const fs = require('fs');
const path = require('path');

const HEADER = Buffer.from([0xFF, 0xFB, 0x20, 0xC0]);
const FRAME_SIZE = 104;
const FRAMES = 40;

const frame = Buffer.alloc(FRAME_SIZE, 0);
HEADER.copy(frame, 0);

const frames = [];
for (let i = 0; i < FRAMES; i++) {
  frames.push(Buffer.from(frame));
}

const mp3 = Buffer.concat(frames);
const outPath = path.join(__dirname, '..', 'public', 'silence.mp3');
fs.writeFileSync(outPath, mp3);
console.log(`Written ${mp3.length} bytes to ${outPath}`);
