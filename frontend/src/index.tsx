import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import PageLoading from "./components/PageLoading";
import { isQuickDraft, quickToken } from "./lib/quickSplit";
import { isEnabled } from "./lib/flags";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// The app and the quick split page are separate downloads: a guest opening a quick split link never loads the app, and
// the other way round.
const App = lazy(() => import("./App"));
const QuickSplit = lazy(() => import("./components/QuickSplit"));

// /s/<token> is a shared quick split: it needs no account, so it skips sign-in entirely.
const quickOn = isEnabled("quickSplit");
const token = quickOn ? quickToken(window.location.pathname) : null;
const draft = quickOn && isQuickDraft(window.location.pathname);
const root = ReactDOM.createRoot(
	document.getElementById("root") as HTMLElement
);
root.render(
	<React.StrictMode>
		<ErrorBoundary>
			<Suspense fallback={<PageLoading />}>
				{token || draft ? <QuickSplit token={token} /> : <App />}
			</Suspense>
		</ErrorBoundary>
	</React.StrictMode>
);
