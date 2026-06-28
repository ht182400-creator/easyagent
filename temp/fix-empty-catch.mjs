/**
 * 修复所有测试文件和 ESLint 配置中的空 catch 块
 * 原因：rmSync 清理失败不应影响测试结果，catch 块需加注释显式告知 ESLint 是故意的
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const testDir = resolve(rootDir, 'packages/core/src/__tests__');

// 需要修复的文件
const files = [
  // 测试文件 — 空 catch 用于 rmSync 清理
  'config-manager.test.ts',
  'code-tools.test.ts',
  'builtin-tools.test.ts',
  'subagent-db-tools.test.ts',
  'knowledge-tools.test.ts',
  'session-manager.test.ts',
  'git-advanced-tools.test.ts',
  'file-tools-security.test.ts',
  'file-extra-tools.test.ts',
  'mcp-client.test.ts',
  'preview-media-tools.test.ts',
  'project-tools.test.ts',
];

// ESLint 配置文件
const eslintConfig = resolve(rootDir, 'packages/frontend/eslint.config.cjs');

let totalFixed = 0;

// ============ 修复测试文件 ============
for (const file of files) {
  const filePath = resolve(testDir, file);
  let content = readFileSync(filePath, 'utf-8');
  
  // 统计修复前的空 catch 数
  const beforeCount = (content.match(/\} catch \((?:err|_)\) \{\s*\}/g) || []).length;
  
  // } catch (err) {} → } catch (_) { /* 测试清理失败不影响结果 */ }
  content = content.replace(
    /\} catch \(err\) \{\s*\}/g,
    '} catch (_) { /* 测试清理失败不影响结果 */ }',
  );
  
  // } catch (_) {} → } catch (_) { /* 测试清理失败不影响结果 */ }
  content = content.replace(
    /\} catch \(_\) \{\s*\}/g,
    '} catch (_) { /* 测试清理失败不影响结果 */ }',
  );
  
  if (beforeCount > 0) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`  [OK] ${file}: ${beforeCount} 处修复`);
    totalFixed += beforeCount;
  } else {
    console.log(`  [SKIP] ${file}: 无空 catch`);
  }
}

// ============ 修复 ESLint 配置 ============
let eslintContent = readFileSync(eslintConfig, 'utf-8');
const eslintBefore = (eslintContent.match(/\} catch \{[\s]*\}/g) || []).length;

// 第 28 行: } catch {  →  下一行是空，然后 } 结束
eslintContent = eslintContent.replace(
  /try \{\s*return rootRequire\(pkgName\);\s*\} catch \{\s*\}/,
  'try {\n    return rootRequire(pkgName);\n  } catch { /* 根解析失败，回退 .pnpm 扫描 */ }',
);

const eslintAfter = (eslintContent.match(/\} catch \{[\s]*\}/g) || []).length;
const eslintFixed = eslintBefore - eslintAfter;

if (eslintFixed > 0) {
  writeFileSync(eslintConfig, eslintContent, 'utf-8');
  console.log(`  [OK] eslint.config.cjs: ${eslintFixed} 处修复`);
  totalFixed += eslintFixed;
} else {
  console.log(`  [SKIP] eslint.config.cjs: 无空 catch`);
}

console.log(`\n总计修复: ${totalFixed} 处空 catch 块`);
