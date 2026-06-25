const Database = require(require('path').resolve(__dirname, 'packages/core/node_modules/better-sqlite3'));
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.easyagent', 'data', 'sessions.db');
console.log('DB Path:', dbPath);

const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  console.log('DB NOT FOUND!');
  process.exit(1);
}

const st = fs.statSync(dbPath);
console.log('Size:', st.size, 'B', 'mtime:', st.mtime);

const db = new Database(dbPath, { readonly: true });

// 列出所有表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('\nTables:', tables.map(t => t.name));

// 查询会话
try {
  const sessions = db.prepare("SELECT * FROM sessions LIMIT 10").all();
  console.log('\nSessions (' + sessions.length + '):');
  sessions.forEach(s => {
    console.log('  id:', s.id?.slice(0, 30), 'title:', s.title?.slice(0, 40), 'status:', s.status, 'created:', s.created_at);
  });
} catch(e) {
  console.log('sessions table error:', e.message);
}

// 查询消息
try {
  const msgs = db.prepare("SELECT COUNT(*) as cnt FROM messages").get();
  console.log('\nMessages count:', msgs.cnt);
} catch(e) {
  console.log('messages table error:', e.message);
}

db.close();
