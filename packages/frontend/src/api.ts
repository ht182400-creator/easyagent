/**
 * EasyAgent 统一 API 请求工具
 * 通过 ConfigContext 动态获知 API_BASE，同时适配 Web 和 Desktop
 */
import { useConfig } from './config';

/**
 * 获取当前 API 基准 URL（React Hook）
 */
export function useApiBase(): string {
  const { apiBase } = useConfig();
  return apiBase;
}

/**
 * 获取当前 WebSocket 基准 URL（React Hook）
 */
export function useWsBase(): string {
  const { wsBase } = useConfig();
  return wsBase;
}

/**
 * 判断是否为桌面版环境（React Hook）
 */
export function useIsDesktop(): boolean {
  const { isDesktop } = useConfig();
  return isDesktop;
}

/**
 * 统一的 API fetch 封装（非 Hook，需传入 apiBase）
 */
export async function apiFetch<T = unknown>(
  path: string,
  apiBase: string,
  options?: RequestInit
): Promise<T> {
  const url = path.startsWith('http') ? path : `${apiBase}${path}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || `请求失败 (${res.status})`);
      }
      return data as T;
    }

    if (!res.ok) {
      throw new Error(`请求失败 (${res.status})`);
    }

    return (await res.text()) as unknown as T;
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('无法连接到后端服务，请确认应用已正确启动');
    }
    throw error;
  }
}
