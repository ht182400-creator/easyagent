/**
 * 核心模块性能基准测试 (PT-01)
 * 运行: pnpm bench
 *
 * 覆盖: 加密模块、日志系统、字符串处理、JSON 序列化
 */
import { bench, describe } from 'vitest';

// ================================================================
// 基准 1: 加密模块性能
// ================================================================
describe('encryption — 加密/解密', () => {
  const SAMPLE_DATA = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
  const KEY = 'test-encryption-key-0123456789abcdef';

  bench(
    'encrypt 2.5KB 文本',
    async () => {
      const { encrypt } = await import('../utils/encryption.js');
      encrypt(SAMPLE_DATA, KEY);
    },
    { time: 500, warmupTime: 200 },
  );

  bench(
    'encrypt→decrypt 往返',
    async () => {
      const { encrypt, decrypt } = await import('../utils/encryption.js');
      const encrypted = encrypt(SAMPLE_DATA, KEY);
      decrypt(encrypted, KEY);
    },
    { time: 500, warmupTime: 200 },
  );
});

// ================================================================
// 基准 2: 日志系统
// ================================================================
describe('logger — 日志写入', () => {
  bench(
    'info() 50次批量',
    () => {
      const { logger } = require('../utils/logger.js');
      for (let i = 0; i < 50; i++) {
        logger.info({ index: i }, 'benchmark');
      }
    },
    { time: 500, warmupTime: 100 },
  );

  bench(
    'error() 50次批量',
    () => {
      const { logger } = require('../utils/logger.js');
      for (let i = 0; i < 50; i++) {
        logger.error({ index: i, error: 'bench' }, '错误');
      }
    },
    { time: 500, warmupTime: 100 },
  );
});

// ================================================================
// 基准 3: JSON 序列化
// ================================================================
describe('JSON 序列化/反序列化', () => {
  const OBJ = {
    id: 'test-123',
    messages: Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}: ${'data '.repeat(10)}`,
    })),
  };

  bench(
    'JSON.stringify 50条消息',
    () => {
      JSON.stringify(OBJ);
    },
    { time: 500, warmupTime: 100 },
  );

  bench(
    'JSON.parse+stringify 往返',
    () => {
      const str = JSON.stringify(OBJ);
      JSON.parse(str);
    },
    { time: 500, warmupTime: 100 },
  );
});

// ================================================================
// 基准 4: 字符串操作 (典型工具场景)
// ================================================================
describe('字符串操作', () => {
  const TEXT = 'Hello World! '.repeat(200); // ~2.6KB

  bench(
    'substring 截断',
    () => {
      TEXT.substring(0, 2000);
    },
    { time: 300, warmupTime: 100 },
  );

  bench(
    'split+join 处理',
    () => {
      TEXT.split(' ').join('-');
    },
    { time: 300, warmupTime: 100 },
  );

  bench(
    '换行分割 (模拟日志解析)',
    () => {
      TEXT.replaceAll('!', '\n').split('\n');
    },
    { time: 300, warmupTime: 100 },
  );
});
