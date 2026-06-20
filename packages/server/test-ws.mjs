import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3456/ws');
let done = false;
const startTime = Date.now();

ws.on('open', () => {
  const elapsed = Date.now() - startTime;
  console.log(`[${elapsed}ms] 已连接`);
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'td' }));
  ws.send(JSON.stringify({
    type: 'chat', message: 'say hi',
    provider: 'ollama', model: 'qwen2.5:7b', sessionId: 'td',
  }));
  console.log(`[${Date.now() - startTime}ms] 已发送chat`);
});

ws.on('message', (data) => {
  const elapsed = Date.now() - startTime;
  try {
    const m = JSON.parse(data.toString());
    const preview = (m.delta || m.content || m.message || '');
    console.log(`[${elapsed}ms] ${m.type}: ${preview.substring(0, 120)}`);
    if (m.type === 'done' || m.type === 'error') {
      done = true;
      if (m.type === 'error') console.error('ERROR:', m.message);
      ws.close();
    }
  } catch (e) {
    console.log(`[${elapsed}ms] RAW:`, data.toString().substring(0, 200));
  }
});

ws.on('error', (e) => console.error('WS ERROR:', e.message));
ws.on('close', (code) => { console.log(`CLOSED code=${code}`); process.exit(0); });
setTimeout(() => { if (!done) { console.log('TIMEOUT 30s'); process.exit(1); } }, 30000);
