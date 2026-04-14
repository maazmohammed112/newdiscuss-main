import { Component } from 'react';
import { Button } from '@/components/ui/button';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[AppErrorBoundary]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212] px-4">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-white discuss:text-white mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center max-w-md mb-6">
            The app hit an unexpected error. You can try again. If this keeps happening, check the browser console
            for details.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error?.message && (
            <pre className="text-xs text-left bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg max-w-lg w-full overflow-auto mb-4 text-red-600 dark:text-red-400">
              {this.state.error.message}
            </pre>
          )}
          <Button onClick={this.handleReload} className="rounded-[6px]">
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
