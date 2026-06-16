// Global React Error Boundary — catches runtime errors in any child component.
// Without this, a single component crash crashes the entire app to a blank screen.
import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary] Caught in ${this.props.componentName || 'unknown'}:`,
      error,
      info.componentStack
    );
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '200px', padding: '2rem',
          textAlign: 'center', color: 'var(--foreground)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem', maxWidth: '400px' }}>
            {this.state.error.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.reset}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
              background: 'var(--primary)', color: 'var(--primary-foreground)',
              border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
