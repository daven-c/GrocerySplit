import React, { useState, useRef, useEffect } from "react"; // Import useRef, useEffect
// Import an icon (example using react-icons)
import { FaPlus } from "react-icons/fa";

// Add SaveStatus type back
type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

interface Session {
	id: number;
	name: string;
}

interface SessionManagerProps {
	sessions: Session[];
	currentSessionId: number | null; // This prop indicates the loaded session
	onSaveSession: (name: string) => Promise<number | void>; // Expect Promise<number> for new ID
	onLoadSession: (id: number) => void; // Renamed prop for clarity
	onDeleteSession?: (id: number) => Promise<void>;
	onEditSession?: (id: number, name: string) => Promise<void>;
	saveStatus?: SaveStatus;
}

const SessionManager: React.FC<SessionManagerProps> = ({
	sessions,
	currentSessionId,
	onSaveSession,
	onLoadSession, // Use renamed prop
	onDeleteSession,
	onEditSession,
	saveStatus = "idle",
}) => {
	// State for inline creation form
	const [isCreating, setIsCreating] = useState<boolean>(false);
	const [newSessionName, setNewSessionName] = useState<string>("");
	const createInputRef = useRef<HTMLInputElement>(null); // Ref for focus

	const [editingSessionId, setEditingSessionId] = useState<number | null>(
		null
	);
	const [editSessionName, setEditSessionName] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [deletingSessionId, setDeletingSessionId] = useState<number | null>(
		null
	);
	const [sessionSearchTerm, setSessionSearchTerm] = useState(""); // State for session search

	// Focus input when creation starts
	useEffect(() => {
		if (isCreating && createInputRef.current) {
			createInputRef.current.focus();
		}
	}, [isCreating]);

	const handleStartCreating = () => {
		setIsCreating(true);
		setNewSessionName(""); // Clear name
		setError(null);
	};

	const handleCancelCreating = () => {
		setIsCreating(false);
		setError(null);
	};

	const handleSaveNewSession = async (e?: React.FormEvent) => {
		if (e) e.preventDefault(); // Prevent default if called from form submit
		setError(null);
		const trimmedName = newSessionName.trim();
		if (trimmedName) {
			if (
				sessions.some(
					(s) => s.name.toLowerCase() === trimmedName.toLowerCase()
				)
			) {
				setError("A session with this name already exists");
				return;
			}
			try {
				const newSessionId = await onSaveSession(trimmedName);
				setIsCreating(false); // Close inline form
				setNewSessionName("");
				setError(null);
				if (typeof newSessionId === "number") {
					onLoadSession(newSessionId); // Load the new session
				}
			} catch (err) {
				setError("Failed to save session");
			}
		} else {
			setError("Session name cannot be empty");
		}
	};

	const startEditingSession = (session: Session) => {
		setEditingSessionId(session.id);
		setEditSessionName(session.name);
		setError(null);
	};

	const handleEditSession = async () => {
		if (!editingSessionId) return;

		if (editSessionName.trim()) {
			if (
				sessions.some(
					(s) =>
						s.id !== editingSessionId &&
						s.name.toLowerCase() ===
							editSessionName.trim().toLowerCase()
				)
			) {
				setError("A session with this name already exists");
				return;
			}

			try {
				if (onEditSession) {
					await onEditSession(
						editingSessionId,
						editSessionName.trim()
					);
				}
				setEditingSessionId(null);
				setError(null);
			} catch (err) {
				setError("Failed to update session name");
			}
		}
	};

	const confirmDeleteSession = (id: number) => {
		setDeletingSessionId(id);
	};

	const cancelDeleteSession = () => {
		setDeletingSessionId(null);
	};

	const handleDeleteSession = async (id: number) => {
		try {
			if (onDeleteSession) {
				await onDeleteSession(id);
			}
			if (currentSessionId === id) {
				onLoadSession(0);
			}
			setDeletingSessionId(null);
		} catch (err) {
			setError("Failed to delete session");
		}
	};

	// Add getStatusIndicator function back
	const getStatusIndicator = () => {
		if (!currentSessionId) return null; // No indicator if no session loaded

		switch (saveStatus) {
			case "unsaved":
				return (
					<span className="status-indicator status-unsaved">
						Unsaved changes
					</span>
				);
			case "saving":
				return (
					<span className="status-indicator status-saving">
						Saving...
					</span>
				);
			case "saved":
				// Show 'Saved' briefly or just empty after success notification handles it
				return (
					<span className="status-indicator status-saved">Saved</span>
				);
			case "error":
				return (
					<span className="status-indicator status-error">
						Save Error
					</span>
				);
			case "idle": // Initial state before loading or changes
			default:
				return <span className="status-indicator status-idle"></span>;
		}
	};

	// Filter sessions based on search term
	const filteredSessions = sessions.filter((session) =>
		session.name.toLowerCase().includes(sessionSearchTerm.toLowerCase())
	);

	return (
		<div className="section session-manager">
			<h2>Session Management</h2>

			{error && (
				<div className="session-error">
					<span>{error}</span>
					<button onClick={() => setError(null)}>&times;</button>
				</div>
			)}

			{/* Remove top controls section or just keep status */}
			<div className="session-controls">
				{/* Status Indicator */}
				<div className="save-status-indicator">
					{getStatusIndicator()}
				</div>
			</div>

			{/* Sessions List */}
			<div className="sessions-list">
				<h3>Saved Sessions</h3>

				{/* Add Search Input */}
				<div className="search-container session-search">
					<input
						type="text"
						placeholder="Search sessions..."
						value={sessionSearchTerm}
						onChange={(e) => setSessionSearchTerm(e.target.value)}
						className="search-input"
					/>
				</div>

				<ul>
					{/* --- Create New Session Row --- */}
					<li
						className={`session-item create-session-row ${
							isCreating ? "editing" : ""
						}`}
					>
						{isCreating ? (
							<form
								onSubmit={handleSaveNewSession}
								className="edit-session-form"
							>
								<input
									ref={createInputRef}
									type="text"
									value={newSessionName}
									onChange={(e) =>
										setNewSessionName(e.target.value)
									}
									placeholder="New session name"
									aria-label="New session name"
									required
								/>
								<div className="confirmation-buttons">
									<button
										type="submit"
										className="save-inline-button"
									>
										Save
									</button>
									<button
										type="button"
										onClick={handleCancelCreating}
										className="cancel-inline-button"
									>
										Cancel
									</button>
								</div>
							</form>
						) : (
							<div
								className="create-session-content"
								onClick={handleStartCreating}
								role="button"
								tabIndex={0}
							>
								<FaPlus className="create-icon" />
								<span>Create New Session</span>
							</div>
						)}
					</li>
					{/* --- Existing Sessions --- */}
					{filteredSessions.length > 0
						? filteredSessions.map((session, index) => (
								<li
									key={session.id}
									className={`session-item ${
										currentSessionId === session.id
											? "active-session"
											: ""
									}`}
									style={
										{
											"--item-index": index,
										} as React.CSSProperties
									}
								>
									{editingSessionId === session.id ? (
										<div className="edit-session-form">
											<input
												type="text"
												value={editSessionName}
												onChange={(e) =>
													setEditSessionName(
														e.target.value
													)
												}
											/>
											<button onClick={handleEditSession}>
												Save
											</button>
											<button
												onClick={() => {
													setEditingSessionId(null);
													setError(null);
												}}
											>
												Cancel
											</button>
										</div>
									) : deletingSessionId === session.id ? (
										<div className="delete-confirmation">
											<span>
												Delete "{session.name}"?
											</span>
											<div className="confirmation-buttons">
												<button
													onClick={() =>
														handleDeleteSession(
															session.id
														)
													}
													className="confirm-delete"
												>
													Yes, Delete
												</button>
												<button
													onClick={
														cancelDeleteSession
													}
													className="cancel-delete"
												>
													Cancel
												</button>
											</div>
										</div>
									) : (
										<>
											<span className="session-name">
												{session.name}
												{currentSessionId ===
													session.id && (
													<span className="active-indicator">
														{" "}
														(Loaded)
													</span>
												)}
											</span>
											<div className="session-actions">
												<button
													onClick={() =>
														onLoadSession(
															session.id
														)
													}
													className="load-button"
													title={`Load session: ${session.name}`}
													disabled={
														currentSessionId ===
														session.id
													}
												>
													Load
												</button>
												{onEditSession && (
													<button
														onClick={() =>
															startEditingSession(
																session
															)
														}
														className="edit-button"
														title="Rename session"
													>
														Rename
													</button>
												)}
												{onDeleteSession && (
													<button
														onClick={() =>
															confirmDeleteSession(
																session.id
															)
														}
														className="remove-button"
														title="Delete session"
													>
														Delete
													</button>
												)}
											</div>
										</>
									)}
								</li>
						  ))
						: !isCreating && (
								<li className="no-sessions-message-item">
									<p className="no-sessions-message">
										{sessionSearchTerm
											? "No sessions match your search."
											: "No sessions saved yet."}
									</p>
								</li>
						  )}
				</ul>
			</div>
		</div>
	);
};

export default SessionManager;
