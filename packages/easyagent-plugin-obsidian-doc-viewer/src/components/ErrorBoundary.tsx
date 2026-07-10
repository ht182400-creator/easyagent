import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 全局错误边界组件
 * 捕获渲染期间抛出的异常，避免白屏
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full w-full items-center justify-center bg-white">
          <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
            <h2 className="text-lg font-semibold text-red-800">页面出错了</h2>
            <p className="mt-2 text-sm text-red-600">
              {this.state.error?.message || '未知渲染错误'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
