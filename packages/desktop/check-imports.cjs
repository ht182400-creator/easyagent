const fs = require('fs');
const main = fs.readFileSync('dist/main.js', 'utf-8');
const lines = main.split('\n');
lines.forEach((line, i) => {
  if (line.includes('@easyagent')) {
    process.stdout.write(i + ': ' + line.substring(0, 200) + '\n');
  }
});
console.log('\n---');
// Check for dynamic import pattern
const hasDynamicImport = main.includes('import("@easyagent') || main.includes("import('@easyagent");
console.log('Has dynamic import(@easyagent):', hasDynamicImport);
