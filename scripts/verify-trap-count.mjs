#!/usr/bin/env node
/**
 * verify-trap-count.mjs — 陷阱计数一致性校验
 *
 * ── 为什么需要它 ──
 * "陷阱清单 XX 条"这类**元数据**散落在多处（文档导读页 / MEMORY 附录 /
 * docs/README 两处 / 清单自身标题），没有单一真源 —— 2026-09-19 一天内
 * 发现第 3 次失同步（37 / 47 / 51 / 52 / 62 五个数字曾在不同文件并存）。
 *
 * 本脚本把 `.codebuddy/memory/关键陷阱清单.md` **A 节的实际表格行数**当作唯一真源，
 * 校验所有声明处是否一致。加新陷阱（如 #63）后跑它，即可找齐所有漏改点。
 *
 * ── 新增声明位置的方法 ──
 * 在下方 SITES 数组加一项即可（file + 捕获数字的正则 + 描述）。
 * 同一文件内的多处声明建议拆成多条，这样失败信息能直接指出是哪一处。
 *
 * 用法: node scripts/verify-trap-count.mjs
 * 退出码: 0 = 一致；1 = 存在不一致
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 清单路径（唯一真源） */
const TRAP_LIST = join(ROOT, '.codebuddy', 'memory', '关键陷阱清单.md');

/**
 * 声明位置清单
 *
 * pattern 须用**第一个捕获组**捕获条数；会对文件内**全部匹配**逐一校验
 * （同一文件多处声明数字不一致的案例真实发生过：docs/README 曾同时写 47 和 51）。
 */
const SITES = [
  {
    file: '.codebuddy/memory/关键陷阱清单.md',
    pattern: /^## A\..*?(\d+) 条/gm,
    desc: '清单 A 节标题',
  },
  {
    file: '.codebuddy/memory/MEMORY.md',
    pattern: /(\d+) 条代码\/打包陷阱/g,
    desc: 'MEMORY 附录',
  },
  {
    file: 'docs/README.md',
    pattern: /陷阱清单 (\d+) 条/g,
    desc: 'docs/README 排查区导览',
  },
  {
    file: 'docs/README.md',
    pattern: /完整 (\d+) 条见/g,
    desc: 'docs/README 陷阱速查引言',
  },
  {
    file: 'packages/frontend/src/pages/docs-guide/data.tsx',
    pattern: /陷阱清单 (\d+) 条/g,
    desc: '文档导读页陷阱卡片',
  },
];

// ===================== 真源提取 =====================

/**
 * 从清单提取 A 节真实条数
 *
 * @returns {{ actual: number, headerDeclared: number|null }}
 *   actual          A 节内 `| <数字> |` 表格行数（真源）
 *   headerDeclared  A 节标题里声明的条数（也应与 actual 一致，一并校验）
 */
function countTraps() {
  const lines = readFileSync(TRAP_LIST, 'utf8').split(/\r?\n/);
  let inSectionA = false;
  let actual = 0;
  let headerDeclared = null;

  for (const line of lines) {
    if (/^## /.test(line)) {
      if (inSectionA) break; // A 节结束
      const m = /^## A\..*?(\d+) 条/.exec(line);
      if (m) {
        inSectionA = true;
        headerDeclared = Number(m[1]);
      }
      continue;
    }
    if (inSectionA && /^\| \d+ \|/.test(line)) actual++;
  }

  return { actual, headerDeclared };
}

// ===================== 主流程 =====================

function main() {
  const { actual, headerDeclared } = countTraps();

  if (actual === 0) {
    console.error(`❌ 无法从清单 A 节解析出任何陷阱行（${TRAP_LIST}）`);
    console.error('   可能是表格格式变化（每行应以 `| <数字> |` 开头）');
    console.log('__VERIFY_STATUS__=FAIL');
    return 1;
  }
  console.log(`真源: A 节实际 ${actual} 条（标题声明 ${headerDeclared ?? '?'} 条）`);

  const problems = [];

  // 真源自洽：A 节标题声明 == 实际行数
  if (headerDeclared !== actual) {
    problems.push(
      `清单 A 节标题声明 ${headerDeclared} 条，但实际表格行数是 ${actual} 条（改完清单忘改标题）`,
    );
  }

  // 各声明处
  for (const site of SITES) {
    const fullPath = join(ROOT, site.file);
    let text;
    try {
      text = readFileSync(fullPath, 'utf8');
    } catch {
      problems.push(`${site.file} 读取失败（文件不存在?）`);
      continue;
    }

    const matches = [...text.matchAll(site.pattern)];
    if (matches.length === 0) {
      problems.push(
        `${site.desc}（${site.file}）: 未找到计数声明（格式变了? 正则: ${site.pattern}）`,
      );
      continue;
    }
    for (const m of matches) {
      const declared = Number(m[1]);
      if (declared !== actual) {
        problems.push(`${site.desc}（${site.file}）: 声明 ${declared} 条 ≠ 实际 ${actual} 条`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n❌ 发现 ${problems.length} 处不一致:`);
    for (const p of problems) console.error(`   - ${p}`);
    console.error(`\n   修法: 把上述各处改为 ${actual}（或回到清单补登记新陷阱）`);
    console.log('__VERIFY_STATUS__=FAIL');
    return 1;
  }

  console.log(`✅ 陷阱计数一致（${SITES.length} 处声明 + 清单标题，均为 ${actual} 条）`);
  console.log('__VERIFY_STATUS__=PASS');
  return 0;
}

process.exitCode = main();
