const { readFileSync } = require('fs');
const m = readFileSync('dist/main.js', 'utf-8');
console.log('has createApp:', m.includes('createApp'));
console.log('better-sqlite3 count:', (m.match(/better-sqlite3/g) || []).length);
console.log('has SessionManager:', m.includes('SessionManager'));
// Find require patterns for better-sqlite3
const reqPatterns = [
  "require('better-sqlite3')",
  'require("better-sqlite3")',
  'from"better-sqlite3"',
  "from'better-sqlite3'",
  'import Database from "better-sqlite3"',
];
reqPatterns.forEach(p => console.log(`  [${p}]:`, m.includes(p)));
