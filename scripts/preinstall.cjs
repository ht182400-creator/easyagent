/**
 * preinstall 脚本 - Node.js 版本兼容性检查
 * 在 pnpm install 前自动运行
 *
 * 兼容范围: Node.js >= 18（推荐 20/22 LTS）
 * - < 18:              硬拦（缺 ES2022+ 特性，跑不了）
 * - >= 24:             **警告放行**（2026-09-19 起不再硬拦，见下）
 *
 * ── 为什么 Node ≥24 从"硬拦"改为"警告放行"（2026-09-19）──
 * 原硬拦理由："better-sqlite3 在 Node 24 无预编译二进制"——这**仍是事实**
 * （12.11.1 无 ABI 137 预编译资产，无 C++ 工具链的机器装不上）。
 * 但"跑不了"的结论已过时：
 *   ① 有工具链时源码编译一次即可（本机实测 ABI 137 读写正常）；
 *   ② 驱动适配层（packages/core/src/db/sqlite.ts）支持 EASYAGENT_SQLITE_DRIVER=node
 *      用 Node 内置 node:sqlite（≥22.5），零原生依赖。
 * 且硬拦把整个 pnpm install 打断（LangGraph Demo 实测被拦），
 * 而 engines 版本上界会随时间腐烂（本条 2026-06 上线，09-19 已误伤 3 个月）。
 *
 * EASYAGENT_SKIP_NODE_CHECK=1 已无实际作用（保留仅为兼容旧脚本/文档）。
 *
 * 参考: docs/09_EasyAgent项目Review与优化建议报告.md P0-1（历史决策）
 */
'use strict';

const MIN_NODE = 18;

// 颜色辅助 (不使用第三方库，纯 ANSI)
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * 解析 Node.js 版本号
 * @param {string} version - 全版本字符串，如 "v24.5.0"
 * @returns {{ major: number, minor: number, patch: number }}
 */
function parseVersion(version) {
  const cleaned = version.replace(/^v/, '');
  const parts = cleaned.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * 主检查逻辑
 */
function main() {
  const versionStr = process.version;
  const { major, minor, patch } = parseVersion(versionStr);
  const fullVersion = `v${major}.${minor}.${patch}`;

  // 1. 最低版本检查 (Node.js >= 18)
  if (major < MIN_NODE) {
    console.error(
      `${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}\n` +
        `${RED}${BOLD}║  不兼容的 Node.js 版本: ${fullVersion}  ║${RESET}\n` +
        `${RED}${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}\n` +
        `${RED}║  EasyAgent 要求 Node.js >= ${MIN_NODE}.0.0                       ${RESET}\n` +
        `${RED}║  当前版本: ${fullVersion} 过于陈旧，不支持 ES2022+ 特性      ${RESET}\n` +
        `${RED}║                                                            ${RESET}\n` +
        `${CYAN}║  推荐操作:                                                  ${RESET}\n` +
        `${CYAN}║  1. 安装 Node.js 20 LTS: https://nodejs.org               ${RESET}\n` +
        `${CYAN}║  2. 或使用 nvm/nvm-windows 切换版本                        ${RESET}\n` +
        `${RED}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`,
    );
    process.exit(1);
  }

  // 2. Node.js >= 24 —— **警告放行**（2026-09-19 起不再硬拦，理由见文件头注释）
  if (major >= 24) {
    console.warn(
      `${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}\n` +
        `${YELLOW}${BOLD}║  ⚠️  非推荐版本: ${fullVersion}（推荐 20/22 LTS）                  ║${RESET}\n` +
        `${YELLOW}${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}\n` +
        `${YELLOW}║  better-sqlite3 在 Node 24 无官方预编译二进制，将继续安装， ${RESET}\n` +
        `${YELLOW}║  但需注意:                                                  ${RESET}\n` +
        `${YELLOW}║                                                            ${RESET}\n` +
        `${GREEN}║  • 已装 C++ 工具链 (VS Build Tools / Xcode + Python):      ${RESET}\n` +
        `${GREEN}║    安装时会自动源码编译一次，之后一切正常                  ${RESET}\n` +
        `${YELLOW}║  • 无工具链: pnpm install 会在编译 better-sqlite3 时失败   ${RESET}\n` +
        `${YELLOW}║    → 降级 LTS (nvm install 20)，或:                        ${RESET}\n` +
        `${CYAN}║  • 免编译替代 (Node >= 22.5): 设                           ${RESET}\n` +
        `${CYAN}║      EASYAGENT_SQLITE_DRIVER=node                          ${RESET}\n` +
        `${CYAN}║    使用 Node 内置 node:sqlite（零原生依赖，测试/服务端均可）${RESET}\n` +
        `${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`,
    );
    // 放行：让 better-sqlite3 自己的 install 脚本决定能否编译（有工具链即成功）
    return;
  }

  // 3. 警告: 非 LTS 版本
  const isLTS = major === 18 || major === 20 || major === 22;
  if (!isLTS) {
    console.warn(
      `${YELLOW}⚠ 注意: Node.js ${fullVersion} 不是 LTS 版本，建议切换到 20 LTS 或 22 LTS${RESET}`,
    );
  }

  // 4. 成功
  console.log(
    `${GREEN}✓ Node.js ${fullVersion} 版本检查通过 (要求 >=${MIN_NODE}.0.0；推荐 20/22 LTS)${RESET}`,
  );
}

main();
