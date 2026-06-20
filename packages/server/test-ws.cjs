const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3456/ws');
let done = false;

ws.on('open', () => {
  console.log('[OK] 已连接');
  // 先订阅
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'test_debug' }));
  // 发送chat消息
  const chatMsg = {
    type: 'chat',
    message: 'say hello in one word',
    provider: 'ollama',
    model: 'qwen2.5:7b',
    sessionId: 'test_debug',
  };
  ws.send(JSON.stringify(chatMsg));
  console.log('[>>] 已发送chat:', JSON.stringify(chatMsg));
});

ws.on('message', (data) => {
  try {
    const m = JSON.parse(data.toString());
    const preview = (m.delta || m.content || m.message || '');
    console.log('[<<]', m.type, ':', preview.substring(0, 150));
    
    if ((m.type === 'done' || m.type === 'error') && !done) {
      done = true;
      if (m.type === 'error') console.error('[ERROR]', m.message);
      ws.close();
    }
  } catch (e) {
    console.log('[RAW]', data.toString().substring(0, 200));
  }
});

ws.on('error', (e) => console.error('[WS ERROR]', e.message));
ws.on('close', (code) => { console.log('[CLOSED] code:', code); process.exit(0); });
setTimeout(() => { if (!done) { console.log('[TIMEOUT 60s]'); process.exit(1); } }, 60000);
