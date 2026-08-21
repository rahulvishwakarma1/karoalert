const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const files = ['assets/icon.png', 'assets/adaptive-icon.png', 'assets/splash-icon.png'];

for (const p of files) {
  const buf = fs.readFileSync(p);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  let minX = width, minY = height, maxX = -1, maxY = -1, opaque = 0;
  const total = width * height;
  const colors = {};
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a > 10) {
        opaque++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (a === 255) {
          const key = `${r},${g},${b}`;
          colors[key] = (colors[key] || 0) + 1;
        }
      }
    }
  }
  const topColors = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(
    `${p}: ${width}x${height} opaque=${(opaque / total * 100).toFixed(1)}% ` +
    `content=(${minX},${minY})-(${maxX},${maxY}) contentW=${maxX - minX + 1} contentH=${maxY - minY + 1}`,
  );
  console.log(`   topColors: ${topColors.map(([k, v]) => `rgb(${k}) x${v}`).join(' | ')}`);
}
