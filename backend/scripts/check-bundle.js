const fs = require('fs');
const m = JSON.parse(fs.readFileSync('dist/metadata.json', 'utf8'));
const ttfs = m.fileMetadata.android.assets.filter(a => a.ext === 'ttf');
let total = 0;
ttfs.forEach(a => {
  const s = fs.statSync('dist/' + a.path).size;
  total += s;
  console.log((s / 1024).toFixed(0) + 'KB  ' + a.path.replace(/\\/g, '/').split('/').pop());
});
console.log('TOTAL FONTS:', (total / 1024 / 1024).toFixed(2) + 'MB');
const all = m.fileMetadata.android.assets;
let tall = 0;
all.forEach(a => { tall += fs.statSync('dist/' + a.path).size; });
console.log('ALL ASSETS:', (tall / 1024 / 1024).toFixed(2) + 'MB');
const bundle = fs.statSync('dist/' + m.fileMetadata.android.bundle).size;
console.log('JS BUNDLE:', (bundle / 1024 / 1024).toFixed(2) + 'MB');
