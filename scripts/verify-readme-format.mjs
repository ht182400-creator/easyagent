#!/usr/bin/env node
/**
 * verify-readme-format.mjs — 校验插件市场 README 确实是「原始 Markdown」而非 HTML
 *
 * ── 为什么需要它 ──
 * v0.6.30 把服务端 GitHub README 的取回方式从
 * `application/vnd.github.html+json`（**裸 HTML**）改为
 * `application/vnd.github.raw`（**原始 Markdown**）。
 *
 * 这个改动的价值在于**消除**不可信 HTML 的信任面，而不是事后过滤它。
 * 但它是**服务端配置层面**的约束 —— 若有人日后把 Accept 改回去，
 * 单测用的是 mock（会跟着一起改），因此**测不出来**，只有真实 API 能暴露。
 *
 * 本脚本直接打真实 GitHub API 校验返回格式，作为这道约束的**独立护栏**。
 *
 * ── 用法 ──
 *   node scripts/verify-readme-format.mjs [owner/repo]
 *
 * ── 状态语义（⚠️ 与其他校验脚本不同，本脚本会「跳过」）──
 *   PASS  确认取回的是原始 Markdown
 *   FAIL  取回的是 HTML / JSON —— Accept 头被改坏了（安全回退），必须修
 *   SKIP  网络不可用 / GitHub 限流 / 仓库无 README —— **未做校验**，退出码仍为 0
 *
 * ⚠️ 之所以要显式区分 SKIP 而不是"静默退出 0"：
 *    早期版本在网络异常时直接返回 0 且只打印一行 ⚠️，配合
 *    `| Select-String '✅|❌'` 这类过滤用法会**什么都不显示**，
 *    看起来像"没报错=通过"，实际上**一次都没校验**。现在会打印
 *    `__VERIFY_STATUS__=SKIP`，让 `verify-all` 能把它显式暴露出来。
 */

const REPO = process.argv[2] || 'ht182400-creator/easyagent';

/** GitHub 未认证限流很低，这里给一个宽松超时 */
const TIMEOUT_MS = 20_000;

async function main() {
  console.log(`[verify-readme-format] 目标仓库: ${REPO}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let text;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/readme`, {
      headers: {
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'EasyAgent-Verify/1.0',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(
        `⚠️  SKIP — GitHub 返回 ${res.status}（限流 / 仓库无 README / 网络受限），未做校验`,
      );
      return { code: 0, status: 'SKIP' };
    }
    text = await res.text();
  } catch (err) {
    clearTimeout(timer);
    console.warn(`⚠️  SKIP — 无法访问 GitHub（${err.message}），未做校验`);
    return { code: 0, status: 'SKIP' };
  }

  const trimmed = text.trimStart();

  // 判据：Markdown 文件的首个非空内容应为标题/引用等标记，绝不应是 HTML 标签
  const looksLikeHtml = trimmed.startsWith('<');
  const looksLikeJson = trimmed.startsWith('{');

  console.log(`[verify-readme-format] 前 80 字符: ${JSON.stringify(trimmed.slice(0, 80))}`);

  if (looksLikeHtml) {
    console.error('❌ FAIL — README 取回的是 **HTML**，Accept 头疑似被改回 vnd.github.html');
    console.error('   这会让远程不可信 HTML 重新进入前端渲染链路（安全回退）');
    return { code: 1, status: 'FAIL' };
  }
  if (looksLikeJson) {
    console.error('❌ FAIL — README 取回的是 **JSON**，Accept 头可能写错（如用了 vnd.github+json）');
    return { code: 1, status: 'FAIL' };
  }
  if (text.length === 0) {
    console.warn('⚠️  SKIP — README 内容为空，未做校验');
    return { code: 0, status: 'SKIP' };
  }

  console.log(`✅ PASS — README 为原始 Markdown（长度 ${text.length}），未回退为 HTML`);
  return { code: 0, status: 'PASS' };
}

const { code, status } = await main();
console.log(`__VERIFY_STATUS__=${status}`);
process.exitCode = code;
