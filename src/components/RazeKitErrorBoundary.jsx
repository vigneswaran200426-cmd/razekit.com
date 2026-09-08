import React from 'react';

/**
 * Keeps a failed media/widget/page subsystem from taking down the entire app.
 * Reload is intentionally the primary recovery action; no backend state is mutated here.
 */
export default class RazeKitErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'This section could not be displayed.' };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics out of the user-facing UI. A future telemetry adapter can hook here.
    console.error('[RazeKit] UI error boundary', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section
        role="alert"
        className="mx-auto my-8 w-full max-w-2xl rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm"
      >
        <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-600" aria-hidden="true">
          !
        </div>
        <h2 className="font-heading text-lg font-bold text-foreground">This section needs a refresh</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The rest of RazeKit is still available. Retry this section or reload the page if the issue continues.
        </p>
        {this.state.message ? <p className="mt-2 text-xs text-muted-foreground/80">{this.state.message}</p> : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={this.handleRetry} className="rz-primary-action rounded-lg px-4 py-2 text-sm font-semibold">
            Retry
          </button>
          <button type="button" onClick={() => window.location.reload()} className="rz-secondary-action rounded-lg px-4 py-2 text-sm font-semibold">
            Reload page
          </button>
        </div>
      </section>
    );
  }
}
