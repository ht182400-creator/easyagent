const fs = require('fs');
const main = fs.readFileSync('dist/main.js', 'utf-8');

// Find init_dist2 and dist_exports definitions
const idx = main.indexOf('init_dist2');
if (idx > 0) {
  const context = main.substring(Math.max(0, idx - 100), idx + 300);
  console.log('init_dist2 context:');
  console.log(context);
}

// Check total lines
console.log('\n--- Total lines:', main.split('\n').length);

// Check around line 17248-17260
const lines = main.split('\n');
for (let i = 17245; i < 17275; i++) {
  if (i < lines.length) process.stdout.write(`${i}: ${lines[i]}\n`);
}

// Also check around 17190
console.log('\n=== Around 17190 ===');
for (let i = 17185; i < 17210; i++) {
  if (i < lines.length) process.stdout.write(`${i}: ${lines[i]}\n`);
}
