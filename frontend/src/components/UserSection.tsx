import React, { useState } from "react";

interface UserSectionProps {
	users: string[];
	onAddUser: (name: string) => void;
	onRemoveUser?: (name: string) => void;
	onEditUser?: (oldName: string, newName: string) => void;
}

const UserSection: React.FC<UserSectionProps> = ({
	users,
	onAddUser,
	onRemoveUser,
	onEditUser,
}) => {
	const [newUserName, setNewUserName] = useState<string>("");
	const [editingUser, setEditingUser] = useState<string | null>(null);
	const [editUserName, setEditUserName] = useState<string>("");

	const handleAddUser = (e: React.FormEvent) => {
		e.preventDefault();
		if (newUserName.trim()) {
			onAddUser(newUserName.trim());
			setNewUserName("");
		}
	};

	const startEditing = (userName: string) => {
		setEditingUser(userName);
		setEditUserName(userName);
	};

	const cancelEditing = () => {
		setEditingUser(null);
	};

	const saveEdit = (oldName: string) => {
		if (editUserName.trim() && onEditUser && editUserName !== oldName) {
			onEditUser(oldName, editUserName.trim());
			setEditingUser(null);
		} else if (editUserName === oldName) {
			setEditingUser(null); // Just cancel if name didn't change
		}
	};

	return (
		<div className="section">
			<h2>Users</h2>
			<form onSubmit={handleAddUser}>
				<input
					type="text"
					value={newUserName}
					onChange={(e) => setNewUserName(e.target.value)}
					placeholder="Enter user name"
				/>
				<button type="submit">Add User</button>
			</form>
			{users.length > 0 ? (
				<ul className="users-list">
					{users.map((user, index) => (
						<li
							key={index}
							style={
								{ "--item-index": index } as React.CSSProperties
							}
						>
							{editingUser === user ? (
								<div className="edit-user-form">
									<input
										type="text"
										value={editUserName}
										onChange={(e) =>
											setEditUserName(e.target.value)
										}
										placeholder="User name"
									/>
									<button onClick={() => saveEdit(user)}>
										Save
									</button>
									<button onClick={cancelEditing}>
										Cancel
									</button>
								</div>
							) : (
								<>
									<div className="user-content">{user}</div>
									<div className="user-actions">
										<button
											onClick={() => startEditing(user)}
											className="edit-button"
										>
											Edit
										</button>
										{onRemoveUser && (
											<button
												onClick={() =>
													onRemoveUser(user)
												}
												className="remove-button"
											>
												Remove
											</button>
										)}
									</div>
								</>
							)}
						</li>
					))}
				</ul>
			) : (
				<p>No users added yet.</p>
			)}
		</div>
	);
};

export default UserSection;
