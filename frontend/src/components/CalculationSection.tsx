import React, { useState } from "react";

interface CalculationSectionProps {
	onCalculate: () => Promise<Record<string, number>>;
	users: string[];
}

const CalculationSection: React.FC<CalculationSectionProps> = ({
	onCalculate,
	users,
}) => {
	const [totals, setTotals] = useState<Record<string, number> | null>(null); // Use null initially
	const [calculating, setCalculating] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null); // Add local error state

	const handleCalculate = async () => {
		setCalculating(true);
		setError(null); // Clear previous errors
		setTotals(null); // Clear previous totals
		try {
			const calculatedTotals = await onCalculate();
			// Ensure calculatedTotals is a non-null object before setting state
			if (calculatedTotals && typeof calculatedTotals === "object") {
				setTotals(calculatedTotals);
			} else {
				// Handle cases where API might return null/undefined/non-object
				setTotals({}); // Set to empty object if calculation returned nothing valid
				console.warn(
					"Calculation returned invalid data:",
					calculatedTotals
				);
			}
		} catch (err: any) {
			console.error("Error calculating totals:", err);
			// Use a local error state instead of relying on parent or alerts
			setError(
				err.message || "Calculation failed. Check console for details."
			);
			setTotals(null); // Ensure totals are null on error
		} finally {
			setCalculating(false);
		}
	};

	// Determine if there are valid totals to display
	const hasValidTotals =
		totals && typeof totals === "object" && Object.keys(totals).length > 0;
	// Determine if calculation has been run and resulted in empty totals
	const isEmptyResult =
		totals &&
		typeof totals === "object" &&
		Object.keys(totals).length === 0;

	return (
		// Add class if not already present
		<div className="section calculation-section">
			<h2>Calculate Totals</h2>
			<button
				onClick={handleCalculate}
				disabled={calculating || users.length === 0}
			>
				{calculating ? "Calculating..." : "Calculate"}
			</button>

			{/* Display Loading State */}
			{calculating && (
				<div className="loading" style={{ marginTop: "15px" }}>
					<div
						className="loading-spinner"
						style={{ width: "24px", height: "24px" }}
					></div>
					<p>Calculating totals...</p>
				</div>
			)}

			{/* Display Error State */}
			{error && !calculating && (
				<div className="error-message" style={{ marginTop: "15px" }}>
					<p>Error: {error}</p>
					{/* Optional: Add a button to clear the error */}
					{/* <button onClick={() => setError(null)}>Dismiss</button> */}
				</div>
			)}

			{/* Display Results Section */}
			{!calculating &&
				!error && ( // Only show results area if not loading and no error
					<div className="results" style={{ marginTop: "15px" }}>
						<h3>Totals per User:</h3>
						{
							hasValidTotals ? (
								<ul>
									{Object.entries(totals).map(
										([user, total]) => (
											<li
												key={user}
												style={{
													animation: "none",
													opacity: 1,
												}}
											>
												{" "}
												{/* Override animation for results */}
												{user}: ${total.toFixed(2)}
											</li>
										)
									)}
								</ul>
							) : isEmptyResult ? (
								<p>
									No expenses assigned or calculation resulted
									in zero totals.
								</p>
							) : totals === null && users.length > 0 ? ( // Initial state after component mount
								<p>Click 'Calculate' to see totals.</p>
							) : users.length === 0 ? (
								<p>Add users first.</p>
							) : null /* Should not happen, but covers edge cases */
						}
					</div>
				)}
		</div>
	);
};

export default CalculationSection;
