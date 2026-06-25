const { execSync } = require('child_process');

// 获取完整会话列表
try {
  const r = execSync('curl -s http://localhost:3456/api/sessions', { encoding: 'utf8' });
  const sessions = JSON.parse(r);
  console.log('=== API 返回会话数:', sessions.length, '===');
  sessions.forEach((s, i) => {
    console.log(`[${i}] id: ${s.id}`);
    console.log('    workspace:', s.workspace);
    console.log('    title:', s.metadata?.title);
    console.log('    messageCount:', s.metadata?.messageCount);
    console.log('    status:', s.metadata?.status);
    console.log('    createdAt:', s.metadata?.createdAt);
    console.log('');
  });
} catch (e) {
  console.log('sessions API error:', e.message);
}
