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

function placeCentered(src, dstSize, scale) {
  const out = new PNG({ width: dstSize, height: dstSize });
  const inner = Math.round(dstSize * scale);
  const resized = resizeBilinear(src, src.width, src.height, inner, inner);
  const offset = Math.round((dstSize - inner) / 2);
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const s = (y * inner + x) * 4;
      const d = ((y + offset) * dstSize + (x + offset)) * 4;
      const sa = resized.data[s + 3];
      const da = out.data[d + 3];
      const outA = da + sa * (1 - da / 255);
      if (outA > 0) {
        for (let c = 0; c < 3; c++) {
          out.data[d + c] = Math.round(
            (resized.data[s + c] * sa + out.data[d + c] * da * (1 - sa / 255)) / outA,
          );
        }
        out.data[d + 3] = Math.round(outA);
      }
    }
  }
  return out;
}

const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
const adaptivePath = path.join(__dirname, '..', 'assets', 'adaptive-icon.png');
const splashPath = path.join(__dirname, '..', 'assets', 'splash-icon.png');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

console.log('Reading main icon:', iconPath);
const icon = PNG.sync.read(fs.readFileSync(iconPath));

// 1. Generate adaptive-icon.png and splash-icon.png from assets/icon.png
const adaptiveFixed = placeCentered(icon, 1024, 0.6);
fs.writeFileSync(adaptivePath, PNG.sync.write(adaptiveFixed));
console.log('Updated assets/adaptive-icon.png from assets/icon.png');

const splashFixed = placeCentered(icon, 1024, 0.45);
fs.writeFileSync(splashPath, PNG.sync.write(splashFixed));
console.log('Updated assets/splash-icon.png from assets/icon.png');

// 2. Generate native Android drawable-*/splashscreen_logo.png
const splashDensities = {
  mdpi: 200,
  hdpi: 300,
  xhdpi: 400,
  xxhdpi: 600,
  xxxhdpi: 800,
};

for (const [density, size] of Object.entries(splashDensities)) {
  const dir = path.join(resDir, `drawable-${density}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const resized = resizeBilinear(icon, icon.width, icon.height, size, size);
  fs.writeFileSync(path.join(dir, 'splashscreen_logo.png'), PNG.sync.write(resized));
  console.log(`Updated drawable-${density}/splashscreen_logo.png (${size}x${size})`);
}

// 3. Generate native Android mipmap-* launcher icons
const legacyDensities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const adaptiveDensities = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

for (const [density, size] of Object.entries(legacyDensities)) {
  const dir = path.join(resDir, `mipmap-${density}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const resized = resizeBilinear(icon, icon.width, icon.height, size, size);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), PNG.sync.write(resized));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), PNG.sync.write(resized));
  for (const f of ['ic_launcher.webp', 'ic_launcher_round.webp']) {
    const webp = path.join(dir, f);
    if (fs.existsSync(webp)) fs.unlinkSync(webp);
  }
  console.log(`Updated mipmap-${density}/ic_launcher.png (${size}x${size})`);
}

const adaptiveIconPNG = PNG.sync.read(fs.readFileSync(adaptivePath));
for (const [density, size] of Object.entries(adaptiveDensities)) {
  const dir = path.join(resDir, `mipmap-${density}`);
  const resized = resizeBilinear(adaptiveIconPNG, adaptiveIconPNG.width, adaptiveIconPNG.height, size, size);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), PNG.sync.write(resized));
  const webp = path.join(dir, 'ic_launcher_foreground.webp');
  if (fs.existsSync(webp)) fs.unlinkSync(webp);
  console.log(`Updated mipmap-${density}/ic_launcher_foreground.png (${size}x${size})`);
}

console.log('ALL ICONS AND SPLASH LOGOS REGENERATED SUCCESSFULLY FROM assets/icon.png!');
