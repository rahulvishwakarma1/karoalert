const fs = require('fs');
const path = require('path');

const pkgRoot = path.join(__dirname, '..', 'node_modules', 'react-native-webrtc');

const tsFiles = [
  'src/index.ts',
  'src/EventEmitter.ts',
  'src/getDisplayMedia.ts',
  'src/getUserMedia.ts',
  'src/MediaDevices.ts',
  'src/MediaStream.ts',
  'src/MediaStreamTrack.ts',
  'src/Permissions.ts',
  'src/RTCAudioSession.ts',
  'src/RTCDataChannel.ts',
  'src/RTCPeerConnection.ts',
  'src/RTCRtpReceiver.ts',
  'src/RTCRtpSender.ts',
  'src/RTCRtpTransceiver.ts',
];

const commonJsFiles = tsFiles
  .filter((f) => f !== 'src/index.ts')
  .map((f) => 'lib/commonjs/' + f.replace(/^src\//, '').replace(/\.ts$/, '.js'))
  .concat(['lib/commonjs/index.js']);

const moduleFiles = tsFiles
  .filter((f) => f !== 'src/index.ts')
  .map((f) => 'lib/module/' + f.replace(/^src\//, '').replace(/\.ts$/, '.js'))
  .concat(['lib/module/index.js']);

let patchedCount = 0;

const patchTypeScript = (file) => {
  const filePath = path.join(pkgRoot, file);
  if (!fs.existsSync(filePath)) return;
  let source = fs.readFileSync(filePath, 'utf8');
  const original = source;

  if (!source.includes('TurboModuleRegistry')) {
    source = source.replace(
      /import \{ ([^}]+) \} from 'react-native';/,
      (match, names) => {
        if (names.includes('TurboModuleRegistry')) return match;
        return `import { ${names}, TurboModuleRegistry } from 'react-native';`;
      }
    );
  }

  source = source.replace(
    /const \{ WebRTCModule \} = NativeModules;/g,
    "const WebRTCModule = NativeModules.WebRTCModule ?? TurboModuleRegistry.get('WebRTCModule');"
  );

  if (source !== original) {
    fs.writeFileSync(filePath, source);
    patchedCount++;
  }
};

const patchCommonJs = (file) => {
  const filePath = path.join(pkgRoot, file);
  if (!fs.existsSync(filePath)) return;
  let source = fs.readFileSync(filePath, 'utf8');
  const original = source;

  const replaced = source.replace(
    /const\s*\{\s*WebRTCModule\s*\}\s*=\s*_reactNative\.NativeModules;/g,
    "const WebRTCModule = _reactNative.NativeModules.WebRTCModule ?? _reactNative.TurboModuleRegistry.get('WebRTCModule');"
  );

  if (replaced !== source) {
    fs.writeFileSync(filePath, replaced);
    patchedCount++;
  }
};

const patchEsm = (file) => {
  const filePath = path.join(pkgRoot, file);
  if (!fs.existsSync(filePath)) return;
  let source = fs.readFileSync(filePath, 'utf8');
  const original = source;

  if (!source.includes('TurboModuleRegistry')) {
    source = source.replace(
      /import \{ ([^}]+) \} from 'react-native';/,
      (match, names) => {
        if (names.includes('TurboModuleRegistry')) return match;
        return `import { ${names}, TurboModuleRegistry } from 'react-native';`;
      }
    );
  }

  source = source.replace(
    /const \{ WebRTCModule \} = NativeModules;/g,
    "const WebRTCModule = NativeModules.WebRTCModule ?? TurboModuleRegistry.get('WebRTCModule');"
  );

  if (source !== original) {
    fs.writeFileSync(filePath, source);
    patchedCount++;
  }
};

tsFiles.forEach(patchTypeScript);
commonJsFiles.forEach(patchCommonJs);
moduleFiles.forEach(patchEsm);

if (patchedCount > 0) {
  console.log(`Patched ${patchedCount} react-native-webrtc JS files: WebRTCModule now falls back to TurboModuleRegistry for New Architecture (bridgeless) support.`);
}
