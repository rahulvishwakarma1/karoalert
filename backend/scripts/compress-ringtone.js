const fs = require('fs');

const src = 'assets/ringtones/ringtone.wav';
const out = 'assets/ringtones/ringtone.wav';
const targetRate = 16000;

const buf = fs.readFileSync(src);
const sampleRate = buf.readUInt32LE(24);
const channels = buf.readUInt16LE(22);
const bits = buf.readUInt16LE(34);

let dataOffset = 12;
let dataSize = 0;
while (dataOffset < buf.length) {
  const id = buf.toString('latin1', dataOffset, dataOffset + 4);
  const size = buf.readUInt32LE(dataOffset + 4);
  if (id === 'data') {
    dataSize = size;
    dataOffset += 8;
    break;
  }
  dataOffset += 8 + size + (size % 2);
}
console.log('dataOffset:', dataOffset, 'dataSize:', dataSize);

console.log('source:', channels, 'ch,', sampleRate, 'Hz,', bits, 'bit,', (buf.length / 1024 / 1024).toFixed(2) + 'MB');

if (bits !== 16 || channels !== 1) {
  console.error('Only supports 16-bit mono PCM');
  process.exit(1);
}

const samples = dataSize;
const pcm = Buffer.alloc(samples);
buf.copy(pcm, 0, dataOffset);

const ratio = sampleRate / targetRate;
const outSamples = Math.floor(samples / ratio / 2);
const newPcm = Buffer.alloc(outSamples * 2);
const sampleCount = Math.floor(samples / 2);

for (let i = 0; i < outSamples; i++) {
  const pos = i * ratio;
  const i0 = Math.min(Math.floor(pos), sampleCount - 1);
  const i1 = Math.min(i0 + 1, sampleCount - 1);
  const frac = Math.min(pos - Math.floor(pos), 1);
  const s0 = pcm.readInt16LE(i0 * 2);
  const s1 = pcm.readInt16LE(i1 * 2);
  const val = Math.round(s0 + (s1 - s0) * frac);
  newPcm.writeInt16LE(val, i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + newPcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(targetRate, 24);
header.writeUInt32LE(targetRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(newPcm.length, 40);

fs.writeFileSync(out + '.tmp', Buffer.concat([header, newPcm]));
fs.renameSync(out + '.tmp', out);
console.log('output:', targetRate, 'Hz mono 16bit,', (newPcm.length / 1024 / 1024).toFixed(2) + 'MB');
