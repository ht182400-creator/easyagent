/**
 * preinstall 脚本 - Node.js 版本兼容性检查
 * 在 pnpm install 前自动运行，拦截不兼容的 Node.js 版本
 *
 * 兼容范围: Node.js 18.x / 20.x / 22.x
 * 拦截版本: Node.js 24.x 及以上 (better-sqlite3 无预编译二进制)
 *
 * 参考: docs/09_EasyAgent项目Review与优化建议报告.md P0-1
 */
'use strict';

const MIN_NODE = 18;
const MAX_NODE = 23; // 24.x 以下 (即 <24.0.0)

// 颜色辅助 (不使用第三方库，纯 ANSI)
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/** 获取平台相关的环境变量设置命令 */
const isWindows = process.platform === 'win32';
const SET_ENV_CMD = isWindows ? 'set EASYAGENT_SKIP_NODE_CHECK=1' : 'export EASYAGENT_SKIP_NODE_CHECK=1';

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
      `${RED}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`
    );
    process.exit(1);
  }

  // 2. 最高版本检查 (Node.js < 24.0.0)
  // better-sqlite3 在 Node.js 24.x 上无预编译二进制，必须从源码编译
  // 源码编译需要 C++ 工具链 + Python，成功率低，直接拦截
  if (major >= 24) {
    console.error(
      `${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}\n` +
      `${RED}${BOLD}║  ⚠️  不兼容的 Node.js 版本: ${fullVersion}                          ║${RESET}\n` +
      `${RED}${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}\n` +
      `${RED}║  EasyAgent 当前不支持 Node.js >= 24.0.0                     ${RESET}\n` +
      `${RED}║  原因: better-sqlite3 (核心数据库) 在 Node 24 上无预编译   ${RESET}\n` +
      `${RED}║        二进制文件，必须从源码编译 C++ 扩展，成功率仅 ~60%  ${RESET}\n` +
      `${RED}║                                                            ${RESET}\n` +
      `${YELLOW}║  两种解决方式:                                              ${RESET}\n` +
      `${YELLOW}║                                                            ${RESET}\n` +
      `${GREEN}║  方式一 (推荐): 降级到 Node.js 20 LTS 或 22 LTS            ${RESET}\n` +
      `${GREEN}║    • nvm install 20                                        ${RESET}\n` +
      `${GREEN}║    • nvm use 20                                            ${RESET}\n` +
      `${GREEN}║    • 官网: https://nodejs.org                              ${RESET}\n` +
      `${GREEN}║                                                            ${RESET}\n` +
      `${YELLOW}║  方式二 (高级): 保留 ${fullVersion}，手动编译 better-sqlite3  ${RESET}\n` +
      `${YELLOW}║    • ${SET_ENV_CMD.padEnd(55)}${RESET}\n` +
      `${YELLOW}║    • 确保已安装 C++ 编译工具链 (VS Build Tools / Xcode)    ${RESET}\n` +
      `${YELLOW}║    • pnpm install                                          ${RESET}\n` +
      `${YELLOW}║    • cd packages/core && pnpm rebuild better-sqlite3        ${RESET}\n` +
      `${RED}║                                                            ${RESET}\n` +
      `${RED}║  官方 Node 24 支持预计在 better-sqlite3 下一大版本发布     ${RESET}\n` +
      `${RED}║  跟踪: https://github.com/WiseLibs/better-sqlite3/issues    ${RESET}\n` +
      `${RED}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`
    );

    // 允许高级用户通过环境变量跳过检查 (自担风险)
    if (process.env.EASYAGENT_SKIP_NODE_CHECK === '1') {
      console.warn(
        `${YELLOW}${BOLD}⚠ EASYAGENT_SKIP_NODE_CHECK=1 已设置，跳过版本检查 (自担风险)${RESET}`
      );
      return;
    }

    process.exit(1);
  }

  // 3. 警告: 非 LTS 版本
  const isLTS = major === 18 || major === 20 || major === 22;
  if (!isLTS) {
    console.warn(
      `${YELLOW}⚠ 注意: Node.js ${fullVersion} 不是 LTS 版本，建议切换到 20 LTS 或 22 LTS${RESET}`
    );
  }

  // 4. 成功
  console.log(
    `${GREEN}✓ Node.js ${fullVersion} 版本检查通过 (兼容范围: >=${MIN_NODE}.0.0 <${MAX_NODE + 1}.0.0)${RESET}`
  );
}

main();
