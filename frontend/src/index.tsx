import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import QuickSplit from "./components/QuickSplit";
import { isQuickDraft, quickToken } from "./lib/quickSplit";
import { isEnabled } from "./lib/flags";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

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
			{token || draft ? <QuickSplit token={token} /> : <App />}
		</ErrorBoundary>
	</React.StrictMode>
);
