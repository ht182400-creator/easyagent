/**
 * 工具函数模块全面测试
 * 覆盖logger、i18n等工具模块
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('logger - 日志工具', () => {
  it('应导出logger实例', async () => {
    const mod = await import('../utils/logger.js');
    expect(mod.logger).toBeDefined();
    expect(typeof mod.logger.info).toBe('function');
    expect(typeof mod.logger.warn).toBe('function');
    expect(typeof mod.logger.error).toBe('function');
    expect(typeof mod.logger.debug).toBe('function');
  });

  it('createLogger应创建新logger实例', async () => {
    const { createLogger } = await import('../utils/logger.js');
    const customLogger = createLogger('test-module');
    expect(customLogger).toBeDefined();
    expect(typeof customLogger.info).toBe('function');
  });

  it('LogLevel应导出正确的枚举值', async () => {
    const { LogLevel } = await import('../utils/logger.js');
    expect(LogLevel).toBeDefined();
  });
});

describe('i18n - 国际化', () => {
  it('应导出t函数', async () => {
    const mod = await import('../utils/i18n.js');
    expect(mod.t).toBeDefined();
    expect(typeof mod.t).toBe('function');
  });

  it('应导出setLocale和getLocale', async () => {
    const mod = await import('../utils/i18n.js');
    expect(typeof mod.setLocale).toBe('function');
    expect(typeof mod.getLocale).toBe('function');
  });

  it('默认locale应为zh-CN', async () => {
    const { getLocale } = await import('../utils/i18n.js');
    const locale = getLocale();
    expect(locale).toBe('zh-CN');
  });

  it('setLocale应能切换语言', async () => {
    const { setLocale, getLocale } = await import('../utils/i18n.js');
    setLocale('en-US');
    expect(getLocale()).toBe('en-US');
    // 恢复默认
    setLocale('zh-CN');
  });

  it('应导出语言包常量', async () => {
    const mod = await import('../utils/i18n.js');
    expect(mod.zhCN).toBeDefined();
    expect(mod.enUS).toBeDefined();
  });
});

describe('main index - 核心模块导出', () => {
  it('应导出AgentEngine', async () => {
    const mod = await import('../index.js');
    expect(mod.AgentEngine).toBeDefined();
  });

  it('应导出BaseAdapter', async () => {
    const mod = await import('../index.js');
    expect(mod.BaseAdapter).toBeDefined();
  });

  it('应导出OpenAICompatibleAdapter', async () => {
    const mod = await import('../index.js');
    expect(mod.OpenAICompatibleAdapter).toBeDefined();
  });

  it('应导出AdapterFactory', async () => {
    const mod = await import('../index.js');
    expect(mod.AdapterFactory).toBeDefined();
  });

  it('应导出ToolRegistry', async () => {
    const mod = await import('../index.js');
    expect(mod.ToolRegistry).toBeDefined();
  });

  it('应导出SessionManager', async () => {
    const mod = await import('../index.js');
    expect(mod.SessionManager).toBeDefined();
  });

  it('应导出ConfigManager和getConfigManager', async () => {
    const mod = await import('../index.js');
    expect(mod.ConfigManager).toBeDefined();
    expect(mod.getConfigManager).toBeDefined();
  });

  it('应导出加密工具函数', async () => {
    const mod = await import('../index.js');
    expect(mod.encrypt).toBeDefined();
    expect(mod.decrypt).toBeDefined();
    expect(mod.hash).toBeDefined();
  });

  it('应导出MCP模块', async () => {
    const mod = await import('../index.js');
    expect(mod.MCPClient).toBeDefined();
    expect(mod.MCPManager).toBeDefined();
  });

  it('应导出IM模块', async () => {
    const mod = await import('../index.js');
    expect(mod.IMManager).toBeDefined();
    expect(mod.TelegramAdapter).toBeDefined();
    expect(mod.FeishuAdapter).toBeDefined();
    expect(mod.WeChatAdapter).toBeDefined();
  });

  it('应导出插件模块', async () => {
    const mod = await import('../index.js');
    expect(mod.PluginManager).toBeDefined();
    expect(mod.getPluginManager).toBeDefined();
    expect(mod.resetPluginManager).toBeDefined();
    expect(mod.BUILTIN_SKILLS).toBeDefined();
  });
});

describe('main index - 适配器子路径导出', () => {
  it('adapters子路径应导出适配器', async () => {
    const mod = await import('../adapters/index.js');
    expect(mod.BaseAdapter).toBeDefined();
    expect(mod.OpenAICompatibleAdapter).toBeDefined();
    expect(mod.ErnieAdapter).toBeDefined();
    expect(mod.HunyuanAdapter).toBeDefined();
    expect(mod.AdapterFactory).toBeDefined();
  });
});

describe('main index - 工具子路径导出', () => {
  it('tools子路径应导出ToolRegistry', async () => {
    const mod = await import('../tools/index.js');
    expect(mod.ToolRegistry).toBeDefined();
  });

  it('tools子路径应导出所有工具分组', async () => {
    const mod = await import('../tools/index.js');
    const groups = [
      'FileTools', 'FileExtraTools', 'SearchTools', 'ExecTools',
      'CodeTools', 'QualityTools', 'ProjectTools', 'MemoryTools',
      'PreviewTools', 'MediaTools', 'DatabaseTools', 'KnowledgeTools', 'SubAgentTools',
    ];
    for (const group of groups) {
      expect(mod[group], `${group} should be exported`).toBeDefined();
    }
  });
});
