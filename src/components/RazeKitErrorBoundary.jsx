import React from 'react';

/**
 * Keeps a failed page/widget/media subsystem from taking down the whole app.
 * No backend state is mutated by the boundary itself.
 */
export default class RazeKitErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Diagnostics stay out of the UI; production telemetry can hook here later.
    console.error('[RazeKit] UI error boundary', error, info);
  }

  handleRetry = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section role="alert" className="mx-auto my-8 w-full max-w-2xl rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-600" aria-hidden="true">!</div>
        <h2 className="font-heading text-lg font-bold text-foreground">This section needs a refresh</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The rest of RazeKit is still available. Retry this section or reload the page if the issue continues.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={this.handleRetry} className="rz-primary-action rounded-lg px-4 py-2 text-sm font-semibold">Retry</button>
          <button type="button" onClick={() => window.location.reload()} className="rz-secondary-action rounded-lg px-4 py-2 text-sm font-semibold">Reload page</button>
        </div>
      </section>
    );
  }
}
