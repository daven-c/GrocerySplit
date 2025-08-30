import React, { useState } from "react";

interface AddItemFormProps {
	onAddItem: (name: string, price: number) => void;
	onClearItems?: () => void;
	itemCount: number;
}

const AddItemForm: React.FC<AddItemFormProps> = ({
	onAddItem,
	onClearItems,
	itemCount,
}) => {
	const [newItemName, setNewItemName] = useState<string>("");
	const [newItemPrice, setNewItemPrice] = useState<string>("");

	const handleAddItem = (e: React.FormEvent) => {
		e.preventDefault();
		if (
			newItemName.trim() &&
			!isNaN(parseFloat(newItemPrice)) &&
			parseFloat(newItemPrice) >= 0 // Allow 0 price
		) {
			onAddItem(newItemName.trim(), parseFloat(newItemPrice));
			setNewItemName("");
			setNewItemPrice("");
		}
	};

	return (
		<div className="section add-item-section">
			<h2>Add New Item</h2>
			<form onSubmit={handleAddItem} className="add-item-form">
				<input
					type="text"
					value={newItemName}
					onChange={(e) => setNewItemName(e.target.value)}
					placeholder="Item name"
					required
				/>
				<input
					type="number"
					value={newItemPrice}
					onChange={(e) => setNewItemPrice(e.target.value)}
					placeholder="Price"
					step="0.01"
					min="0"
					required
				/>
				<button type="submit">Add Item</button>
				{itemCount > 0 && onClearItems && (
					<button
						type="button"
						className="clear-all-button"
						onClick={onClearItems}
						style={{ marginLeft: "auto" }} // Push clear button to the right
					>
						Clear List
					</button>
				)}
			</form>
		</div>
	);
};

export default AddItemForm;
