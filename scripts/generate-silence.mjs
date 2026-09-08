/**
 * Writes the silent clip the player loops to hold background audio focus.
 *
 *   node scripts/generate-silence.mjs
 *
 * WAV rather than MP3 on purpose. A hand-assembled MP3 frame stream looks
 * plausible but does not survive a real demuxer — the previous silence.mp3 in
 * this repo failed to open in Chrome, so `play()` rejected every time and the
 * keep-alive silently did nothing. A RIFF/PCM header is small enough to write
 * exactly right, and every browser decodes it.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 8000;
const CHANNELS = 1;
const BITS = 16;
/** One second: long enough that the loop seam costs nothing. */
const SECONDS = 1;

const bytesPerSample = (BITS / 8) * CHANNELS;
const dataSize = SAMPLE_RATE * SECONDS * bytesPerSample;
const buffer = new ArrayBuffer(44 + dataSize);
const view = new DataView(buffer);

const ascii = (offset, text) => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
};

ascii(0, "RIFF");
view.setUint32(4, 36 + dataSize, true); // Everything after this field.
ascii(8, "WAVE");
ascii(12, "fmt ");
view.setUint32(16, 16, true); // PCM header length.
view.setUint16(20, 1, true); // Format 1 = uncompressed PCM.
view.setUint16(22, CHANNELS, true);
view.setUint32(24, SAMPLE_RATE, true);
view.setUint32(28, SAMPLE_RATE * bytesPerSample, true); // Byte rate.
view.setUint16(32, bytesPerSample, true); // Block align.
view.setUint16(34, BITS, true);
ascii(36, "data");
view.setUint32(40, dataSize, true);
// The samples themselves stay zeroed — that is the silence.

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "silence.wav");
writeFileSync(out, new Uint8Array(buffer));
console.log(`Wrote ${44 + dataSize} bytes to ${out}`);
