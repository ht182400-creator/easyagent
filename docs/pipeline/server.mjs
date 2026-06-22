/**
 * EasyAgent 管线页面服务器（v2.0 库化架构）
 * 
 * 功能：
 * 1. 静态文件服务（docs/pipeline/ 目录）
 * 2. REST API 端点（由 lib/pipeline-api.mjs 提供）
 * 3. 所有数据逻辑在 lib/ 库中，服务器只负责 HTTP 路由分发
 * 
 * 启动：node docs/pipeline/server.mjs [端口号]
 * 默认端口：8898
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiHandler } from './lib/pipeline-api.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATIC_DIR = __dirname;
const MEMORY_DIR = path.resolve(__dirname, '..', '..', '.codebuddy', 'memory');
const CACHE_FILE = path.join(__dirname, '.pipeline-cache.json');
const PORT = parseInt(process.argv[2]) || 8898;

// ---- MIME 类型 ---- //
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// 初始化 API 处理器
const handleApi = createApiHandler(MEMORY_DIR, CACHE_FILE);

// ---- HTTP 服务器 ---- //
const server = http.createServer((req, res) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 尝试 API 路由
  if (handleApi(url, res)) {
    return;
  }

  // ---- 静态文件服务 ---- //
  let filePath = url.pathname;
  if (filePath === '/') filePath = '/index.html';

  // 安全：防止路径穿越
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(STATIC_DIR, safePath);

  if (!fullPath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(fullPath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      // lib/*.mjs 文件不对外暴露（安全）
      if (fullPath.includes(path.sep + 'lib' + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const data = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - 文件未找到</h1>');
    }
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('服务器内部错误');
    console.error('[server] 静态文件服务错误:', e.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 EasyAgent 管线页面服务器 (v2.0 库化架构)`);
  console.log(`   地址:       http://localhost:${PORT}/`);
  console.log(`   API:        http://localhost:${PORT}/api/pipeline`);
  console.log(`   问题API:    http://localhost:${PORT}/api/issues`);
  console.log(`   仪表板API:  http://localhost:${PORT}/api/dashboard`);
  console.log(`   模块API:    http://localhost:${PORT}/api/modules`);
  console.log(`   状态API:    http://localhost:${PORT}/api/status`);
  console.log(`   Memory目录: ${MEMORY_DIR}`);
  console.log(`   库目录:     ${path.join(__dirname, 'lib')}`);
  console.log(`   按 Ctrl+C 停止服务器\n`);
});
