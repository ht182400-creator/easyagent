const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3456/ws');

ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'test_debug' }));
  ws.send(JSON.stringify({
    type: 'chat',
    message: 'say hello in one word',
    provider: 'ollama',
    model: 'qwen2.5:7b',
    sessionId: 'test_debug',
  }));
  console.log('Sent chat message');
});

ws.on('message', (data) => {
  const m = JSON.parse(data.toString());
  const preview = (m.delta || m.content || m.message || '').substring(0, 100);
  console.log('RECV [' + m.type + ']:', preview);
  if (m.type === 'done' || m.type === 'error') {
    ws.close();
  }
});

ws.on('error', (e) => console.error('WS ERROR:', e.message));
ws.on('close', () => { console.log('Connection closed'); process.exit(0); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 60000);
