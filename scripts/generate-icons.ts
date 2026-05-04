// Resize a single 1024×1024 source image into the PWA icon set (and the
// favicon). Re-runnable any time the operator updates assets/icon-source.png.
//
// Run: `npm run icons`
//
// Output:
//   public/icons/icon-192.png            — Android home-screen
//   public/icons/icon-512.png            — Android splash, web manifest
//   public/icons/icon-maskable-512.png   — Android adaptive icon (safe zone)
//   public/icons/apple-touch-icon-180.png — iOS home-screen
//   public/favicon.png                   — browser tab favicon
import { mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const SRC = 'assets/icon-source.png';
const OUT_DIR = 'public/icons';

// Brand violet — matches manifest theme_color. Used as the maskable
// background fill so the safe-zone padding is on-brand instead of white.
const BRAND_BG = { r: 124, g: 58, b: 237, alpha: 1 };

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon-180.png', size: 180 },
  ];

  for (const { name, size } of sizes) {
    await sharp(SRC).resize(size, size).png().toFile(join(OUT_DIR, name));
    console.log(`✓ ${name}`);
  }

  // Maskable variant — Android may crop to a circle/squircle/etc. The
  // "safe zone" is the inner 80%, so we resize to 80% of 512 then pad
  // the remaining 10% on each side with brand color.
  await sharp(SRC)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: BRAND_BG })
    .png()
    .toFile(join(OUT_DIR, 'icon-maskable-512.png'));
  console.log('✓ icon-maskable-512.png');

  await sharp(SRC).resize(32, 32).png().toFile('public/favicon.png');
  console.log('✓ favicon.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
