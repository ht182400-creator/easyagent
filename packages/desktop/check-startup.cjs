const fs = require('fs');
const main = fs.readFileSync('dist/main.js', 'utf-8');
const lines = main.split('\n');

// Find startBackendServer function
let inFunc = false;
lines.forEach((line, i) => {
  if (line.includes('startBackendServer')) {
    console.log(`\n=== Found startBackendServer at line ${i} ===`);
    inFunc = true;
  }
  if (inFunc) {
    process.stdout.write(`${i}: ${line.substring(0, 200)}\n`);
    if (line.includes('function startBackendServer') && line.includes('}')) {
      inFunc = false;
    } else if (line.trim() === '}' || (line.trim().startsWith('async function') && lines[i-1] && lines[i-1].includes('}'))) {
      inFunc = false;
    }
  }
  if (i > 100 && inFunc) inFunc = false; // safety limit
});

// Also find createApp references
console.log('\n=== createApp references ===');
lines.forEach((line, i) => {
  if (line.includes('createApp') && !line.includes('function createApp')) {
    process.stdout.write(`${i}: ${line.substring(0, 200)}\n`);
  }
});
