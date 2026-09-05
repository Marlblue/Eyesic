/**
 * Derives every app icon from `public/logo.jpg`.
 *
 *   node scripts/generate-icons.mjs
 *
 * The source logo is landscape with the mark floating in a large black field,
 * so a naive square crop would leave the mark tiny and off-centre. Instead the
 * mark's bounding box is measured from the pixels, then a square canvas is
 * built around its centre with the padding each icon type needs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "public", "logo.jpg");

/** Anything above this is treated as part of the white mark, not the backdrop. */
const LUMA_THRESHOLD = 40;
const BACKGROUND = { r: 0, g: 0, b: 0, alpha: 1 };

/** Scan the greyscale pixels and return the box containing the mark. */
async function findMarkBounds() {
  const image = sharp(SOURCE);
  const { width, height } = await image.metadata();
  const pixels = await image.clone().greyscale().raw().toBuffer();

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] <= LUMA_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0) throw new Error("Tidak menemukan mark terang di public/logo.jpg");

  return { width, height, left, top, right, bottom };
}

/**
 * Render one square icon.
 *
 * @param bounds  measured mark box
 * @param size    output edge length in pixels
 * @param cover   fraction of the icon the mark should span (smaller = more padding)
 */
async function render(bounds, size, cover) {
  const markWidth = bounds.right - bounds.left + 1;
  const markHeight = bounds.bottom - bounds.top + 1;

  // The square must fit the mark's longer side at the requested coverage.
  const side = Math.round(Math.max(markWidth, markHeight) / cover);
  const centreX = (bounds.left + bounds.right) / 2;
  const centreY = (bounds.top + bounds.bottom) / 2;

  // Pad the source first so a crop reaching past an edge still lands on black
  // rather than being clamped back inside, which would shift the mark.
  const margin = side;
  const padded = await sharp(SOURCE)
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: BACKGROUND })
    .toBuffer();

  return sharp(padded)
    .extract({
      left: Math.round(centreX - side / 2) + margin,
      top: Math.round(centreY - side / 2) + margin,
      width: side,
      height: side,
    })
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const bounds = await findMarkBounds();
console.log(
  `mark ditemukan: ${bounds.right - bounds.left + 1} x ${bounds.bottom - bounds.top + 1} ` +
    `pada kanvas ${bounds.width} x ${bounds.height}`,
);

const OUTPUTS = [
  // `any` icons are shown as-is, so the mark can sit fairly large.
  { file: "public/icon-192.png", size: 192, cover: 0.74 },
  { file: "public/icon-512.png", size: 512, cover: 0.74 },
  // In `app/`, not `public/`: Next only emits the <link rel="apple-touch-icon">
  // tag for the file convention, and iOS never probes for "/apple-icon.png".
  { file: "app/apple-icon.png", size: 180, cover: 0.74 },
  // Maskable icons get cropped to a circle by the OS: keep inside the safe zone.
  { file: "public/icon-maskable-512.png", size: 512, cover: 0.5 },
  // Browser tab favicon, via the Next.js `app/icon.png` convention.
  { file: "app/icon.png", size: 256, cover: 0.8 },
];

for (const { file, size, cover } of OUTPUTS) {
  const target = join(ROOT, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, await render(bounds, size, cover));
  console.log(`wrote ${file} (${size}px, mark ${Math.round(cover * 100)}%)`);
}
