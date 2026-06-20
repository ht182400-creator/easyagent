/**
 * 加密工具模块全面测试
 * 覆盖加密/解密、哈希、边界条件、错误处理
 */
import { describe, it, expect, beforeAll } from 'vitest';

describe('encryption - 加密与解密', () => {
  let encrypt: (text: string) => string;
  let decrypt: (text: string) => string;
  let hash: (text: string) => string;

  beforeAll(async () => {
    const mod = await import('../utils/encryption.js');
    encrypt = mod.encrypt;
    decrypt = mod.decrypt;
    hash = mod.hash;
  });

  it('加密后解密应得到原文', () => {
    const original = 'my-secret-api-key-12345';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('加密结果应与原文不同', () => {
    const original = 'test-data';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.length).toBeGreaterThan(original.length);
  });

  it('每次加密同一文本应产生不同的密文（随机salt/IV）', () => {
    const text = 'same-text';
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    // 由于随机salt和IV，两次加密结果应不同
    expect(enc1).not.toBe(enc2);
    // 但解密结果应相同
    expect(decrypt(enc1)).toBe(text);
    expect(decrypt(enc2)).toBe(text);
  });

  it('应能加密空字符串', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('应能加密中文字符', () => {
    const original = '你好世界！AI编程助手';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('应能加密长文本', () => {
    const original = 'A'.repeat(10000);
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('应能加密特殊字符', () => {
    const original = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`\n\t\r';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('应能加密JSON字符串', () => {
    const original = JSON.stringify({ key: 'value', nested: { arr: [1, 2, 3] } });
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(JSON.parse(decrypted)).toEqual({ key: 'value', nested: { arr: [1, 2, 3] } });
  });

  it('加密结果格式应包含4个部分(冒号分隔)', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(4);
    // 每部分都应是有效的base64
    for (const part of parts) {
      expect(() => Buffer.from(part, 'base64')).not.toThrow();
    }
  });
});

describe('encryption - 解密错误处理', () => {
  let decrypt: (text: string) => string;

  beforeAll(async () => {
    const mod = await import('../utils/encryption.js');
    decrypt = mod.decrypt;
  });

  it('解密格式错误的数据应抛出异常', () => {
    expect(() => decrypt('invalid-data')).toThrow();
  });

  it('解密只有3个部分的数据应抛出异常', () => {
    const invalid = 'a:b:c'; // 缺少第4部分
    expect(() => decrypt(invalid)).toThrow();
  });

  it('解密篡改过的数据应抛出异常', async () => {
    const { encrypt } = await import('../utils/encryption.js');
    const original = encrypt('test-data');
    const parts = original.split(':');
    // 篡改密文部分
    parts[3] = Buffer.from('tampered').toString('base64');
    const tampered = parts.join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('解密非base64数据应抛出异常', () => {
    expect(() => decrypt('!!!:!!!:!!!:!!!')).toThrow();
  });
});

describe('encryption - 哈希', () => {
  let hash: (text: string) => string;

  beforeAll(async () => {
    const mod = await import('../utils/encryption.js');
    hash = mod.hash;
  });

  it('哈希应返回64位十六进制字符串', () => {
    const result = hash('test');
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });

  it('相同输入应产生相同哈希', () => {
    const h1 = hash('same-input');
    const h2 = hash('same-input');
    expect(h1).toBe(h2);
  });

  it('不同输入应产生不同哈希', () => {
    const h1 = hash('input-1');
    const h2 = hash('input-2');
    expect(h1).not.toBe(h2);
  });

  it('空字符串哈希应有效', () => {
    const result = hash('');
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });

  it('哈希中文文本', () => {
    const result = hash('你好世界');
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });
});
