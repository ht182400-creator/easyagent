/**
 * EasyAgent Desktop - 统一 API 请求工具
 * 桌面版使用内嵌 Express 后端 (http://localhost:3456)
 * 统一封装 fetch，自动处理 base URL 和错误
 */

/** API 后端基准 URL */
export const API_BASE = 'http://127.0.0.1:3456';

/** WebSocket 基准 URL */
export const WS_BASE = 'ws://127.0.0.1:3456';

/**
 * 统一的 API fetch 封装
 * 自动添加 base URL，处理常见错误
 */
export async function apiFetch<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    // 处理非 JSON 响应
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

/**
 * 检查后端服务是否可用
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    return res.ok;
  } catch (err) {
    return false;
  }
}
