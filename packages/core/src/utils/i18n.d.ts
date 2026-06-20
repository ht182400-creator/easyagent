/**
 * i18n 国际化工具
 * 轻量级中英文支持，支持动态切换语言
 */
export type Locale = 'zh-CN' | 'en-US';
export type I18nMessages = Record<string, string | Record<string, unknown>>;
/**
 * 初始化 i18n
 */
export declare function initI18n(locale: Locale, msgs: Record<string, I18nMessages>): void;
/**
 * 切换语言
 */
export declare function setLocale(locale: Locale): void;
/**
 * 获取当前语言
 */
export declare function getLocale(): Locale;
/**
 * 翻译函数 - t('key', { param: 'value' })
 */
export declare function t(key: string, params?: Record<string, string | number>): string;
/**
 * 默认中文消息
 */
export declare const zhCN: I18nMessages;
/**
 * 英文消息
 */
export declare const enUS: I18nMessages;
//# sourceMappingURL=i18n.d.ts.map