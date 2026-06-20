import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3456/ws');
ws.on('open', () => { console.log('CONNECTED'); });
ws.on('error', (e) => { console.error('ERROR:', e.message); process.exit(1); });
ws.on('close', () => { console.log('CLOSED'); process.exit(0); });
setTimeout(() => { process.exit(1); }, 5000);
