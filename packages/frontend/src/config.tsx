/**
 * EasyAgent 前端运行时配置上下文
 *
 * 解决 Web 版与 Desktop 版 API_BASE / WS_BASE 差异：
 * - Web:  相对路径（Vite 代理），API_BASE=""  WS_BASE="/ws"
 * - Desktop: 直连 127.0.0.1:3456，API_BASE="http://127.0.0.1:3456"  WS_BASE="ws://127.0.0.1:3456/ws"
 */
import { createContext, useContext, useLayoutEffect, type ReactNode, type FC } from 'react';
import { setApiBase, setWsBase, setIsDesktop } from './request';

/** 前端运行时配置 */
export interface FrontendConfig {
  /** API 基准 URL，如 "http://127.0.0.1:3456" 或 "" */
  apiBase: string;
  /** WebSocket 基准 URL，如 "ws://127.0.0.1:3456/ws" 或 "/ws" */
  wsBase: string;
  /** 是否为桌面版环境 */
  isDesktop: boolean;
}

/** 默认 Web 版配置 */
const defaultConfig: FrontendConfig = {
  apiBase: '',
  wsBase: '/ws',
  isDesktop: false,
};

const ConfigContext = createContext<FrontendConfig>(defaultConfig);

/** 获取当前前端配置 */
export function useConfig(): FrontendConfig {
  return useContext(ConfigContext);
}

/** 配置提供者 Props */
interface ConfigProviderProps {
  config: Partial<FrontendConfig>;
  children: ReactNode;
}

/**
 * 前端配置提供者
 * 在 Web/Desktop 各自的入口处用对应配置包裹
 *
 * @example
 * // Web 版 (无需特殊配置，默认即可)
 * <ConfigProvider config={{}}><App /></ConfigProvider>
 *
 * @example
 * // Desktop 版
 * <ConfigProvider config={{ apiBase: 'http://127.0.0.1:3456', wsBase: 'ws://127.0.0.1:3456/ws', isDesktop: true }}>
 *   <App />
 * </ConfigProvider>
 */
export const ConfigProvider: FC<ConfigProviderProps> = ({ config, children }) => {
  const merged: FrontendConfig = { ...defaultConfig, ...config };

  // 同步配置到模块级变量，供 Store 内的 apiRequest() / getWsBase() / getIsDesktop() 使用
  // ⚠️ 使用 useLayoutEffect 而非 useEffect: 必须保证在子组件挂载/effect 之前同步完成，否则 App.tsx 的 loadSettings() 会以空 _apiBase 发起请求导致连接失败
  useLayoutEffect(() => {
    setApiBase(merged.apiBase);
    setWsBase(merged.wsBase);
    setIsDesktop(merged.isDesktop);
  }, [merged.apiBase, merged.wsBase, merged.isDesktop]);

  return <ConfigContext.Provider value={merged}>{children}</ConfigContext.Provider>;
};
