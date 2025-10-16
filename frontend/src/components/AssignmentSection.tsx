import React, { useState, useMemo, useEffect } from "react";
import AddItemForm from "./AddItemForm"; // Import AddItemForm

interface Item {
	id: number;
	name: string;
	price: number;
	assigned_users: string[];
}

interface AssignmentSectionProps {
	items: Item[];
	users: string[];
	onUpdateAssignment: (
		itemId: number,
		userName: string,
		checked: boolean
	) => void;
	onEditItem?: (id: number, name: string, price: number) => void;
	onRemoveItem?: (id: number) => void;
	onAddItem: (name: string, price: number) => void;
	onClearItems?: () => void;
}

type SortKey = "name" | "price" | null;
type SortDirection = "asc" | "desc" | null;

interface SortConfig {
	key: SortKey;
	direction: SortDirection;
}

const AssignmentSection: React.FC<AssignmentSectionProps> = ({
	items,
	users,
	onUpdateAssignment,
	onEditItem,
	onRemoveItem,
	onAddItem,
	onClearItems,
}) => {
	const [editingItemId, setEditingItemId] = useState<number | null>(null);
	const [editItemName, setEditItemName] = useState<string>("");
	const [editItemPrice, setEditItemPrice] = useState<string>("");

	// --- Pagination & Sorting State ---
	const [currentPage, setCurrentPage] = useState(1);
	const [itemsPerPage, setItemsPerPage] = useState(10); // Default items per page
	const [sortConfig, setSortConfig] = useState<SortConfig>({
		key: null,
		direction: null,
	});
	const [itemSearchTerm, setItemSearchTerm] = useState(""); // State for item search
	// ---

	const handleCheckboxChange = (
		itemId: number,
		userName: string,
		checked: boolean
	) => {
		onUpdateAssignment(itemId, userName, checked);
	};

	const startEditing = (item: Item) => {
		setEditingItemId(item.id);
		setEditItemName(item.name);
		setEditItemPrice(item.price.toString());
	};

	const cancelEditing = () => {
		setEditingItemId(null);
	};

	const saveEdit = (id: number) => {
		if (
			editItemName.trim() &&
			!isNaN(parseFloat(editItemPrice)) &&
			parseFloat(editItemPrice) >= 0 &&
			onEditItem
		) {
			onEditItem(id, editItemName.trim(), parseFloat(editItemPrice));
			setEditingItemId(null);
			setEditItemName("");
			setEditItemPrice("");
		}
	};

	// --- Filtering Logic ---
	const filteredItems = useMemo(() => {
		if (!itemSearchTerm) {
			return items; // Return all items if search is empty
		}
		return items.filter((item) =>
			item.name.toLowerCase().includes(itemSearchTerm.toLowerCase())
		);
	}, [items, itemSearchTerm]);
	// ---

	// --- Sorting Logic ---
	const sortedItems = useMemo(() => {
		// If no sort key is set, return the filtered items array
		if (sortConfig.key === null || sortConfig.direction === null) {
			return [...filteredItems]; // Return a copy to avoid potential mutation issues downstream
		}

		// Otherwise, sort a copy of the filtered items array
		let sortableItems = [...filteredItems];
		sortableItems.sort((a, b) => {
			const aValue = a[sortConfig.key!];
			const bValue = b[sortConfig.key!];

			if (aValue < bValue) {
				return sortConfig.direction === "asc" ? -1 : 1;
			}
			if (aValue > bValue) {
				return sortConfig.direction === "asc" ? 1 : -1;
			}
			return 0;
		});
		return sortableItems;
	}, [filteredItems, sortConfig]); // Depend on filtered items and sort config
	// ---

	// --- Pagination Logic ---
	const totalItems = sortedItems.length; // Use length of sorted (filtered) items
	const totalPages = Math.ceil(totalItems / itemsPerPage);

	const paginatedItems = useMemo(() => {
		const startIndex = (currentPage - 1) * itemsPerPage;
		return sortedItems.slice(startIndex, startIndex + itemsPerPage); // Paginate the sorted (filtered) items
	}, [sortedItems, currentPage, itemsPerPage]); // Depend on sortedItems

	// Reset page to 1 when search term or items per page changes
	useEffect(() => {
		setCurrentPage(1);
	}, [itemSearchTerm, itemsPerPage]);

	const handlePageChange = (newPage: number) => {
		if (newPage >= 1 && newPage <= totalPages) {
			setCurrentPage(newPage);
		}
	};

	const handleItemsPerPageChange = (
		event: React.ChangeEvent<HTMLSelectElement>
	) => {
		const newItemsPerPage = parseInt(event.target.value, 10);
		setItemsPerPage(newItemsPerPage);
		setCurrentPage(1); // Reset to first page when changing items per page
	};

	const requestSort = (key: SortKey) => {
		let direction: SortDirection = "asc";
		let nextKey: SortKey = key; // Use a temporary variable for the next key

		if (sortConfig.key === key && sortConfig.direction === "asc") {
			direction = "desc";
		} else if (sortConfig.key === key && sortConfig.direction === "desc") {
			// Third click: Reset sorting
			direction = null;
			nextKey = null; // Reset the key as well
		}
		// If key is null or different, default is 'asc' (already set)

		setSortConfig({ key: nextKey, direction }); // Update state with potentially null key/direction
		setCurrentPage(1); // Reset to first page on sort change
	};

	const getSortIndicator = (key: SortKey) => {
		if (sortConfig.key !== key) {
			return null; // No indicator
		}
		return sortConfig.direction === "asc" ? " ▲" : " ▼";
	};
	// ---

	// Calculate total price and count from the original items array
	const itemCount = items.length;
	const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

	return (
		<div className="section assignment-section">
			{/* Render AddItemForm at the top */}
			<AddItemForm
				onAddItem={onAddItem}
				onClearItems={onClearItems}
				itemCount={itemCount}
			/>

			{/* Add a divider */}
			<hr className="section-divider" />

			<h2>Assign Items & Manage List</h2>

			{/* --- Controls: Search and Items per page --- */}
			<div className="table-controls-container">
				{" "}
				{/* Wrapper for controls */}
				<div className="search-container item-search">
					<input
						type="text"
						placeholder="Search items..."
						value={itemSearchTerm}
						onChange={(e) => setItemSearchTerm(e.target.value)}
						className="search-input"
					/>
				</div>
				<div className="table-controls">
					<label htmlFor="itemsPerPageSelect">Items per page:</label>
					<select
						id="itemsPerPageSelect"
						value={itemsPerPage}
						onChange={handleItemsPerPageChange}
					>
						<option value={5}>5</option>
						<option value={10}>10</option>
						<option value={25}>25</option>
						<option value={50}>50</option>
						{/* Use totalItems (filtered count) for 'All' option */}
						<option value={totalItems > 0 ? totalItems : 10}>
							All
						</option>
					</select>
				</div>
			</div>
			{/* --- */}

			{/* Conditionally render table only if there are items */}
			{items.length > 0 ? (
				<>
					{/* Render table using paginatedItems */}
					{paginatedItems.length > 0 ? (
						<table className="assignment-table">
							<colgroup>
								<col className="item-col" />
								<col className="price-col" />
								{users.map((user) => (
									<col key={user} className="user-col" />
								))}
								<col className="actions-col" />
							</colgroup>
							<thead>
								<tr>
									<th
										onClick={() => requestSort("name")}
										className="sortable-header"
									>
										Item{getSortIndicator("name")}
									</th>
									<th
										onClick={() => requestSort("price")}
										className="sortable-header price-header"
									>
										Price{getSortIndicator("price")}
									</th>
									{users.map((user) => (
										<th key={user} className="user-header">
											{user}
										</th>
									))}
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{paginatedItems.map((item) => (
									<tr
										key={item.id}
										className={
											editingItemId === item.id
												? "editing-row"
												: ""
										}
									>
										{editingItemId === item.id ? (
											<>
												{/* Inline edit cells */}
												<td>
													<input
														type="text"
														value={editItemName}
														onChange={(e) =>
															setEditItemName(
																e.target.value
															)
														}
														className="inline-edit-input"
														placeholder="Item name"
													/>
												</td>
												<td>
													<input
														type="number"
														value={editItemPrice}
														onChange={(e) =>
															setEditItemPrice(
																e.target.value
															)
														}
														className="inline-edit-input price-input"
														step="0.01"
														min="0"
														placeholder="Price"
													/>
												</td>
												{/* Span across user columns */}
												<td colSpan={users.length}></td>
												<td className="actions-cell">
													{/* Save/Cancel buttons */}
													<button
														onClick={() =>
															saveEdit(item.id)
														}
														className="save-inline-button"
														type="button"
													>
														Save
													</button>
													<button
														onClick={cancelEditing}
														className="cancel-inline-button"
														type="button"
													>
														Cancel
													</button>
												</td>
											</>
										) : (
											<>
												<td>{item.name}</td>
												<td>
													${item.price.toFixed(2)}
												</td>
												{users.map((user) => (
													<td
														key={user}
														className="user-cell"
													>
														<input
															type="checkbox"
															checked={item.assigned_users.includes(
																user
															)}
															onChange={(e) =>
																handleCheckboxChange(
																	item.id,
																	user,
																	e.target
																		.checked
																)
															}
															aria-label={`Assign ${item.name} to ${user}`}
														/>
													</td>
												))}
												<td className="actions-cell">
													<button
														onClick={() =>
															startEditing(item)
														}
														className="edit-button"
														type="button"
													>
														Edit
													</button>
													{onRemoveItem && (
														<button
															onClick={() =>
																onRemoveItem(
																	item.id
																)
															}
															className="remove-button"
															type="button"
														>
															Delete
														</button>
													)}
												</td>
											</>
										)}
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<p className="no-items-message">
							No items match your search.
						</p>
					)}

					{/* --- Pagination Controls --- */}
					{totalPages > 1 && (
						<div className="pagination-controls">
							<button
								onClick={() =>
									handlePageChange(currentPage - 1)
								}
								disabled={currentPage === 1}
							>
								&laquo; Previous
							</button>
							<span>
								Page {currentPage} of {totalPages}
							</span>
							<button
								onClick={() =>
									handlePageChange(currentPage + 1)
								}
								disabled={currentPage === totalPages}
							>
								Next &raquo;
							</button>
						</div>
					)}
					{/* --- */}
				</>
			) : (
				<p className="no-items-message">No items added yet.</p>
			)}

			<div className="items-summary">
				<p>
					<strong>Total Items:</strong> {itemCount}
				</p>
				<p>
					<strong>Total Price:</strong> ${totalPrice.toFixed(2)}
				</p>
			</div>
		</div>
	);
};

export default AssignmentSection;
