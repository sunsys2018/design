import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  name?: string
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary] ${this.props.name ?? 'Component'} crashed:`, error, errorInfo)
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="panel" style={{ padding: '16px' }}>
          <div className="panel-error" role="alert">
            <strong>Something went wrong with {this.props.name ?? 'this panel'}</strong>
            <p style={{ margin: '6px 0 10px', fontSize: '12px' }}>
              {this.state.error?.message ?? 'An unexpected rendering error occurred.'}
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
