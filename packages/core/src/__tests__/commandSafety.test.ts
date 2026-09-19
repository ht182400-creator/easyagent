/**
 * 沙箱命令解析与安全校验测试（2026-09-19 根治回归）
 *
 * 背景：旧黑名单把 `(` `)` 一律当子 shell 拦掉，导致 `node -e 'console.log(1+1)'`
 * 这类命令完全无法执行。现改为「引号感知 + 不经 shell 执行」。
 */
import { describe, it, expect } from 'vitest';
import {
  parseCommandLine,
  findUnquotedShellOperator,
  checkCommand,
} from '../sandbox/commandSafety.js';

describe('parseCommandLine - 引号感知切词', () => {
  it('保留引号内的括号与加号（用户实报场景）', () => {
    expect(parseCommandLine(`node -e 'console.log(1+1)'`)).toEqual([
      'node',
      '-e',
      'console.log(1+1)',
    ]);
  });

  it('Windows 路径的反斜杠不被当作转义吃掉', () => {
    expect(parseCommandLine('dir C:\\Work\\Area')).toEqual(['dir', 'C:\\Work\\Area']);
  });

  it('双引号内支持 \\" 转义', () => {
    expect(parseCommandLine('node -e "console.log(\\"a b\\")"')).toEqual([
      'node',
      '-e',
      'console.log("a b")',
    ]);
  });

  it('空引号参数被保留（不被空格折叠掉）', () => {
    expect(parseCommandLine(`echo '' x`)).toEqual(['echo', '', 'x']);
  });

  it('引号未闭合应抛错', () => {
    expect(() => parseCommandLine(`node -e 'abc`)).toThrow(/引号未闭合/);
  });
});

describe('findUnquotedShellOperator - 只检查引号外', () => {
  it('引号内的 ; | 不算危险', () => {
    expect(findUnquotedShellOperator(`echo 'a; b | c'`)).toBeNull();
  });

  it('引号外的 ; 命中 chaining', () => {
    const hit = findUnquotedShellOperator('echo a; rm -rf /');
    expect(hit?.kind).toBe('chaining');
    expect(hit?.char).toBe(';');
  });

  it('引号外的 $ 命中 expansion', () => {
    expect(findUnquotedShellOperator('echo $HOME')?.kind).toBe('expansion');
  });

  it('双引号内的 \\" 不会被误判为引号结束', () => {
    expect(findUnquotedShellOperator('echo "a\\"; rm -rf /"')).toBeNull();
  });

  it('换行视为 chaining', () => {
    expect(findUnquotedShellOperator('echo a\necho b')?.kind).toBe('chaining');
  });
});

describe('checkCommand - 两种沙箱的策略差异', () => {
  it('LocalSandbox（requireShellSafe=false）：$ 放行，引号外管道仍拦', () => {
    expect(checkCommand('echo $HOME', false).argv).toEqual(['echo', '$HOME']);
    expect(checkCommand('echo a | b', false).error).toMatch(/管道|重定向|链式/);
  });

  it('Docker（requireShellSafe=true）：$ 与反引号也拦（容器内必经 sh -c）', () => {
    expect(checkCommand('echo $HOME', true).error).toBeTruthy();
    expect(checkCommand('echo `whoami`', true).error).toBeTruthy();
  });

  it('引号内的括号在两种模式下都放行（根治点）', () => {
    expect(checkCommand(`node -e 'console.log(1+1)'`, false).argv).toHaveLength(3);
    expect(checkCommand(`node -e 'console.log(1+1)'`, true).argv).toHaveLength(3);
  });

  it('空命令应报错', () => {
    expect(checkCommand('   ', false).error).toBe('命令为空');
  });
});
