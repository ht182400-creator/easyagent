/**
 * LocalSandbox 真实执行测试（2026-09-19 根治回归）
 *
 * ⚠️ 本文件**不 mock** node:child_process（sandbox.test.ts 把 spawn mock 掉了，
 * 无法验证真实执行），故单列一处，用真实子进程验证：
 *   1. 引号内的括号不再被拒（用户实报：node -e 'console.log(1+1)' 曾被拒）
 *   2. 引号外的管道仍被明确拒绝
 *   3. **超时不再挂死**：旧实现 close 时 `if (killed) return` 导致 Promise 永不 settle
 */
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { LocalSandbox } from '../sandbox/LocalSandbox.js';

/** 用当前 Node 可执行文件构造命令（路径含空格，顺带验证引号解析） */
const NODE = process.execPath;

async function createSandbox(): Promise<LocalSandbox> {
  const sandbox = new LocalSandbox({ workspace: tmpdir() });
  await sandbox.start();
  return sandbox;
}

describe('LocalSandbox - 真实命令执行', () => {
  it("可执行带括号的单行代码：node -e 'console.log(1+1)' → 2", async () => {
    const sandbox = await createSandbox();
    const res = await sandbox.exec(`"${NODE}" -e 'console.log(1+1)'`);

    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('2');
  }, 30_000);

  it('引号内的管道/分号是普通字符，不被拦截也不被 shell 解释', async () => {
    const sandbox = await createSandbox();
    const res = await sandbox.exec(`"${NODE}" -e 'console.log("a|b;c")'`);

    expect(res.exitCode).toBe(0);
    // 若仍经 shell，这里会被拆成两条命令或管道，输出必然不同
    expect(res.stdout).toBe('a|b;c');
  }, 30_000);

  it('引号外的管道符仍被明确拒绝', async () => {
    const sandbox = await createSandbox();

    await expect(sandbox.exec('echo a | echo b')).rejects.toThrow(/管道|重定向|链式/);
  }, 30_000);

  it('超时会被终止并返回结果（不再挂死到 HTTP 超时）', async () => {
    const sandbox = await createSandbox();
    const started = Date.now();

    const res = await sandbox.exec(`"${NODE}" -e 'setTimeout(()=>{}, 60000)'`, 1500);

    expect(res.timedOut).toBe(true);
    expect(res.success).toBe(false);
    expect(res.stderr).toContain('超时');
    // 关键：Promise 必须落地（旧实现在这里会一直挂着）
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 40_000);

  it('系统命令 echo 仍可用（Windows 内建命令经 cmd.exe 兼容路径）', async () => {
    const sandbox = await createSandbox();
    const res = await sandbox.exec('echo hello-sandbox');

    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('hello-sandbox');
  }, 30_000);

  it('把代码片段当命令输入时给出可操作提示（而非裸 ENOENT）', async () => {
    const sandbox = await createSandbox();
    // 用户实报场景：误把 JS 表达式当命令
    const res = await sandbox.exec('console.log("a|b;c")');

    expect(res.success).toBe(false);
    expect(res.stderr).toContain('找不到可执行文件');
    expect(res.stderr).toContain('不是代码片段');
    expect(res.stderr).toContain('node -e');
  }, 30_000);
});
