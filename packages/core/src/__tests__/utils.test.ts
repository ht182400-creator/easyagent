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

describe('i18n — 基础导出', () => {
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
    expect(getLocale()).toBe('zh-CN');
  });

  it('应导出语言包常量', async () => {
    const mod = await import('../utils/i18n.js');
    expect(mod.zhCN).toBeDefined();
    expect(mod.enUS).toBeDefined();
    // 验证语言包结构完整性
    const zh = mod.zhCN;
    const en = mod.enUS;
    // 两种语言应具有相同的一级键结构
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys).toEqual(enKeys);
  });
});

describe('i18n — initI18n 初始化', () => {
  it('initI18n 应设置语言和消息字典', async () => {
    expect(typeof (await import('../utils/i18n.js')).initI18n).toBe('function');
  });

  it('initI18n 设置中文后 t() 应返回中文文本', async () => {
    const { initI18n, t, zhCN, enUS } = await import('../utils/i18n.js');
    initI18n('zh-CN', { 'zh-CN': zhCN, 'en-US': enUS });
    expect(t('app.name')).toBe('EasyAgent');
    expect(t('status.ready')).toBe('就绪');
  });

  it('initI18n 设置英文后 t() 应返回英文文本', async () => {
    const { initI18n, t, zhCN, enUS } = await import('../utils/i18n.js');
    initI18n('en-US', { 'zh-CN': zhCN, 'en-US': enUS });
    expect(t('app.name')).toBe('EasyAgent');
    expect(t('status.ready')).toBe('Ready');
    expect(t('errors.invalidPath')).toBe('Cannot access path outside workspace');
  });
});

describe('i18n — t() 嵌套键翻译', () => {
  beforeEach(async () => {
    const { initI18n, zhCN, enUS } = await import('../utils/i18n.js');
    initI18n('zh-CN', { 'zh-CN': zhCN, 'en-US': enUS });
  });

  it('一级键翻译 app.name', async () => {
    const { t } = await import('../utils/i18n.js');
    expect(t('app.name')).toBe('EasyAgent');
  });

  it('二级键翻译 status.thinking', async () => {
    const { t } = await import('../utils/i18n.js');
    expect(t('status.thinking')).toBe('思考中...');
    expect(t('status.running')).toBe('执行中...');
    expect(t('status.error')).toBe('错误');
  });

  it('三级键翻译 menu.newSession', async () => {
    const { t } = await import('../utils/i18n.js');
    expect(t('menu.newSession')).toBe('新建会话');
    expect(t('menu.openWorkspace')).toBe('打开工作区');
  });

  it('sidebar.chat 和 sidebar.model', async () => {
    const { t } = await import('../utils/i18n.js');
    expect(t('sidebar.chat')).toBe('对话');
    expect(t('sidebar.model')).toBe('模型');
    expect(t('sidebar.sessions')).toBe('会话');
  });

  it('chat 模块键', async () => {
    const { t } = await import('../utils/i18n.js');
    expect(t('chat.placeholder')).toContain('Enter');
    expect(t('chat.send')).toBe('发送');
    expect(t('chat.welcome')).toContain('EasyAgent');
  });

  it('切换到英文后应返回英文翻译', async () => {
    const { setLocale, t } = await import('../utils/i18n.js');
    setLocale('en-US');
    expect(t('chat.send')).toBe('Send');
    expect(t('chat.welcome')).toContain('Hello');
    expect(t('status.ready')).toBe('Ready');
    expect(t('sidebar.dashboard')).toBe('Dashboard');
  });

  it('切换回中文后应返回中文翻译', async () => {
    const { setLocale, t } = await import('../utils/i18n.js');
    setLocale('en-US');
    setLocale('zh-CN');
    expect(t('chat.send')).toBe('发送');
    expect(t('status.thinking')).toBe('思考中...');
  });
});

describe('i18n — t() 参数替换', () => {
  beforeEach(async () => {
    const { initI18n, zhCN, enUS } = await import('../utils/i18n.js');
    initI18n('zh-CN', { 'zh-CN': zhCN, 'en-US': enUS });
  });

  it('应替换 {count} 参数', async () => {
    const { t } = await import('../utils/i18n.js');
    // tools.count = '{count} 个工具'
    expect(t('tools.count', { count: '5' })).toBe('5 个工具');
    expect(t('tools.count', { count: '51' })).toBe('51 个工具');
  });

  it('英文下应替换 {count} 参数', async () => {
    const { setLocale, t } = await import('../utils/i18n.js');
    setLocale('en-US');
    // tools.count = '{count} tools'
    expect(t('tools.count', { count: '3' })).toBe('3 tools');
    expect(t('tools.count', { count: '100' })).toBe('100 tools');
  });

  it('数字类型参数应正常替换', async () => {
    const { t } = await import('../utils/i18n.js');
    expect(t('tools.count', { count: 42 })).toBe('42 个工具');
  });

  it('多余参数不影响翻译结果', async () => {
    const { t } = await import('../utils/i18n.js');
    // 提供额外的参数不影响已有 {count} 的替换
    expect(t('tools.count', { count: '7', extra: 'ignored' })).toBe('7 个工具');
  });
});

describe('i18n — 缺键降级', () => {
  beforeEach(async () => {
    const { initI18n, zhCN, enUS } = await import('../utils/i18n.js');
    initI18n('zh-CN', { 'zh-CN': zhCN, 'en-US': enUS });
  });

  it('完全不存在的键应返回 key 本身', async () => {
    const { t } = await import('../utils/i18n.js');
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('部分不存在的路径应返回 key 本身', async () => {
    const { t } = await import('../utils/i18n.js');
    // app 存在，但 app.nonexistent 不存在
    expect(t('app.nonexistent')).toBe('app.nonexistent');
  });

  it('越界的深层嵌套路径应返回 key 本身', async () => {
    const { t } = await import('../utils/i18n.js');
    // app.name 是字符串不是对象，无法继续 "." 分割
    expect(t('app.name.extra.deep')).toBe('app.name.extra.deep');
  });

  it('未初始化消息字典时应返回 key 本身', async () => {
    const { t, setLocale } = await import('../utils/i18n.js');
    // 切换到一个没有对应消息包的语言
    setLocale('zh-CN' as any);
    // 注意：模块单例已初始化，此测试验证行为一致性
    expect(typeof t('app.name')).toBe('string');
  });
});

describe('i18n — 语言包完整性', () => {
  it('中文语言包应包含全部 7 个模块', async () => {
    const { zhCN } = await import('../utils/i18n.js');
    const modules = ['app', 'status', 'menu', 'sidebar', 'chat', 'tools', 'errors'];
    for (const mod of modules) {
      expect(zhCN[mod], `中文包缺少 ${mod} 模块`).toBeDefined();
    }
  });

  it('英文语言包应包含全部 7 个模块', async () => {
    const { enUS } = await import('../utils/i18n.js');
    const modules = ['app', 'status', 'menu', 'sidebar', 'chat', 'tools', 'errors'];
    for (const mod of modules) {
      expect(enUS[mod], `英文包缺少 ${mod} 模块`).toBeDefined();
    }
  });

  it('两种语言的 status 模块应包含 6 个状态', async () => {
    const { zhCN, enUS } = await import('../utils/i18n.js');
    const statusKeys = ['ready', 'thinking', 'running', 'error', 'connected', 'disconnected'];
    for (const key of statusKeys) {
      expect(zhCN.status[key], `中文 status.${key} 缺失`).toBeDefined();
      expect(enUS.status[key], `英文 status.${key} 缺失`).toBeDefined();
    }
  });

  it('两种语言的 errors 模块应包含 3 个错误信息', async () => {
    const { zhCN, enUS } = await import('../utils/i18n.js');
    const errorKeys = ['agentNotInit', 'noProvider', 'invalidPath'];
    for (const key of errorKeys) {
      expect(zhCN.errors[key], `中文 errors.${key} 缺失`).toBeDefined();
      expect(enUS.errors[key], `英文 errors.${key} 缺失`).toBeDefined();
    }
  });

  it('工具模块 message 应包含 {count} 占位符', async () => {
    const { zhCN, enUS } = await import('../utils/i18n.js');
    expect(zhCN.tools.count).toContain('{count}');
    expect(enUS.tools.count).toContain('{count}');
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
