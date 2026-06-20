const fs = require('fs');
const buf = fs.readFileSync('release/win-unpacked/resources/node_modules/better-sqlite3/build/Release/better_sqlite3.node');

// The NODE_MODULE_VERSION is stored in the binary's exports.
// For .node addons compiled with node-addon-api or nan, the version check 
// happens via NODE_MODULE_VERSION macro baked into the binary.
// We can find it by looking at the module definition structure.

// PE optional header size field is at offset 0x10 (2 bytes) in COFF header (starts after PE sig)
// PE sig at offset from DOS header 0x3C
const peOffset = buf.readUInt32LE(0x3C);
console.log('PE offset:', peOffset);

// Optional header magic: PE32 (0x10B) or PE32+ (0x20B) at peOffset+24
const magic = buf.readUInt16LE(peOffset + 24);
console.log('Magic:', '0x' + magic.toString(16), magic === 0x20B ? '(PE32+)' : magic === 0x10B ? '(PE32)' : '(?)');

// In PE32+: NumberOfRvaAndSizes at peOffset+108 (4 bytes), then DataDirectory
// In PE32:  NumberOfRvaAndSizes at peOffset+92
const isPE32Plus = magic === 0x20B;
const rvaOffset = peOffset + (isPE32Plus ? 116 : 96);
// Export Directory is DataDirectory[0]: 8 bytes (RVA, Size)
const exportRVA = buf.readUInt32LE(rvaOffset);
const exportSize = buf.readUInt32LE(rvaOffset + 4);
console.log('Export RVA:', '0x' + exportRVA.toString(16), 'Size:', exportSize);

// Convert RVA to file offset (need section table)
const sectionCount = buf.readUInt16LE(peOffset + 6);
const sectionTableOffset = peOffset + (isPE32Plus ? 136 : 112) + buf.readUInt16LE(peOffset + (isPE32Plus ? 108 : 92)) * 8;

console.log('Sections:', sectionCount);

function rvaToOffset(rva) {
  for (let i = 0; i < sectionCount; i++) {
    const base = sectionTableOffset + i * 40;
    const name = buf.toString('utf-8', base, base + 8).replace(/\0/g, '');
    const virtAddr = buf.readUInt32LE(base + 12);
    const virtSize = buf.readUInt32LE(base + 8);
    const rawOffset = buf.readUInt32LE(base + 20);
    const rawSize = buf.readUInt32LE(base + 16);
    if (rva >= virtAddr && rva < virtAddr + virtSize) {
      return { offset: rawOffset + (rva - virtAddr), section: name };
    }
  }
  return null;
}

if (exportRVA > 0) {
  const exp = rvaToOffset(exportRVA);
  if (exp) {
    console.log('Export section:', exp.section, 'at file offset', '0x' + exp.offset.toString(16));
    // Read export directory
    const e = exp.offset;
    const numFunctions = buf.readUInt32LE(e + 20);
    const numNames = buf.readUInt32LE(e + 24);
    console.log('Export functions:', numFunctions, 'names:', numNames);
    
    // The exported functions addresses are in an array
    const funcRVA = buf.readUInt32LE(e + 28);
    const nameRVA = buf.readUInt32LE(e + 32);
    const ordRVA = buf.readUInt32LE(e + 36);
    
    const funcs = rvaToOffset(funcRVA);
    const names = rvaToOffset(nameRVA);
    
    if (funcs && names) {
      // Find napi_register_module_v1 export (the init function)
      for (let i = 0; i < numNames; i++) {
        const nameOffset = rvaToOffset(buf.readUInt32LE(names.offset + i * 4));
        if (nameOffset) {
          const fnName = buf.toString('utf-8', nameOffset.offset, nameOffset.offset + 100).split('\0')[0];
          console.log('Export:', fnName);
        }
      }
    }
  }
}

// Alternative: search for the NODE_MODULE_VERSION check in the code section
// The string "node_module_version" or "NODE_MODULE_VERSION" might be in .rdata
console.log('\n--- Searching for version info in strings ---');
const str = buf.toString('utf-8');
const idx1 = str.indexOf('node_module_version');
const idx2 = str.indexOf('NODE_MODULE_VERSION');
const idx3 = str.indexOf('node_version');
const idx4 = str.indexOf('electron');
console.log('node_module_version at:', idx1);
console.log('NODE_MODULE_VERSION at:', idx2);
console.log('node_version at:', idx3);
console.log('electron at:', idx4);

if (idx1 >= 0) console.log(str.substring(idx1, idx1 + 60));
if (idx2 >= 0) console.log(str.substring(idx2, idx2 + 60));
if (idx3 >= 0) console.log(str.substring(idx3, idx3 + 60));
if (idx4 >= 0) {
  for (let j = 0; j < 5; j++) {
    const pos = str.indexOf('electron', idx4 + j * 50);
    if (pos >= 0) console.log('  electron at', pos, ':', str.substring(pos, pos + 60));
  }
}
