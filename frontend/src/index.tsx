import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import QuickSplit from "./components/QuickSplit";
import { quickToken } from "./lib/quickSplit";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// /s/<token> is a shared quick split: it needs no account, so it skips sign-in entirely.
const token = quickToken(window.location.pathname);
const root = ReactDOM.createRoot(
	document.getElementById("root") as HTMLElement
);
root.render(
	<React.StrictMode>
		<ErrorBoundary>
			{token ? <QuickSplit token={token} /> : <App />}
		</ErrorBoundary>
	</React.StrictMode>
);
