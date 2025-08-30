import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

import UserSection from "./components/UserSection";
import ReceiptUpload from "./components/ReceiptUpload";
import AssignmentSection from "./components/AssignmentSection";
import CalculationSection from "./components/CalculationSection";
import SessionManager from "./components/SessionManager";
import "./App.css";

interface Item {
	id: number;
	name: string;
	price: number;
	assigned_users: string[];
}

interface Session {
	id: number;
	name: string;
}

type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const App: React.FC = () => {
	const [items, setItems] = useState<Item[]>([]);
	const [users, setUsers] = useState<string[]>([]);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<number | null>(
		null
	);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [notification, setNotification] = useState<string | null>(null);
	const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

	const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const isMountedRef = useRef(true);
	const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
			if (notificationTimeoutRef.current) {
				clearTimeout(notificationTimeoutRef.current);
			}
		};
	}, []);

	const showSaveNotification = (message: string, duration: number = 2000) => {
		if (notificationTimeoutRef.current) {
			clearTimeout(notificationTimeoutRef.current);
		}
		setNotification(message);
		notificationTimeoutRef.current = setTimeout(() => {
			if (isMountedRef.current) {
				setNotification(null);
			}
		}, duration);
	};

	const debouncedAutoSave = useCallback(() => {
		if (!currentSessionId) return;

		setSaveStatus("unsaved");

		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
		}

		debounceTimeoutRef.current = setTimeout(async () => {
			if (isMountedRef.current && currentSessionId) {
				setSaveStatus("saving");
				try {
					await axios.put(`/api/sessions/${currentSessionId}/update`);
					if (isMountedRef.current) {
						setSaveStatus("saved");
						showSaveNotification("Changes saved!");
					}
				} catch (err: any) {
					console.error("Auto-save failed:", err);
					if (isMountedRef.current) {
						setSaveStatus("error");
						showSaveNotification("Error saving changes.", 3000);
					}
				}
			}
		}, 1500);
	}, [currentSessionId]);

	useEffect(() => {
		if (
			currentSessionId &&
			saveStatus !== "saving" &&
			saveStatus !== "idle"
		) {
			debouncedAutoSave();
		} else if (currentSessionId && saveStatus === "idle") {
			setSaveStatus("unsaved");
		}
	}, [items, users]);

	useEffect(() => {
		if (currentSessionId) {
			setSaveStatus("saved");
		} else {
			setSaveStatus("idle");
		}
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
		}
	}, [currentSessionId]);

	const fetchData = useCallback(async (): Promise<void> => {
		console.log("Fetching data (items/users)...");
		try {
			const response = await axios.get("/api/items");
			setItems(response.data.items || []);
			setUsers(response.data.users || []);
			console.log("Data fetched successfully.");
		} catch (err: any) {
			console.error("Failed to fetch data:", err);
			setError(
				err.response?.data?.error || "Failed to fetch items and users"
			);
			setItems([]);
			setUsers([]);
		}
	}, []);

	const fetchSessions = useCallback(async (): Promise<void> => {
		console.log("Fetching sessions list...");
		try {
			const response = await axios.get("/api/sessions");
			setSessions(response.data.sessions || []);
			console.log("Sessions list fetched successfully.");
		} catch (err: any) {
			console.error("Failed to fetch sessions:", err);
			setError(
				err.response?.data?.error || "Failed to fetch sessions list"
			);
			setSessions([]);
		}
	}, []);

	const performLoadSession = useCallback(
		async (id: number): Promise<void> => {
			console.log(`Attempting to load session ${id} via API...`);
			setLoading(true);
			setError(null);
			try {
				await axios.post(`/api/sessions/${id}/load`);
				console.log(
					`Session ${id} loaded successfully on backend. Fetching updated data...`
				);
				await fetchData();
				setSaveStatus("idle");
			} catch (err: any) {
				console.error(`Failed to load session ${id}:`, err);
				setError(
					err.response?.data?.error || `Failed to load session ${id}`
				);
				setSaveStatus("error");
			} finally {
				setLoading(false);
			}
		},
		[fetchData]
	);

	const handleLoadSessionRequest = useCallback(
		(id: number | null) => {
			console.log(`Load requested for session ID: ${id}`);
			if (id !== null && id !== currentSessionId) {
				console.log(
					`Setting currentSessionId to ${id} to trigger load effect.`
				);
				setCurrentSessionId(id);
			} else if (id === currentSessionId) {
				console.log(`Session ${id} is already loaded.`);
			} else {
				console.log("Load requested for null ID (ignoring).");
			}
		},
		[currentSessionId]
	);

	const handleAddUser = async (name: string): Promise<void> => {
		try {
			await axios.post("/api/users", { name });
			await fetchData();
		} catch (err: any) {
			setError(err.response?.data?.error || "Failed to add user");
		}
	};

	const handleEditUser = async (
		oldName: string,
		newName: string
	): Promise<void> => {
		try {
			await axios.put(`/api/users/${encodeURIComponent(oldName)}`, {
				name: newName,
			});
			await fetchData();
		} catch (err: any) {
			setError(err.response?.data?.error || "Failed to edit user");
		}
	};

	const handleRemoveUser = async (name: string): Promise<void> => {
		try {
			await axios.delete(`/api/users/${encodeURIComponent(name)}`);
			await fetchData();
		} catch (err: any) {
			setError(err.response?.data?.error || "Failed to remove user");
		}
	};

	const handleAddItem = async (
		name: string,
		price: number
	): Promise<void> => {
		try {
			await axios.post("/api/items", { name, price });
			await fetchData();
		} catch (err: any) {
			setError(err.response?.data?.error || "Failed to add item");
		}
	};

	const handleRemoveItem = async (id: number): Promise<void> => {
		try {
			await axios.delete(`/api/items/${id}`);
			await fetchData();
		} catch (err: any) {
			setError(err.response?.data?.error || "Failed to remove item");
			await fetchData();
		}
	};

	const handleEditItem = async (
		id: number,
		name: string,
		price: number
	): Promise<void> => {
		try {
			await axios.put(`/api/items/${id}`, { name, price });
			await fetchData();
		} catch (err: any) {
			setError(err.response?.data?.error || "Failed to edit item");
		}
	};

	const handleUpdateAssignment = async (
		itemId: number,
		userName: string,
		checked: boolean
	): Promise<void> => {
		try {
			await axios.post(`/api/items/${itemId}/assign`, {
				user_name: userName,
				assign: checked,
			});
			await fetchData();
		} catch (err: any) {
			setError(
				err.response?.data?.error || "Failed to update assignment"
			);
		}
	};

	const processReceiptItems = async (
		receiptItems: { name: string; price: number }[]
	): Promise<void> => {
		if (!receiptItems || receiptItems.length === 0) {
			console.log("No items received from receipt processing.");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			await axios.post("/api/items/batch", receiptItems);
			await fetchData();
		} catch (err: any) {
			console.error("Error processing receipt items:", err);
			setError(
				err.response?.data?.error || "Failed to add items from receipt"
			);
			await fetchData();
		} finally {
			setLoading(false);
		}
	};

	const handleClearItems = async (): Promise<void> => {
		const confirmClear = window.confirm(
			"Are you sure you want to clear all items?"
		);
		if (confirmClear) {
			try {
				await axios.delete("/api/items");
				await fetchData();
			} catch (err: any) {
				setError(err.response?.data?.error || "Failed to clear items");
			}
		}
	};

	const handleSaveSession = async (name: string): Promise<number | void> => {
		try {
			const response = await axios.post("/api/sessions", { name });
			await fetchSessions();
			const newSessionId = response.data.id;
			setSaveStatus("saved");
			showSaveNotification(`Session "${name}" saved.`);
			return newSessionId;
		} catch (err: any) {
			setError(err.response?.data?.error || "Failed to save session");
			throw err;
		}
	};

	const handleEditSession = async (
		id: number,
		name: string
	): Promise<void> => {
		try {
			await axios.put(`/api/sessions/${id}`, { name });
			await fetchSessions();
		} catch (err: any) {
			setError(
				err.response?.data?.error || "Failed to update session name"
			);
			throw err;
		}
	};

	const handleDeleteSession = async (id: number): Promise<void> => {
		try {
			await axios.delete(`/api/sessions/${id}`);
			if (currentSessionId === id) {
				setCurrentSessionId(null);
				await fetchData();
			}
			await fetchSessions();
		} catch (err: any) {
			setError(err.response?.data?.error || "Failed to delete session");
			throw err;
		}
	};

	const handleCalculate = async (): Promise<Record<string, number>> => {
		try {
			const response = await axios.get("/api/calculate");
			return response.data || {}; // Return data or empty object
		} catch (err: any) {
			console.error("Calculation failed:", err);
			setError(err.response?.data?.error || "Failed to calculate totals");
			return {}; // Explicitly return empty object on error
		}
	};

	useEffect(() => {
		const initializeApp = async () => {
			console.log("Initializing app...");
			setLoading(true);
			setError(null);
			setIsInitialLoadComplete(false);
			try {
				const activeSessionResponse = await axios.get(
					"/api/sessions/active"
				);
				const initialSessionId =
					activeSessionResponse.data.active_session_id;

				console.log(
					"Initial active session ID from backend:",
					initialSessionId
				);

				setCurrentSessionId(initialSessionId);

				await fetchData();
				await fetchSessions();

				console.log("Initial data fetch complete.");
			} catch (err) {
				console.error("Initialization failed:", err);
				setError("Failed to initialize application data.");
				try {
					await fetchData();
					await fetchSessions();
				} catch (fetchErr) {
					console.error("Fallback fetch failed:", fetchErr);
					setError("Failed to load any data.");
				}
			} finally {
				setLoading(false);
				setIsInitialLoadComplete(true);
				console.log("Initialization process finished.");
			}
		};

		initializeApp();
	}, []);

	useEffect(() => {
		if (isInitialLoadComplete && currentSessionId !== null) {
			console.log(
				`useEffect detected currentSessionId change to: ${currentSessionId}. Calling performLoadSession.`
			);
			performLoadSession(currentSessionId);
		} else {
			console.log(
				`useEffect for session load skipped (initialLoadComplete: ${isInitialLoadComplete}, currentSessionId: ${currentSessionId})`
			);
		}
	}, [currentSessionId, isInitialLoadComplete]);

	return (
		<div className="app-container">
			{notification && (
				<div className="notification-toast">{notification}</div>
			)}

			<h1>Grocery Split</h1>

			{error && (
				<div className="error-message" style={{ gridColumn: "1 / -1" }}>
					{error}
					<button onClick={() => setError(null)}>Dismiss</button>
				</div>
			)}

			{loading && <div className="loading">Processing...</div>}

			{isInitialLoadComplete && !loading && (
				<>
					<SessionManager
						sessions={sessions}
						currentSessionId={currentSessionId}
						onSaveSession={handleSaveSession}
						onLoadSession={handleLoadSessionRequest}
						onEditSession={handleEditSession}
						onDeleteSession={handleDeleteSession}
						saveStatus={saveStatus}
					/>

					<ReceiptUpload
						onReceiptProcessed={processReceiptItems}
						loading={loading}
						setLoading={setLoading}
						setError={setError}
					/>

					<UserSection
						users={users}
						onAddUser={handleAddUser}
						onEditUser={handleEditUser}
						onRemoveUser={handleRemoveUser}
					/>

					<div className="assignment-section">
						<AssignmentSection
							items={items}
							users={users}
							onUpdateAssignment={handleUpdateAssignment}
							onEditItem={handleEditItem}
							onRemoveItem={handleRemoveItem}
							onAddItem={handleAddItem}
							onClearItems={handleClearItems}
						/>
					</div>

					<div className="calculation-section">
						<CalculationSection
							onCalculate={handleCalculate}
							users={users}
						/>
					</div>
				</>
			)}

			{!isInitialLoadComplete && (
				<div className="loading">Initializing...</div>
			)}
		</div>
	);
};

export default App;
