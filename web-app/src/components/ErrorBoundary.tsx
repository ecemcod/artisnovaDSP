import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.error('ErrorBoundary caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary componentDidCatch:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-8 bg-red-100 border border-red-300 rounded-lg m-4">
          <h2 className="text-xl font-bold text-red-800 mb-4">🚨 Error Detected</h2>
          <div className="text-sm text-red-700 space-y-2">
            <p><strong>Error:</strong> {this.state.error?.message}</p>
            <p><strong>Stack:</strong></p>
            <pre className="bg-red-50 p-2 rounded text-xs overflow-auto max-h-40">
              {this.state.error?.stack}
            </pre>
            {this.state.errorInfo && (
              <>
                <p><strong>Component Stack:</strong></p>
                <pre className="bg-red-50 p-2 rounded text-xs overflow-auto max-h-40">
                  {this.state.errorInfo.componentStack}
                </pre>
              </>
            )}
          </div>
          <button 
            onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}