const { execSync } = require('child_process');

// 检查会话
try {
  const r = execSync('curl -s http://localhost:3456/api/sessions', { encoding: 'utf8' });
  const d = JSON.parse(r);
  console.log('Sessions:', JSON.stringify(d, null, 2).slice(0, 500));
} catch (e) {
  console.log('sessions API error:', e.message);
}

// 检查配置
try {
  const r = execSync('curl -s http://localhost:3456/api/config', { encoding: 'utf8' });
  console.log('\nConfig:', r.slice(0, 300));
} catch (e) {
  console.log('config API error:', e.message);
}

// 检查 health
try {
  const r = execSync('curl -s http://localhost:3456/api/health', { encoding: 'utf8' });
  console.log('\nHealth:', r.slice(0, 200));
} catch (e) {
  console.log('health API error:', e.message);
}
