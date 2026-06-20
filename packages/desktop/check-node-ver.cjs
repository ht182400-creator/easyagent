const fs = require('fs');
const buf = fs.readFileSync('release/win-unpacked/resources/node_modules/better-sqlite3/build/Release/better_sqlite3.node');

// PE header: 0x3C has offset to PE signature
const peOffset = buf.readUInt32LE(0x3C);
console.log('PE signature at offset:', peOffset.toString(16));

// After PE\0\0 signature (4 bytes) comes COFF header (20 bytes), then optional header
// In optional header, DataDirectory[0] VirtualAddress points to export table
// But for .node files, easier: just look for strings containing node version info

let out = '';
for (let i = 0; i < 1000; i++) {
  const c = buf[i];
  out += (c >= 32 && c < 127) ? String.fromCharCode(c) : '.';
}
console.log('First 1000 bytes:');
console.log(out.substring(0, 200));
console.log('---');
console.log(out.substring(200, 400));
console.log('---');

// Search for "NODE_MODULE_VERSION" string
const text = buf.toString('utf-8', 0, 5000);
const idx = text.indexOf('NODE_MODULE_VERSION');
if (idx >= 0) {
  console.log('Found NODE_MODULE_VERSION at', idx);
  console.log(text.substring(idx, idx + 100));
} else {
  // Try to find any version info
  const versions = text.match(/node\.exe|v\d+\.\d+\.\d+|electron/gi);
  console.log('Found strings:', versions?.join(', '));
}
