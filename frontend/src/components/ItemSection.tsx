import React, { useState } from "react";

interface Item {
	id: number;
	name: string;
	price: number;
	assigned_users: string[];
}

interface ItemSectionProps {
	items: Item[];
	onAddItem: (name: string, price: number) => void;
	onRemoveItem: (id: number) => void;
	onEditItem?: (id: number, name: string, price: number) => void;
	onClearItems?: () => void;
}

const ItemSection: React.FC<ItemSectionProps> = ({
	items,
	onAddItem,
	onRemoveItem,
	onEditItem,
	onClearItems,
}) => {
	const [newItemName, setNewItemName] = useState<string>("");
	const [newItemPrice, setNewItemPrice] = useState<string>("");
	const [editingItemId, setEditingItemId] = useState<number | null>(null);
	const [editItemName, setEditItemName] = useState<string>("");
	const [editItemPrice, setEditItemPrice] = useState<string>("");

	const handleAddItem = (e: React.FormEvent) => {
		e.preventDefault();
		if (
			newItemName.trim() &&
			!isNaN(parseFloat(newItemPrice)) &&
			parseFloat(newItemPrice) > 0
		) {
			onAddItem(newItemName.trim(), parseFloat(newItemPrice));
			setNewItemName("");
			setNewItemPrice("");
		}
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
			parseFloat(editItemPrice) > 0 &&
			onEditItem
		) {
			onEditItem(id, editItemName.trim(), parseFloat(editItemPrice));
			setEditingItemId(null);
		}
	};

	// Calculate total price and count
	const itemCount = items.length;
	const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

	return (
		<div className="section">
			<h2>Items</h2>
			<form onSubmit={handleAddItem}>
				<input
					type="text"
					value={newItemName}
					onChange={(e) => setNewItemName(e.target.value)}
					placeholder="Item name"
				/>
				<input
					type="number"
					value={newItemPrice}
					onChange={(e) => setNewItemPrice(e.target.value)}
					placeholder="Price"
					step="0.01"
					min="0"
				/>
				<button type="submit">Add Item</button>
			</form>
			{items.length > 0 ? (
				<>
					<div className="list-actions">
						<button
							type="button"
							className="clear-all-button"
							onClick={onClearItems}
						>
							Clear List
						</button>
					</div>
					<ul>
						{items.map((item, index) => (
							<li
								key={item.id}
								style={
									{
										"--item-index": index,
									} as React.CSSProperties
								}
							>
								{editingItemId === item.id ? (
									<div className="edit-item-form">
										<input
											type="text"
											value={editItemName}
											onChange={(e) =>
												setEditItemName(e.target.value)
											}
											placeholder="Item name"
										/>
										<input
											type="number"
											value={editItemPrice}
											onChange={(e) =>
												setEditItemPrice(e.target.value)
											}
											placeholder="Price"
											step="0.01"
											min="0"
										/>
										<button
											onClick={() => saveEdit(item.id)}
										>
											Save
										</button>
										<button onClick={cancelEditing}>
											Cancel
										</button>
									</div>
								) : (
									<>
										<div className="item-content">
											{item.name} - $
											{item.price.toFixed(2)}
										</div>
										<div className="item-actions">
											<button
												onClick={() =>
													startEditing(item)
												}
												className="edit-button"
											>
												Edit
											</button>
											<button
												onClick={() =>
													onRemoveItem(item.id)
												}
												className="remove-button"
											>
												Remove
											</button>
										</div>
									</>
								)}
							</li>
						))}
					</ul>
					<div className="items-summary">
						<p>
							<strong>Total Items:</strong> {itemCount}
						</p>
						<p>
							<strong>Total Price:</strong> $
							{totalPrice.toFixed(2)}
						</p>
					</div>
				</>
			) : (
				<p>No items added yet.</p>
			)}
		</div>
	);
};

export default ItemSection;
