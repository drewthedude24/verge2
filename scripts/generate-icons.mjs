import sharp from "sharp";
import { mkdirSync } from "fs";

mkdirSync("public/icons", { recursive: true });

// SVG icon: dark background + indigo "V"
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f14"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bg)"/>
  <text
    x="${size / 2}"
    y="${size * 0.76}"
    font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    font-size="${size * 0.62}"
    font-weight="800"
    fill="url(#accent)"
    text-anchor="middle"
    letter-spacing="-2"
  >V</text>
</svg>`;

const sizes = [192, 512];

for (const size of sizes) {
  await sharp(Buffer.from(svg(size)))
    .png()
    .toFile(`public/icons/icon-${size}.png`);
  console.log(`✓ icon-${size}.png`);
}

// Apple touch icon (180x180)
await sharp(Buffer.from(svg(180)))
  .png()
  .toFile("public/icons/apple-touch-icon.png");
console.log("✓ apple-touch-icon.png");

// Favicon (32x32)
await sharp(Buffer.from(svg(32)))
  .png()
  .toFile("public/icons/favicon-32.png");
console.log("✓ favicon-32.png");

console.log("\nAll icons generated.");
