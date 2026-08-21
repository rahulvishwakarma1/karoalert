const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

function resizeBilinear(src, srcW, srcH, dstW, dstH) {
  const out = new PNG({ width: dstW, height: dstH });
  const { data } = out;
  for (let y = 0; y < dstH; y++) {
    const sy = ((y + 0.5) * srcH) / dstH - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = Math.max(0, Math.min(1, sy - y0));
    for (let x = 0; x < dstW; x++) {
      const sx = ((x + 0.5) * srcW) / dstW - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = Math.max(0, Math.min(1, sx - x0));
      const oi = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = src.data[(y0 * srcW + x0) * 4 + c];
        const v10 = src.data[(y0 * srcW + x1) * 4 + c];
        const v01 = src.data[(y1 * srcW + x0) * 4 + c];
        const v11 = src.data[(y1 * srcW + x1) * 4 + c];
        const top = v00 * (1 - fx) + v10 * fx;
        const bottom = v01 * (1 - fx) + v11 * fx;
        data[oi + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return out;
}

const RES_DIR = 'android/app/src/main/res';

const legacyDensities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const adaptiveDensities = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const legacySource = PNG.sync.read(fs.readFileSync('assets/icon.png'));
const adaptiveSource = PNG.sync.read(fs.readFileSync('assets/adaptive-icon.png'));

for (const [density, size] of Object.entries(legacyDensities)) {
  const dir = path.join(RES_DIR, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  const resized = resizeBilinear(legacySource, legacySource.width, legacySource.height, size, size);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), PNG.sync.write(resized));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), PNG.sync.write(resized));
  for (const f of ['ic_launcher.webp', 'ic_launcher_round.webp']) {
    const webp = path.join(dir, f);
    if (fs.existsSync(webp)) fs.unlinkSync(webp);
  }
  console.log(`mipmap-${density}: ic_launcher.png ${size}x${size} (legacy)`);
}

for (const [density, size] of Object.entries(adaptiveDensities)) {
  const dir = path.join(RES_DIR, `mipmap-${density}`);
  const resized = resizeBilinear(adaptiveSource, adaptiveSource.width, adaptiveSource.height, size, size);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), PNG.sync.write(resized));
  const webp = path.join(dir, 'ic_launcher_foreground.webp');
  if (fs.existsSync(webp)) fs.unlinkSync(webp);
  console.log(`mipmap-${density}: ic_launcher_foreground.png ${size}x${size} (adaptive)`);
}

console.log('Launcher icons regenerated.');
