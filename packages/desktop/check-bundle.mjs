import { readFileSync } from 'node:fs';
const m = readFileSync('dist/main.js', 'utf-8');
console.log('has createApp:', m.includes('createApp'));
console.log('better-sqlite3 count:', (m.match(/better-sqlite3/g) || []).length);
console.log('has SessionManager:', m.includes('SessionManager'));
const idx = m.indexOf('better-sqlite3');
if (idx > 0) {
  console.log('context:', JSON.stringify(m.substring(Math.max(0, idx - 40), idx + 70)));
}
// Check for potential issues
console.log('has require(better-sqlite3):', m.includes("require('better-sqlite3')"));
console.log('has require("better-sqlite3"):', m.includes('require("better-sqlite3")'));
