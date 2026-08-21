const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-webrtc',
  'android',
  'build.gradle'
);

if (!fs.existsSync(filePath)) {
  process.exit(0);
}

const source = fs.readFileSync(filePath, 'utf8');
const patched = source.replace(
  "api 'org.jitsi:webrtc:124.+'",
  "api 'org.jitsi:webrtc:124.0.0'"
);

if (patched !== source) {
  fs.writeFileSync(filePath, patched);
  console.log('Patched react-native-webrtc to use org.jitsi:webrtc:124.0.0 from Maven Central (jitpack is unreliable).');
}
