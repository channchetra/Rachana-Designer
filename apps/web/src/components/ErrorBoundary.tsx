import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Greenlight] Render error:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-4">
          <p className="text-sm">Something went wrong rendering the editor.</p>
          <p className="text-xs text-zinc-600 max-w-md text-center font-mono">
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
