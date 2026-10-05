import React from 'react';

interface State {
    error: Error | null;
}

/** A render crash should show a way out, not a blank page. */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Unhandled UI error', error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-body">
                <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-sm w-full text-center shadow-sm space-y-4">
                    <h1 className="text-xl font-extrabold text-slate-900">Something went wrong</h1>
                    <p className="text-sm text-slate-500">The page hit an unexpected error. Reloading usually fixes it.</p>
                    <button onClick={() => window.location.reload()} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800">
                        Reload
                    </button>
                </div>
            </div>
        );
    }
}
