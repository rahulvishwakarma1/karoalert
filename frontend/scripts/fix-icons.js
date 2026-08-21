const { PNG } = require('pngjs');
const fs = require('fs');

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

const icon = PNG.sync.read(fs.readFileSync('assets/icon.png'));
if (icon.width !== 1024 || icon.height !== 1024) {
  const big = resizeBilinear(icon, icon.width, icon.height, 1024, 1024);
  fs.writeFileSync('assets/icon.png', PNG.sync.write(big));
  console.log('icon.png -> 1024x1024 (opaque, upscaled)');
} else {
  console.log('icon.png already 1024x1024');
}

const adaptive = PNG.sync.read(fs.readFileSync('assets/adaptive-icon.png'));
const adaptiveFixed = placeCentered(adaptive, 1024, 0.6);
fs.writeFileSync('assets/adaptive-icon.png', PNG.sync.write(adaptiveFixed));
console.log('adaptive-icon.png -> content scaled to 60% (safe zone), transparent margins');

const splash = PNG.sync.read(fs.readFileSync('assets/splash-icon.png'));
const splashFixed = placeCentered(splash, 1024, 0.45);
fs.writeFileSync('assets/splash-icon.png', PNG.sync.write(splashFixed));
console.log('splash-icon.png -> content scaled to 45%, transparent margins');
