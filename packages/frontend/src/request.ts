/**
 * 统一 HTTP 请求模块（非 Hook 版本）
 *
 * 解决 Store 无法使用 React Hook 获取 apiBase 的问题:
 * - ConfigProvider 挂载时调用 setApiBase() 设置模块级变量
 * - 所有 Store 通过 apiRequest() 发起请求，自动拼接 apiBase
 *
 * 对比 api.ts（Hook 版本）:
 * - api.ts: useApiBase() → React Hook，仅限组件内使用
 * - request.ts: apiRequest() → 普通函数，组件/Store 均可使用
 */
import { useAppStore } from './stores/appStore';

/** 模块级 API 基准 URL，由 ConfigProvider 注入 */
let _apiBase = '';

/**
 * 设置 API 基准 URL（仅 ConfigProvider 调用）
 */
export function setApiBase(base: string): void {
  _apiBase = base;
}

/**
 * 获取当前 API 基准 URL
 */
export function getApiBase(): string {
  return _apiBase;
}

/**
 * 统一的 API fetch 封装（非 Hook，Store 内可用）
 *
 * 特性:
 * - 自动拼接 apiBase 前缀
 * - 自动添加 Content-Type: application/json
 * - 自动解析 JSON 错误信息
 * - 连接失败时显示友好提示
 *
 * @param path - API 路径，如 "/api/config"
 * @param options - fetch 选项
 * @returns 响应数据
 */
export async function apiRequest<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = path.startsWith('http') ? path : `${_apiBase}${path}`;

  const defaultHeaders: Record<string, string> = {};
  // FormData 不需要 Content-Type，浏览器会自动设置 multipart/form-data
  if (!(options?.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options?.headers as Record<string, string>),
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
      useAppStore.getState().addNotification({
        type: 'warning',
        message: '无法连接到后端服务，请确认应用已正确启动',
      });
      throw new Error('无法连接到后端服务，请确认应用已正确启动');
    }
    throw error;
  }
}
