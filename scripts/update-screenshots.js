const fs = require('fs');
const path = require('path');
const Jimp = require('jimp-compact');
const sizeOf = require('image-size');

const assetsDir = path.join(__dirname, '..', 'playstore-screenshots');
const screenshutDir = path.join(assetsDir, 'screenshut');
const tabletDir = path.join(assetsDir, 'screenshut-tablet');
const tablet10Dir = path.join(assetsDir, 'screenshut-tablet-10');
const xrDir = path.join(assetsDir, 'screenshut-android-xr');

// Source images uploaded by user in assets/screenshut
const sourceFiles = [
  { name: 'login.jpeg', order: 1 },
  { name: 'home.jpeg', order: 2 },
  { name: 'qrview.jpeg', order: 3 },
  { name: 'alert.jpeg', order: 4 },
  { name: 'addcar.jpeg', order: 5 },
  { name: 'qr.jpeg', order: 6 },
  { name: 'register.jpeg', order: 7 },
  { name: 'calling.jpeg', order: 8 }
];

async function processScreenshots() {
  console.log('Starting Play Store screenshot processing...\n');

  // Default Play Store dimensions if old files not found
  let phoneSize = { width: 1080, height: 2400 };
  let tabletSize = { width: 1200, height: 1920 };
  let tablet10Size = { width: 1600, height: 2560 };
  let xrSize = { width: 1080, height: 1920 };

  // Try to read dimensions from existing old screenshots if present
  try {
    const oldPhone = path.join(screenshutDir, 'screenshot-1.png');
    if (fs.existsSync(oldPhone)) {
      const dim = sizeOf(oldPhone);
      if (dim.width && dim.height) phoneSize = { width: dim.width, height: dim.height };
    }
    const oldTab = path.join(tabletDir, 'tablet-1.png');
    if (fs.existsSync(oldTab)) {
      const dim = sizeOf(oldTab);
      if (dim.width && dim.height) tabletSize = { width: dim.width, height: dim.height };
    }
    const oldTab10 = path.join(tablet10Dir, 'tablet10-1.png');
    if (fs.existsSync(oldTab10)) {
      const dim = sizeOf(oldTab10);
      if (dim.width && dim.height) tablet10Size = { width: dim.width, height: dim.height };
    }
    const oldXr = path.join(xrDir, 'xr-1.png');
    if (fs.existsSync(oldXr)) {
      const dim = sizeOf(oldXr);
      if (dim.width && dim.height) xrSize = { width: dim.width, height: dim.height };
    }
  } catch (err) {
    console.log('Using default Play Store dimensions:', err.message);
  }

  console.log(`Target Dimensions:
  - Phone (screenshut): ${phoneSize.width}x${phoneSize.height}
  - 7-inch Tablet (screenshut-tablet): ${tabletSize.width}x${tabletSize.height}
  - 10-inch Tablet (screenshut-tablet-10): ${tablet10Size.width}x${tablet10Size.height}
  - Android XR (screenshut-android-xr): ${xrSize.width}x${xrSize.height}\n`);

  // Find available source images in screenshutDir
  const availableSources = [];
  for (const src of sourceFiles) {
    const srcPath = path.join(screenshutDir, src.name);
    if (fs.existsSync(srcPath)) {
      availableSources.push({ ...src, path: srcPath });
    }
  }

  if (availableSources.length === 0) {
    console.error('No new jpeg files found in assets/screenshut!');
    return;
  }

  console.log(`Found ${availableSources.length} source images: ${availableSources.map(s => s.name).join(', ')}\n`);

  // Target folders config
  const targets = [
    { name: 'screenshut', dir: screenshutDir, prefix: 'screenshot-', width: phoneSize.width, height: phoneSize.height },
    { name: 'screenshut-tablet', dir: tabletDir, prefix: 'tablet-', width: tabletSize.width, height: tabletSize.height },
    { name: 'screenshut-tablet-10', dir: tablet10Dir, prefix: 'tablet10-', width: tablet10Size.width, height: tablet10Size.height },
    { name: 'screenshut-android-xr', dir: xrDir, prefix: 'xr-', width: xrSize.width, height: xrSize.height },
  ];

  for (const target of targets) {
    if (!fs.existsSync(target.dir)) {
      fs.mkdirSync(target.dir, { recursive: true });
    }

    // Clean existing old screenshot png files in target dir
    const existing = fs.readdirSync(target.dir);
    for (const file of existing) {
      if (file.endsWith('.png') && file.startsWith(target.prefix)) {
        fs.unlinkSync(path.join(target.dir, file));
      }
    }

    // Process new images for this folder
    for (let i = 0; i < availableSources.length; i++) {
      const src = availableSources[i];
      const outFilename = `${target.prefix}${i + 1}.png`;
      const outPath = path.join(target.dir, outFilename);

      console.log(`Generating ${target.name}/${outFilename} (${target.width}x${target.height}) from ${src.name}...`);
      const img = await Jimp.read(src.path);
      img.resize(target.width, target.height, Jimp.RESIZE_BICUBIC);
      await img.writeAsync(outPath);
    }
    console.log(`Completed ${target.name} (${availableSources.length} screenshots updated).\n`);
  }

  // Remove source jpeg files from assets/screenshut
  console.log('Cleaning up temporary JPEG files...');
  for (const src of availableSources) {
    if (fs.existsSync(src.path)) {
      fs.unlinkSync(src.path);
      console.log(`Removed ${src.name}`);
    }
  }

  console.log('\nSUCCESS! All Play Store screenshots processed and updated successfully!');
}

processScreenshots().catch(err => {
  console.error('Error processing screenshots:', err);
  process.exit(1);
});
