/**
 * i18n 国际化工具
 * 轻量级中英文支持，支持动态切换语言
 */
export type Locale = 'zh-CN' | 'en-US';
export type I18nMessages = Record<string, string | Record<string, unknown>>;

let currentLocale: Locale = 'zh-CN';
let messages: Record<string, I18nMessages> = {};

/**
 * 初始化 i18n
 */
export function initI18n(locale: Locale, msgs: Record<string, I18nMessages>): void {
  currentLocale = locale;
  messages = msgs;
}

/**
 * 切换语言
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/**
 * 获取当前语言
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * 翻译函数 - t('key', { param: 'value' })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const localeMsgs = messages[currentLocale] || {};
  let value: unknown = localeMsgs;
  const parts = key.split('.');

  for (const part of parts) {
    if (typeof value === 'object' && value !== null) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return key; // 回退到 key 本身
    }
  }

  if (typeof value !== 'string') return key;

  // 参数替换
  if (params) {
    let result = value;
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, String(v));
    }
    return result;
  }

  return value;
}

/**
 * 默认中文消息
 */
export const zhCN: I18nMessages = {
  app: { name: 'EasyAgent', version: 'v0.2.0', tagline: 'AI编程助手 · 集成国产大模型' },
  status: {
    ready: '就绪',
    thinking: '思考中...',
    running: '执行中...',
    error: '错误',
    connected: '已连接',
    disconnected: '未连接',
  },
  menu: {
    file: '文件',
    newSession: '新建会话',
    openWorkspace: '打开工作区',
    settings: '设置',
    exit: '退出',
    edit: '编辑',
    view: '视图',
    help: '帮助',
    about: '关于',
  },
  sidebar: {
    chat: '对话',
    model: '模型',
    sessions: '会话',
    dashboard: '监控',
    newChat: '新建对话',
    search: '搜索会话...',
    noSessions: '暂无会话',
  },
  chat: {
    placeholder: '输入消息... (Enter 发送, Shift+Enter 换行)',
    send: '发送',
    stop: '停止',
    thinking: '思考中...',
    welcome: '你好！我是 EasyAgent。',
  },
  tools: {
    count: '{count} 个工具',
    registered: '工具已注册',
    execute: '执行工具',
    success: '成功',
    failed: '失败',
  },
  errors: {
    agentNotInit: 'Agent未初始化',
    noProvider: '未配置模型提供商',
    invalidPath: '无法访问工作区外的路径',
  },
};

/**
 * 英文消息
 */
export const enUS: I18nMessages = {
  app: { name: 'EasyAgent', version: 'v0.2.0', tagline: 'AI Coding Assistant · Chinese LLMs' },
  status: {
    ready: 'Ready',
    thinking: 'Thinking...',
    running: 'Running...',
    error: 'Error',
    connected: 'Connected',
    disconnected: 'Disconnected',
  },
  menu: {
    file: 'File',
    newSession: 'New Session',
    openWorkspace: 'Open Workspace',
    settings: 'Settings',
    exit: 'Exit',
    edit: 'Edit',
    view: 'View',
    help: 'Help',
    about: 'About',
  },
  sidebar: {
    chat: 'Chat',
    model: 'Models',
    sessions: 'Sessions',
    dashboard: 'Dashboard',
    newChat: 'New Chat',
    search: 'Search sessions...',
    noSessions: 'No sessions',
  },
  chat: {
    placeholder: 'Type a message... (Enter to send, Shift+Enter for new line)',
    send: 'Send',
    stop: 'Stop',
    thinking: 'Thinking...',
    welcome: 'Hello! I am EasyAgent.',
  },
  tools: {
    count: '{count} tools',
    registered: 'Tool registered',
    execute: 'Execute tool',
    success: 'Success',
    failed: 'Failed',
  },
  errors: {
    agentNotInit: 'Agent not initialized',
    noProvider: 'No model provider configured',
    invalidPath: 'Cannot access path outside workspace',
  },
};
