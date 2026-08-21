const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'Libraries',
  'Utilities',
  'DevLoadingView.js'
);

if (!fs.existsSync(filePath)) {
  process.exit(0);
}

const source = fs.readFileSync(filePath, 'utf8');
const patched = source.replace(
  /\n\s*const hasDismissButton = options\?\.dismissButton \?\? false;\n\s*\n\s*NativeDevLoadingView\.showMessage\(\n\s*message,\n\s*typeof textColor === 'number' \? textColor : null,\n\s*typeof backgroundColor === 'number' \? backgroundColor : null,\n\s*hasDismissButton,\n\s*\);/,
  `
      NativeDevLoadingView.showMessage(
        message,
        typeof textColor === 'number' ? textColor : null,
        typeof backgroundColor === 'number' ? backgroundColor : null,
      );`
);

if (patched !== source) {
  fs.writeFileSync(filePath, patched);
  console.log('Patched React Native DevLoadingView.showMessage for Expo native runtime compatibility.');
}
