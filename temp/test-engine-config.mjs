/**
 * 测试引擎配置三级优先级
 * 验证: CLI参数 > 环境变量 > engine.config.json > 默认 legacy
 */
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', CYAN = '\x1b[36m', RESET = '\x1b[0m';
let passed = 0, failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ${GREEN}✓${RESET} ${label}: ${CYAN}${actual}${RESET}`);
    passed++;
  } else {
    console.log(`  ${RED}✗${RESET} ${label}: got ${RED}${actual}${RESET}, expected ${GREEN}${expected}${RESET}`);
    failed++;
  }
}

// ===== 模拟 loadEngineConfig =====
function loadEngineConfig(cwd) {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    const configPath = resolve(dir, 'engine.config.json');
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        const cfg = JSON.parse(raw);
        if (cfg.engine && (cfg.engine === 'legacy' || cfg.engine === 'langgraph')) {
          return cfg;
        }
      } catch { /* ignore */ }
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ===== 模拟 parseCliEngineArg =====
function parseCliEngineArg(args) {
  const engineIdx = args.findIndex(a => a === '--engine');
  if (engineIdx >= 0 && engineIdx + 1 < args.length) {
    const val = args[engineIdx + 1].toLowerCase();
    if (val === 'langgraph' || val === 'legacy') return val;
  }
  return null;
}

// ===== 模拟 getEngineType (优先级: CLI > env > config > default) =====
function getEngineType(cliEngine, envEngine, cwd) {
  if (cliEngine === 'langgraph' || cliEngine === 'legacy') return cliEngine;
  if (envEngine === 'langgraph' || envEngine === 'legacy') return envEngine;
  const fileConfig = loadEngineConfig(cwd);
  if (fileConfig?.engine) return fileConfig.engine;
  return 'legacy';
}

// ===== 测试用例 =====
import { fileURLToPath } from 'node:url';
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

console.log('\n========== 测试1: 配置文件加载 (从 project root) ==========');
{
  const cfg = loadEngineConfig(PROJECT_ROOT);
  assert('找到配置文件', cfg !== null, true);
  assert('引擎类型为 langgraph', cfg?.engine, 'langgraph');
  assert('maxTurns = 25', cfg?.langgraph?.maxTurns, 25);
}

console.log('\n========== 测试2: 配置文件从子目录向上查找 (从 packages/server/) ==========');
{
  const cfg = loadEngineConfig(resolve(PROJECT_ROOT, 'packages/server'));
  assert('从 server 目录向上找到', cfg !== null, true);
  assert('引擎类型为 langgraph', cfg?.engine, 'langgraph');
}

console.log('\n========== 测试3: 配置文件从 deeper 路径查找 (从 packages/server/dist/) ==========');
{
  const cfg = loadEngineConfig(resolve(PROJECT_ROOT, 'packages/server/dist'));
  assert('从 dist 目录向上找到', cfg !== null, true);
  assert('引擎类型为 langgraph', cfg?.engine, 'langgraph');
}

console.log('\n========== 测试4: CLI参数 --engine langgraph (最高优先级) ==========');
{
  const cli = parseCliEngineArg(['node', 'index.js', '--engine', 'langgraph']);
  const result = getEngineType(cli, null, PROJECT_ROOT);
  assert('CLI解析 → langgraph', cli, 'langgraph');
  assert('CLI 覆盖配置', result, 'langgraph');
}

console.log('\n========== 测试5: CLI参数 --engine legacy 覆盖配置文件langgraph ==========');
{
  const cli = parseCliEngineArg(['node', 'index.js', '--engine', 'legacy']);
  const result = getEngineType(cli, null, PROJECT_ROOT);
  assert('CLI → legacy 覆盖配置文件', result, 'legacy');
}

console.log('\n========== 测试6: 环境变量 EASYAGENT_ENGINE=legacy 覆盖配置文件 ==========');
{
  const result = getEngineType(null, 'legacy', PROJECT_ROOT);
  assert('env legacy 覆盖配置', result, 'legacy');
}

console.log('\n========== 测试7: 无CLI、无env、有配置文件 → 取配置文件 ==========');
{
  const result = getEngineType(null, null, PROJECT_ROOT);
  assert('回退到配置文件的 langgraph', result, 'langgraph');
}

console.log('\n========== 测试8: 无CLI、无env、无配置文件 → 默认 legacy ==========');
{
  const result = getEngineType(null, null, '__nonexistent_path__');
  assert('默认 legacy', result, 'legacy');
}

console.log('\n========== 测试9: CLI无效值被忽略 ==========');
{
  const cli = parseCliEngineArg(['node', 'index.js', '--engine', 'invalid']);
  assert('无效CLI值 → null', cli, null);
}

console.log('\n========== 测试10: EASYAGENT_ENGINE=langgraph 优先级测试 ==========');
{
  const result = getEngineType(null, 'langgraph', PROJECT_ROOT);
  assert('env langgraph 生效', result, 'langgraph');
}

// ===== 总结 =====
console.log(`\n${'='.repeat(50)}`);
console.log(`${GREEN}通过: ${passed}${RESET}  ${RED}失败: ${failed}${RESET}`);
if (failed === 0) {
  console.log(`${GREEN}✓ 三级优先级全部测试通过！${RESET}\n`);
} else {
  console.log(`${RED}✗ 有 ${failed} 个测试失败${RESET}\n`);
  process.exit(1);
}
